// js/backup.js
// Responsável por vincular um arquivo real do dispositivo (File System
// Access API) e por ler/escrever nele. Também oferece um fallback para
// navegadores sem essa API (todo iOS Safari, a maioria dos Android, Firefox):
// nesses casos não existe forma de ler/escrever em um arquivo do sistema sem
// uma ação explícita do usuário a cada operação, então o fallback abre um
// seletor de arquivo e, em seguida, baixa o resultado atualizado.

import * as db from './database.js';

const HANDLE_KEY = 'backupFileHandle';

export function isSupported() {
    return typeof window !== 'undefined'
        && 'showOpenFilePicker' in window
        && 'showSaveFilePicker' in window;
}

async function saveHandle(handle) {
    return db.put(db.STORE_NAMES.SYNC, { key: HANDLE_KEY, value: handle });
}

async function getStoredHandle() {
    const record = await db.getById(db.STORE_NAMES.SYNC, HANDLE_KEY);
    return record ? record.value : null;
}

export async function clearHandle() {
    return db.remove(db.STORE_NAMES.SYNC, HANDLE_KEY);
}

async function verifyPermission(handle, readWrite) {
    const options = readWrite ? { mode: 'readwrite' } : { mode: 'read' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
}

export async function linkNewFile(suggestedName) {
    if (!isSupported()) throw new Error('unsupported');
    const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName || 'backup-memorias-positivas.json',
        types: [{
            description: 'Arquivo de backup JSON',
            accept: { 'application/json': ['.json'] }
        }]
    });
    await saveHandle(handle);
    return handle;
}

export async function linkExistingFile() {
    if (!isSupported()) throw new Error('unsupported');
    const [handle] = await window.showOpenFilePicker({
        types: [{
            description: 'Arquivo de backup JSON',
            accept: { 'application/json': ['.json'] }
        }],
        multiple: false
    });
    await saveHandle(handle);
    return handle;
}

// Recupera o arquivo vinculado anteriormente, verificando a permissão sem
// interromper o usuário (usado na checagem automática ao abrir o app).
export async function getLinkedHandle(requestPermissionIfNeeded) {
    if (!isSupported()) return null;
    const handle = await getStoredHandle();
    if (!handle) return null;
    try {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') return handle;
        if (requestPermissionIfNeeded) {
            const granted = await verifyPermission(handle, true);
            return granted ? handle : null;
        }
        return null;
    } catch (error) {
        console.warn('backup: não foi possível verificar permissão do arquivo', error);
        return null;
    }
}

export async function writeBackup(handle, backupData) {
    const ok = await verifyPermission(handle, true);
    if (!ok) throw new Error('permission-denied');
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(backupData, null, 2));
    await writable.close();
}

export async function readBackup(handle) {
    const ok = await verifyPermission(handle, false);
    if (!ok) throw new Error('permission-denied');
    const file = await handle.getFile();
    const text = await file.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
}

export async function getFileName() {
    const handle = await getStoredHandle();
    return handle ? handle.name : null;
}

// ===== FALLBACK PARA NAVEGADORES SEM FILE SYSTEM ACCESS API (mobile) =====

export function pickAndReadBackupFallback() {
    return new Promise((resolve, reject) => {
        let settled = false;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('focus', onFocus);
            if (input.parentNode) input.parentNode.removeChild(input);
            fn(arg);
        };

        function onFocus() {
            // Dá tempo do evento "change" disparar primeiro, caso um
            // arquivo já tenha sido escolhido antes do foco voltar à janela.
            setTimeout(() => {
                finish(reject, new DOMException('Seleção cancelada pelo usuário', 'AbortError'));
            }, 300);
        }

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) {
                finish(reject, new DOMException('Nenhum arquivo selecionado', 'AbortError'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    finish(resolve, data);
                } catch (err) {
                    finish(reject, err);
                }
            };
            reader.onerror = () => finish(reject, reader.error);
            reader.readAsText(file);
        });

        window.addEventListener('focus', onFocus);
        input.click();
    });
}

export function downloadBackup(backupData, filename) {
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'backup-memorias-positivas.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
