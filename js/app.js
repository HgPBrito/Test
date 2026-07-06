// js/app.js
// Orquestrador principal do aplicativo. Mantém o estado em memória (cache das
// notas, tela atual, rascunho em edição) e coordena storage.js (IndexedDB),
// sync.js (backup em arquivo) e ui.js (renderização).

import * as storage from './storage.js';
import { SyncManager } from './sync.js';
import * as ui from './ui.js';
import * as pwa from './pwa.js';
import { downloadBackup } from './backup.js';
import { generateId, showMessage } from './utils.js';

export class MemoryApp {
    constructor() {
        this.notes = [];
        this.currentNoteIndex = 0;
        this.currentYear = new Date().getFullYear();

        // Estado do rascunho em edição/criação (tela "Criar")
        this.draftNoteId = null;
        this.isEditingExisting = false;
        this.editingSnapshot = null; // cópia da nota original (referência, não usada para reverter)
        this.sessionImageIds = []; // imagens inseridas na sessão de edição atual (limpas se cancelar)

        // URLs de objeto (imagens) atualmente exibidas, para revogar quando trocar de nota
        this.carouselObjectUrls = [];
        this.editorObjectUrls = [];

        this.syncManager = new SyncManager({
            onStateChange: (state, needsSync) => {
                ui.updateBackupStatusText(state);
                ui.updateSyncBadge(needsSync);
            }
        });

        this.installPrompt = null;

        this.init();
    }

