// js/sync.js
// Orquestra a sincronização entre o IndexedDB local e o arquivo de backup
// vinculado no dispositivo. Não conhece a UI diretamente: expõe estado via
// callback (onStateChange) para quem instanciar (app.js) atualizar a tela.

import * as storage from './storage.js';
import * as backup from './backup.js';

const AUTO_WRITE_DEBOUNCE_MS = 1500;

export class SyncManager {
    constructor({ onStateChange } = {}) {
        this.handle = null;
        this.dirty = false;
        this.mobileNeedsSync = false;
        this.timer = null;
        this.state = 'checking';
        this.onStateChange = onStateChange || (() => {});
    }

    setState(state) {
        this.state = state;
        this._emit();
    }

    _emit() {
        this.onStateChange(this.state, this.dirty || this.mobileNeedsSync);
    }

    mergeNotesById(listA, listB) {
        const map = new Map();
        (listA || []).forEach((note) => map.set(note.id, note));
        (listB || []).forEach((note) => {
            const existing = map.get(note.id);
            if (!existing || (note.updatedAt || 0) > (existing.updatedAt || 0)) {
                map.set(note.id, note);
            }
        });
        return Array.from(map.values());
    }

    // Chamado uma vez, na inicialização do app. Se já existir um arquivo
    // vinculado com permissão concedida, verifica e sincroniza silenciosamente,
    // sem nenhuma interação do usuário.
    async init() {
        if (!backup.isSupported()) {
            this.setState('unsupported');
            return;
        }

        try {
            const handle = await backup.getLinkedHandle(false);
            if (handle) {
                this.handle = handle;
                await this.syncFromFile();
                this.setState('linked');
            } else {
                this.setState('not-linked');
            }
        } catch (error) {
            console.warn('Erro ao iniciar sincronização:', error);
            this.setState('error');
        }
    }

    // Lê o arquivo vinculado, mescla com as notas locais (a nota com
    // updatedAt mais recente vence) e regrava o arquivo com o resultado.
    async syncFromFile() {
        if (!this.handle) return;

        const backupData = await backup.readBackup(this.handle);

        if (!backupData) {
            // Arquivo vazio (acabou de ser criado): grava o estado atual nele.
            await this.flush(true);
            return { merged: false, notesCount: 0 };
        }

        const localNotes = await storage.getAllNotes();
        const fileNotes = await storage.importImagesFromBackup(backupData);
        const merged = this.mergeNotesById(localNotes, fileNotes);

        for (const note of merged) {
            await storage.saveNote(note);
        }

        await this.flush(true);
        return { merged: true, notesCount: merged.length };
    }

    // Chamado a cada alteração de nota (criar/editar/excluir/autosave).
    // Em navegadores com arquivo vinculado, agenda uma gravação automática
    // (debounce). Sem arquivo vinculado (mobile/sem suporte), apenas marca
    // que há alterações pendentes de sincronização manual.
    notifyChanged() {
        if (this.handle) {
            this.dirty = true;
            this.state = 'pending';
            this._emit();
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.flush(), AUTO_WRITE_DEBOUNCE_MS);
        } else {
            this.mobileNeedsSync = true;
            this._emit();
        }
    }

    async flush(force = false) {
        if (!this.handle) return;
        if (!this.dirty && !force) return;
        try {
            const backupData = await storage.exportFullBackup();
            await backup.writeBackup(this.handle, backupData);
            this.dirty = false;
            this.setState('linked');
        } catch (error) {
            console.warn('Erro ao gravar backup automático:', error);
            this.setState('error');
        }
    }

    async linkNew() {
        const handle = await backup.linkNewFile();
        this.handle = handle;
        await this.flush(true);
        this.setState('linked');
    }

    async linkExisting() {
        const handle = await backup.linkExistingFile();
        this.handle = handle;
        const result = await this.syncFromFile();
        this.setState('linked');
        return result;
    }

    // Fluxo de sincronização de um toque para navegadores sem File System
    // Access API: abre o seletor de arquivo, mescla com as notas locais e
    // baixa automaticamente uma versão atualizada.
    async quickSyncFallback() {
        const backupData = await backup.pickAndReadBackupFallback();
        const localNotes = await storage.getAllNotes();
        const fileNotes = await storage.importImagesFromBackup(backupData);
        const merged = this.mergeNotesById(localNotes, fileNotes);

        for (const note of merged) {
            await storage.saveNote(note);
        }

        const updatedBackup = await storage.exportFullBackup();
        backup.downloadBackup(updatedBackup, 'backup-memorias-positivas.json');

        this.mobileNeedsSync = false;
        this._emit();
        return merged;
    }

    isFileSystemSupported() {
        return backup.isSupported();
    }

    hasLinkedFile() {
        return !!this.handle;
    }
}
