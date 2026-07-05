// js/storage.js
// Camada de regras de negócio sobre database.js: CRUD de notas e imagens,
// migração de dados antigos (localStorage) e geração/leitura do backup
// completo (usado tanto pelo arquivo vinculado quanto pela exportação manual).

import * as db from './database.js';
import { generateId, dataUrlToBlob, blobToDataUrl } from './utils.js';

const LEGACY_LOCALSTORAGE_KEY = 'memoryNotes';
const MIGRATION_FLAG_KEY = 'migrationFromLocalStorageDone';

// ===== MIGRAÇÃO DE VERSÃO ANTERIOR (localStorage) =====

export async function migrateFromLocalStorageIfNeeded() {
    const alreadyMigrated = await getSetting(MIGRATION_FLAG_KEY, false);
    if (alreadyMigrated) {
        return { migrated: false, count: 0 };
    }

    let legacyNotes = [];
    try {
        const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
        legacyNotes = raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('Não foi possível ler notas antigas do localStorage:', error);
    }

    if (legacyNotes.length > 0) {
        for (const note of legacyNotes) {
            note.content = await extractBase64ImagesToStore(note.content);
        }
        await db.bulkPut(db.STORE_NAMES.NOTES, legacyNotes);
    }

    await setSetting(MIGRATION_FLAG_KEY, true);
    return { migrated: true, count: legacyNotes.length };
}

export async function extractBase64ImagesToStore(html) {
    if (!html || !html.includes('data:image')) return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const images = Array.from(doc.querySelectorAll('img[src^="data:image"]'));

    for (const img of images) {
        const dataUrl = img.getAttribute('src');
        try {
            const blob = dataUrlToBlob(dataUrl);
            const imageId = generateId();
            await db.put(db.STORE_NAMES.IMAGES, { id: imageId, blob, createdAt: Date.now() });
            img.setAttribute('data-image-id', imageId);
            img.removeAttribute('src');
        } catch (error) {
            console.warn('Falha ao migrar uma imagem embutida:', error);
        }
    }

    return doc.querySelector('div').innerHTML;
}

// ===== NOTAS =====

export async function getAllNotes() {
    return db.getAll(db.STORE_NAMES.NOTES);
}

export async function getNoteById(id) {
    return db.getById(db.STORE_NAMES.NOTES, id);
}

export async function saveNote(note) {
    return db.put(db.STORE_NAMES.NOTES, note);
}

export async function deleteNote(id) {
    const note = await db.getById(db.STORE_NAMES.NOTES, id);
    if (note) {
        const imageIds = extractImageIds(note.content);
        for (const imageId of imageIds) {
            await db.remove(db.STORE_NAMES.IMAGES, imageId);
        }
    }
    return db.remove(db.STORE_NAMES.NOTES, id);
}

export function extractImageIds(html) {
    if (!html || !html.includes('data-image-id')) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    return Array.from(doc.querySelectorAll('img[data-image-id]'))
        .map((img) => img.getAttribute('data-image-id'))
        .filter(Boolean);
}

// ===== IMAGENS =====
// As imagens ficam como Blob em um object store próprio; as notas apenas
// referenciam o id via atributo data-image-id. Isso mantém os registros de
// notas pequenos e a leitura/gravação rápida.

export async function saveImageBlob(blob) {
    const id = generateId();
    await db.put(db.STORE_NAMES.IMAGES, { id, blob, createdAt: Date.now() });
    return id;
}

export async function getImageObjectUrl(imageId) {
    const record = await db.getById(db.STORE_NAMES.IMAGES, imageId);
    if (!record) return null;
    return URL.createObjectURL(record.blob);
}

// Substitui as referências data-image-id de um HTML por URLs de objeto
// prontas para exibição (usado ao renderizar o carrossel e ao abrir o
// editor). Retorna também a lista de URLs criadas, para serem revogadas
// pelo chamador quando não forem mais necessárias (evita vazamento de
// memória).
export async function hydrateImages(html) {
    if (!html || !html.includes('data-image-id')) {
        return { html: html || '', objectUrls: [] };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const images = Array.from(doc.querySelectorAll('img[data-image-id]'));
    const objectUrls = [];

    for (const img of images) {
        const imageId = img.getAttribute('data-image-id');
        try {
            const url = await getImageObjectUrl(imageId);
            if (url) {
                img.setAttribute('src', url);
                objectUrls.push(url);
            }
        } catch (error) {
            console.warn('Falha ao carregar imagem da nota:', error);
        }
    }

    return { html: doc.querySelector('div').innerHTML, objectUrls };
}

// Remove os atributos "src" (geralmente URLs de objeto temporárias) antes de
// persistir o conteúdo da nota, mantendo apenas a referência data-image-id.
export function stripImageSources(html) {
    if (!html || !html.includes('data-image-id')) return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    doc.querySelectorAll('img[data-image-id]').forEach((img) => img.removeAttribute('src'));
    return doc.querySelector('div').innerHTML;
}

export async function deleteImages(imageIds) {
    for (const imageId of imageIds) {
        try {
            await db.remove(db.STORE_NAMES.IMAGES, imageId);
        } catch (error) {
            console.warn(`Falha ao remover imagem órfã ${imageId}:`, error);
        }
    }
}

// ===== CONFIGURAÇÕES (settings) =====

export async function getSetting(key, defaultValue = null) {
    const record = await db.getById(db.STORE_NAMES.SETTINGS, key);
    return record ? record.value : defaultValue;
}

export async function setSetting(key, value) {
    return db.put(db.STORE_NAMES.SETTINGS, { key, value });
}

// ===== BACKUP COMPLETO (usado pelo arquivo vinculado e pela exportação manual) =====
// Diferente do IndexedDB (onde imagens ficam como Blob em um store próprio),
// um arquivo de backup externo precisa ser autocontido: as imagens são
// convertidas para base64 e embutidas no próprio JSON exportado.

export async function exportFullBackup() {
    const notes = await getAllNotes();
    const usedImageIds = new Set();
    notes.forEach((note) => extractImageIds(note.content).forEach((id) => usedImageIds.add(id)));

    const allImages = await db.getAll(db.STORE_NAMES.IMAGES);
    const images = {};
    for (const image of allImages) {
        if (usedImageIds.has(image.id)) {
            images[image.id] = await blobToDataUrl(image.blob);
        }
    }

    return {
        version: '2.0',
        exportDate: new Date().toISOString(),
        notes,
        images
    };
}

// Grava as imagens trazidas por um backup no IndexedDB (idempotente: mesmo
// id sobrescreve o mesmo registro) e devolve a lista de notas do backup,
// para o chamador decidir como mesclar com as notas locais.
//
// Também converte automaticamente notas em formato antigo (backups gerados
// antes desta reescrita, que embutiam imagens em base64 direto no HTML da
// nota) para o novo esquema de referência por data-image-id.
export async function importImagesFromBackup(backupData) {
    const images = backupData && backupData.images && typeof backupData.images === 'object'
        ? backupData.images
        : {};

    for (const [imageId, dataUrl] of Object.entries(images)) {
        try {
            const blob = dataUrlToBlob(dataUrl);
            await db.put(db.STORE_NAMES.IMAGES, { id: imageId, blob, createdAt: Date.now() });
        } catch (error) {
            console.warn(`Falha ao importar imagem ${imageId} do backup:`, error);
        }
    }

    const notes = Array.isArray(backupData && backupData.notes) ? backupData.notes : [];
    for (const note of notes) {
        if (note.content && note.content.includes('data:image')) {
            note.content = await extractBase64ImagesToStore(note.content);
        }
    }

    return notes;
}