    async init() {
        try {
            const migration = await storage.migrateFromLocalStorageIfNeeded();
            if (migration.migrated && migration.count > 0) {
                showMessage(`${migration.count} memórias migradas para o novo armazenamento com sucesso!`, 'success');
            }
        } catch (error) {
            console.error('Erro na migração de dados antigos:', error);
        }

        await this.refreshNotes();
        this.setupEventListeners();
        this.updateYearIndicator();
        this.renderCurrentView();

        await this.syncManager.init();
        this.maybeShowOnboarding();

        pwa.registerServiceWorker(() => this.showUpdateBanner());
        this.installPrompt = pwa.setupInstallPrompt((available) => {
            const btn = document.getElementById('installAppBtn');
            if (btn) btn.hidden = !available;
        });
        pwa.setupConnectivityWatcher((isOnline) => this.updateConnectivityBadge(isOnline));
    }

    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) banner.hidden = false;
    }

    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) banner.hidden = true;
    }

    updateConnectivityBadge(isOnline) {
        const badge = document.getElementById('offlineBadge');
        if (badge) badge.hidden = isOnline;
    }

    async refreshNotes() {
        this.notes = await storage.getAllNotes();
    }

    // ===== ONBOARDING (primeira execução) =====

    async maybeShowOnboarding() {
        const seen = await storage.getSetting('onboardingSeen', false);
        if (seen) return;

        if (this.syncManager.isFileSystemSupported()) {
            const modal = document.getElementById('onboardingModal');
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        } else {
            showMessage('Dica: toque no ícone 🔄 no topo para sincronizar suas memórias com um arquivo.', 'info');
            await storage.setSetting('onboardingSeen', true);
        }
    }

    async closeOnboarding(activateBackup) {
        const modal = document.getElementById('onboardingModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        await storage.setSetting('onboardingSeen', true);

        if (activateBackup) {
            try {
                await this.syncManager.linkNew();
                showMessage('Backup automático ativado com sucesso!', 'success');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                    showMessage('Não foi possível ativar o backup agora. Você pode tentar depois pelo menu Backup.', 'error');
                }
            }
        }
    }

    // ===== EVENT LISTENERS =====

    setupEventListeners() {
        // Registrado primeiro e protegido por try-catch: garante que o aviso
        // de atualização sempre funcione mesmo se algo mais abaixo falhar.
        try {
            document.getElementById('updateBannerApply').addEventListener('click', () => {
                this.hideUpdateBanner();
                pwa.applyUpdate();
            });
            document.getElementById('updateBannerDismiss').addEventListener('click', () => {
                this.hideUpdateBanner();
            });
        } catch (error) {
            console.error('Erro ao registrar listeners do banner de atualização:', error);
        }

        document.querySelectorAll('.nav-item[data-screen]').forEach((item) => {
            item.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.switchScreen(screen);
                this.updateNavigation(e.currentTarget);
            });
        });

        document.getElementById('prevNote').addEventListener('click', () => this.previousNote());
        document.getElementById('nextNote').addEventListener('click', () => this.nextNote());

        document.getElementById('saveNote').addEventListener('click', () => this.saveNoteNow());
        document.getElementById('deleteNote').addEventListener('click', () => this.deleteCurrentDraft());
        document.getElementById('cancelEdit').addEventListener('click', () => this.cancelEdit());

        this.setupRichEditor();

        // Backup modal
        document.getElementById('backupBtn').addEventListener('click', () => this.openBackupModal());
        document.getElementById('backupModalClose').addEventListener('click', () => this.closeBackupModal());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('importBtn').addEventListener('click', () => this.triggerImport());
        document.getElementById('importInput').addEventListener('change', (e) => this.importNotes(e));
        document.getElementById('linkNewFileBtn').addEventListener('click', () => this.linkNewBackupFile());
        document.getElementById('linkExistingFileBtn').addEventListener('click', () => this.linkExistingBackupFile());

        document.getElementById('backupModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeBackupModal();
        });

        // Onboarding modal
        document.getElementById('onboardingAccept').addEventListener('click', () => this.closeOnboarding(true));
        document.getElementById('onboardingDismiss').addEventListener('click', () => this.closeOnboarding(false));

        // Botão de sincronização rápida no header
        document.getElementById('headerSyncBtn').addEventListener('click', () => this.quickSync());

        // Acesso rápido entre anos (botão do ano no header)
        document.getElementById('currentYearIndicator').addEventListener('click', () => this.openYearQuickModal());
        document.getElementById('yearQuickModalClose').addEventListener('click', () => this.closeYearQuickModal());
        document.getElementById('yearQuickModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeYearQuickModal();
        });

        // Instalação do PWA
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (this.installPrompt) await this.installPrompt.promptInstall();
            });
        }

        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Sincronização automática ao fechar/minimizar/trocar de app.
        // "visibilitychange" dispara antes da página ser destruída — é o
        // momento mais confiável para uma escrita assíncrona no arquivo.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.syncManager.flush();
        });
        window.addEventListener('pagehide', () => this.syncManager.flush());
    }

    // ===== NAVEGAÇÃO ENTRE TELAS =====

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');

        switch (screenId) {
            case 'view-screen':
                this.renderCarousel();
                break;
            case 'create-screen':
                this.prepareCreateScreen();
                break;
            case 'years-screen':
                this.renderYearsList();
                break;
        }
    }

    updateNavigation(activeItem) {
        document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
        activeItem.classList.add('active');
    }

    // ===== TELA DE VISUALIZAÇÃO (CARROSSEL) =====

    async renderCarousel() {
        const currentYearNotes = this.getCurrentYearNotes();
        const carouselContent = document.getElementById('carouselContent');
        const indicators = document.getElementById('carouselIndicators');

        this.revokeCarouselObjectUrls();

        if (currentYearNotes.length === 0) {
            carouselContent.innerHTML = ui.renderEmptyCarouselState();
            carouselContent.scrollTop = 0;
            indicators.innerHTML = '';
            ui.updateCarouselNavigation(
                document.getElementById('prevNote'),
                document.getElementById('nextNote'),
                false, false
            );
            return;
        }

        if (this.currentNoteIndex >= currentYearNotes.length) {
            this.currentNoteIndex = 0;
        }

        const currentNote = currentYearNotes[this.currentNoteIndex];
        const { html, objectUrls } = await storage.hydrateImages(currentNote.content);
        this.carouselObjectUrls = objectUrls;

        carouselContent.innerHTML = ui.renderNoteCard(currentNote, html);
        carouselContent.scrollTop = 0;

        ui.renderCarouselIndicators(indicators, currentYearNotes.length, this.currentNoteIndex, (index) => {
            this.currentNoteIndex = index;
            this.renderCarousel();
        });

        ui.updateCarouselNavigation(
            document.getElementById('prevNote'),
            document.getElementById('nextNote'),
            this.currentNoteIndex > 0,
            this.currentNoteIndex < currentYearNotes.length - 1
        );

        const editButton = carouselContent.querySelector('.edit-note-btn');
        if (editButton) {
            editButton.addEventListener('click', () => this.editNote(currentNote.id));
        }
    }

    revokeCarouselObjectUrls() {
        this.carouselObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        this.carouselObjectUrls = [];
    }

    revokeEditorObjectUrls() {
        this.editorObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        this.editorObjectUrls = [];
    }

    previousNote() {
        if (this.currentNoteIndex > 0) {
            this.currentNoteIndex--;
            this.renderCarousel();
        }
    }

    nextNote() {
        const total = this.getCurrentYearNotes().length;
        if (this.currentNoteIndex < total - 1) {
            this.currentNoteIndex++;
            this.renderCarousel();
        }
    }

    // ===== TELA DE CRIAÇÃO/EDIÇÃO =====

    prepareCreateScreen() {
        if (!this.isEditingExisting && !this.draftNoteId) {
            this.startNewDraft();
        }
    }

    startNewDraft() {
        this.revokeEditorObjectUrls();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('noteDate').value = today;
        document.getElementById('noteLocation').value = '';
        // Vazio de verdade (sem parágrafo nem texto de exemplo): o placeholder
        // é puramente visual, via CSS (:empty::before), então nunca vira
        // conteúdo real salvo por engano.
        document.getElementById('noteContent').innerHTML = '';
        document.getElementById('deleteNote').style.display = 'none';

        this.draftNoteId = generateId();
        this.isEditingExisting = false;
        this.editingSnapshot = null;
        this.sessionImageIds = [];
    }

    setupRichEditor() {
        const editor = document.getElementById('noteContent');
        const toolbar = document.querySelector('.editor-toolbar');

        toolbar.querySelectorAll('.toolbar-btn[data-command]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                editor.focus();
                document.execCommand(btn.dataset.command, false, null);
                this.updateToolbarState();
            });
        });

        document.getElementById('insertImage').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });

        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.insertImage(e.target.files[0]);
            e.target.value = '';
        });

        editor.addEventListener('mouseup', () => this.updateToolbarState());
        editor.addEventListener('keyup', () => this.updateToolbarState());

        this.setupEmojiPicker();
    }

    setupEmojiPicker() {
        const btn = document.getElementById('insertEmojiBtn');
        const picker = document.getElementById('emojiPicker');

        ui.renderEmojiPicker(picker, (emoji) => {
            this.insertTextAtCursor(emoji);
            this.closeEmojiPicker();
        });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !picker.hidden;
            if (isOpen) {
                this.closeEmojiPicker();
            } else {
                picker.hidden = false;
                btn.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('click', (e) => {
            if (!picker.hidden && !picker.contains(e.target) && e.target !== btn) {
                this.closeEmojiPicker();
            }
        });
    }

    closeEmojiPicker() {
        const btn = document.getElementById('insertEmojiBtn');
        const picker = document.getElementById('emojiPicker');
        picker.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }

    insertTextAtCursor(text) {
        const editor = document.getElementById('noteContent');
        editor.focus();
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            editor.appendChild(document.createTextNode(text));
        }
    }

    updateToolbarState() {
        ['bold', 'italic', 'underline'].forEach((command) => {
            const btn = document.querySelector(`[data-command="${command}"]`);
            if (btn) btn.classList.toggle('active', document.queryCommandState(command));
        });
    }

    async insertImage(file) {
        if (!file || !file.type.startsWith('image/')) {
            showMessage('Por favor, selecione um arquivo de imagem válido.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage('A imagem é muito grande. Máximo 5MB.', 'error');
            return;
        }

        try {
            const imageId = await storage.saveImageBlob(file);
            this.sessionImageIds.push(imageId);
            const objectUrl = URL.createObjectURL(file);
            this.editorObjectUrls.push(objectUrl);

            const img = document.createElement('img');
            img.src = objectUrl;
            img.dataset.imageId = imageId;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.borderRadius = '0.5rem';
            img.style.margin = '1rem 0';

            const editor = document.getElementById('noteContent');
            editor.focus();
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
                const range = selection.getRangeAt(0);
                range.insertNode(img);
                range.collapse(false);
            } else {
                editor.appendChild(img);
            }
        } catch (error) {
            console.error('Erro ao inserir imagem:', error);
            showMessage('Não foi possível inserir a imagem.', 'error');
        }
    }

    buildDraftFromForm() {
        const date = document.getElementById('noteDate').value;
        const location = document.getElementById('noteLocation').value.trim();
        const editor = document.getElementById('noteContent');
        const rawContent = editor.innerHTML;
        const content = storage.stripImageSources(rawContent);
        const hasText = editor.textContent.trim().length > 0;
        const hasImage = !!editor.querySelector('img');

        return { date, location, content, isMeaningful: !!date && (hasText || hasImage) };
    }

    // Único ponto que persiste a nota: cria (na primeira vez) ou atualiza
    // (quando editando). Sem autosave — a pessoa decide quando salvar.
    async saveNoteNow() {
        const { date, location, content, isMeaningful } = this.buildDraftFromForm();

        if (!date) {
            showMessage('Por favor, selecione uma data.', 'error');
            return;
        }
        if (!isMeaningful) {
            showMessage('Por favor, escreva o conteúdo da memória.', 'error');
            return;
        }

        const existing = await storage.getNoteById(this.draftNoteId);
        const noteData = {
            id: this.draftNoteId,
            date,
            location,
            content,
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        await storage.saveNote(noteData);
        await this.refreshNotes();
        this.syncManager.notifyChanged();

        showMessage(this.isEditingExisting ? 'Memória atualizada com sucesso!' : 'Memória criada com sucesso!', 'success');

        this.finishDraftEditing();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    async editNote(noteId) {
        const note = await storage.getNoteById(noteId);
        if (!note) return;

        this.revokeEditorObjectUrls();

        this.draftNoteId = noteId;
        this.isEditingExisting = true;
        this.editingSnapshot = { ...note };
        this.sessionImageIds = [];

        document.getElementById('noteDate').value = note.date;
        document.getElementById('noteLocation').value = note.location || '';

        const { html, objectUrls } = await storage.hydrateImages(note.content);
        this.editorObjectUrls = objectUrls;
        document.getElementById('noteContent').innerHTML = html;
        document.getElementById('deleteNote').style.display = 'inline-flex';

        this.switchScreen('create-screen');
        this.updateNavigation(document.querySelector('[data-screen="create-screen"]'));
    }

    async deleteCurrentDraft() {
        if (!this.isEditingExisting || !this.draftNoteId) return;

        if (!confirm('Tem certeza de que deseja excluir esta memória? Esta ação não pode ser desfeita.')) {
            return;
        }

        await storage.deleteNote(this.draftNoteId);
        await this.refreshNotes();
        this.syncManager.notifyChanged();
        showMessage('Memória excluída com sucesso!', 'success');

        this.finishDraftEditing();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    // "Cancelar": como nada é salvo automaticamente enquanto se digita, só
    // precisamos descartar imagens que tenham sido inseridas nesta sessão de
    // edição (senão ficariam órfãs no IndexedDB, sem nenhuma nota as
    // referenciando).
    async cancelEdit() {
        if (this.sessionImageIds && this.sessionImageIds.length > 0) {
            await storage.deleteImages(this.sessionImageIds);
        }

        this.finishDraftEditing();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
    }

    finishDraftEditing() {
        this.revokeEditorObjectUrls();
        this.draftNoteId = null;
        this.isEditingExisting = false;
        this.editingSnapshot = null;
        this.sessionImageIds = [];
        this.closeEmojiPicker();
    }

    // ===== TELA DE ANOS ANTERIORES =====

    renderYearsList() {
        const container = document.getElementById('yearsList');
        const years = this.getAvailableYears();
        ui.renderYearsList(container, years, (year) => this.viewYearNotes(year));
    }

    getAvailableYears() {
        const counts = {};
        this.notes.forEach((note) => {
            const year = new Date(note.date + 'T00:00:00').getFullYear();
            if (year !== this.currentYear) counts[year] = (counts[year] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([year, count]) => ({ year: parseInt(year, 10), count }))
            .sort((a, b) => b.year - a.year);
    }

    // Igual a getAvailableYears(), mas inclui o ano selecionado no momento
    // (usado no modal de acesso rápido, onde faz sentido ver e re-selecionar
    // o próprio ano atual).
    getAllYearsWithCounts() {
        const counts = {};
        this.notes.forEach((note) => {
            const year = new Date(note.date + 'T00:00:00').getFullYear();
            counts[year] = (counts[year] || 0) + 1;
        });
        if (!(this.currentYear in counts)) {
            counts[this.currentYear] = 0;
        }
        return Object.entries(counts)
            .map(([year, count]) => ({ year: parseInt(year, 10), count }))
            .sort((a, b) => b.year - a.year);
    }

    openYearQuickModal() {
        const modal = document.getElementById('yearQuickModal');
        const list = document.getElementById('yearQuickList');
        const years = this.getAllYearsWithCounts();

        ui.renderYearQuickList(list, years, this.currentYear, (year) => {
            this.closeYearQuickModal();
            this.viewYearNotes(year);
        });

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    closeYearQuickModal() {
        const modal = document.getElementById('yearQuickModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    viewYearNotes(year) {
        this.currentYear = year;
        this.currentNoteIndex = 0;
        this.updateYearIndicator();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    // ===== BACKUP (MODAL) =====

    openBackupModal() {
        const modal = document.getElementById('backupModal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        ui.updateBackupStatusText(this.syncManager.state);

        const firstFocusable = modal.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }

    closeBackupModal() {
        const modal = document.getElementById('backupModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    async exportNotes() {
        if (this.notes.length === 0) {
            showMessage('Não há memórias para exportar.', 'error');
            return;
        }
        const backupData = await storage.exportFullBackup();
        downloadBackup(backupData, `memorias-positivas-${new Date().toISOString().split('T')[0]}.json`);
        showMessage('Memórias exportadas com sucesso!', 'success');
        this.closeBackupModal();
    }

    triggerImport() {
        document.getElementById('importInput').click();
    }

    importNotes(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.notes || !Array.isArray(data.notes)) {
                    throw new Error('Estrutura de arquivo inválida');
                }

                const validNotes = data.notes.filter((note) => note.id && note.date && note.content);
                if (validNotes.length === 0) {
                    throw new Error('Nenhuma memória válida encontrada no arquivo');
                }

                const fileNotes = await storage.importImagesFromBackup({ notes: validNotes, images: data.images });
                const merged = this.syncManager.mergeNotesById(this.notes, fileNotes);
                for (const note of merged) {
                    await storage.saveNote(note);
                }
                await this.refreshNotes();
                this.syncManager.notifyChanged();

                showMessage(`${validNotes.length} memórias importadas e mescladas com sucesso!`, 'success');

                this.currentYear = new Date().getFullYear();
                this.currentNoteIndex = 0;
                this.updateYearIndicator();
                this.renderCurrentView();
                this.closeBackupModal();
            } catch (error) {
                console.error('Erro ao importar:', error);
                showMessage('Erro ao importar arquivo. Verifique se é um arquivo válido.', 'error');
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    }

    async linkNewBackupFile() {
        try {
            await this.syncManager.linkNew();
            showMessage('Arquivo de backup criado e vinculado com sucesso!', 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                showMessage('Não foi possível criar o arquivo de backup.', 'error');
            }
        }
    }

    async linkExistingBackupFile() {
        try {
            await this.syncManager.linkExisting();
            await this.refreshNotes();
            this.renderCurrentView();
            showMessage('Arquivo de backup vinculado e sincronizado!', 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                showMessage('Não foi possível vincular o arquivo. Verifique se é um JSON de backup válido.', 'error');
            }
        }
    }

    // Botão de sincronização rápida no header (funciona em qualquer navegador)
    async quickSync() {
        ui.setSyncButtonSpinning(true);
        try {
            if (this.syncManager.isFileSystemSupported()) {
                if (!this.syncManager.hasLinkedFile()) {
                    showMessage('Nenhum arquivo vinculado ainda. Abra o menu Backup para vincular um arquivo primeiro.', 'warning');
                    this.openBackupModal();
                    return;
                }
                await this.syncManager.syncFromFile();
                await this.refreshNotes();
                this.renderCurrentView();
                showMessage('Sincronizado com sucesso!', 'success');
            } else {
                await this.syncManager.quickSyncFallback();
                await this.refreshNotes();
                this.renderCurrentView();
                showMessage('Memórias mescladas! Um arquivo atualizado foi baixado — substitua o backup antigo por ele.', 'success');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Erro ao sincronizar:', error);
                showMessage('Não foi possível sincronizar agora.', 'error');
            }
        } finally {
            ui.setSyncButtonSpinning(false);
        }
    }

    // ===== FUNÇÕES AUXILIARES =====

    getCurrentYearNotes() {
        return this.notes
            .filter((note) => new Date(note.date + 'T00:00:00').getFullYear() === this.currentYear)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    updateYearIndicator() {
        document.getElementById('currentYearIndicator').textContent = this.currentYear;
    }

    renderCurrentView() {
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) return;
        if (activeScreen.id === 'view-screen') this.renderCarousel();
        if (activeScreen.id === 'years-screen') this.renderYearsList();
    }

    handleKeyboardShortcuts(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'create-screen') this.saveNoteNow();
        }

        if (e.key === 'Escape') {
            const backupModal = document.getElementById('backupModal');
            if (backupModal.classList.contains('active')) this.closeBackupModal();

            const yearModal = document.getElementById('yearQuickModal');
            if (yearModal.classList.contains('active')) this.closeYearQuickModal();
        }

        if (document.querySelector('#view-screen.active')) {
            if (e.key === 'ArrowLeft') this.previousNote();
            else if (e.key === 'ArrowRight') this.nextNote();
        }
    }
}
