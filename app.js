// js/app.js
// Orquestrador principal do aplicativo. Mantém o estado em memória (cache das
// notas, tela atual, rascunho em edição) e coordena storage.js (IndexedDB),
// sync.js (backup em arquivo) e ui.js (renderização).

import * as storage from './storage.js';
import { SyncManager } from './sync.js';
import * as ui from './ui.js';
import * as pwa from './pwa.js';
import { downloadBackup } from './backup.js';
import { generateId, showMessage, getWeekRange, formatFilterLabel, formatWeekLabel } from './utils.js';

// Presets de cor disponíveis em Configurações → Aparência. Cada um tem
// variantes clara/escura completas definidas em styles.css (seletor
// [data-color-theme]); aqui só precisamos do id, do rótulo e de uma cor
// representativa pra desenhar a bolinha de cada opção.
const COLOR_THEMES = [
    { id: 'terracota', label: 'Terracota', swatch: '#C07940' },
    { id: 'indigo', label: 'Índigo', swatch: '#6366F1' },
    { id: 'salvia', label: 'Sálvia', swatch: '#6B8F5E' },
    { id: 'coral', label: 'Coral', swatch: '#E8735C' },
    { id: 'oceano', label: 'Oceano', swatch: '#3E7C93' },
    { id: 'ameixa', label: 'Ameixa', swatch: '#8B5A8C' }
];

export class MemoryApp {
    constructor() {
        this.notes = [];
        this.currentNoteIndex = 0;
        this.currentFilter = { type: 'year', value: new Date().getFullYear() };
        this.filterBrowse = { level: 'years', selectedYear: null, selectedMonth: null, checked: new Set() };
        this.darkModeEnabled = false;
        this.colorTheme = 'terracota';

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
        await this.initDarkMode();
        await this.initColorTheme();
        this.setupEventListeners();
        this.updateFilterIndicator();
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

        // Configurações (backup + aparência)
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('importBtn').addEventListener('click', () => this.triggerImport());
        document.getElementById('importInput').addEventListener('change', (e) => this.importNotes(e));
        document.getElementById('linkNewFileBtn').addEventListener('click', () => this.linkNewBackupFile());
        document.getElementById('linkExistingFileBtn').addEventListener('click', () => this.linkExistingBackupFile());
        document.getElementById('darkModeToggle').addEventListener('change', (e) => this.setDarkMode(e.target.checked));

        document.querySelectorAll('.settings-accordion-header').forEach((header) => {
            header.addEventListener('click', () => this.toggleSettingsAccordion(header));
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

        // Tela de filtro (navegação em camadas: Anos → Meses → Semanas)
        document.getElementById('filterShowAllBtn').addEventListener('click', () => this.applyFilter({ type: 'all' }));
        document.getElementById('filterApplyBtn').addEventListener('click', () => this.applySelectedBrowseFilter());

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
                this.prepareFilterScreen();
                break;
            case 'settings-screen':
                this.prepareSettingsScreen();
                break;
        }
    }

    updateNavigation(activeItem) {
        document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
        activeItem.classList.add('active');
    }

    // ===== TELA DE VISUALIZAÇÃO (CARROSSEL) =====

    async renderCarousel() {
        const filteredNotes = this.getFilteredNotes();
        const carouselContent = document.getElementById('carouselContent');
        const indicators = document.getElementById('carouselIndicators');

        this.revokeCarouselObjectUrls();

        if (filteredNotes.length === 0) {
            carouselContent.innerHTML = ui.renderEmptyCarouselState();
            carouselContent.scrollTop = 0;
            indicators.innerHTML = '';
            ui.updateCarouselCounter(0, 0);
            ui.updateCarouselNavigation(
                document.getElementById('prevNote'),
                document.getElementById('nextNote'),
                false, false
            );
            return;
        }

        if (this.currentNoteIndex >= filteredNotes.length) {
            this.currentNoteIndex = 0;
        }

        const currentNote = filteredNotes[this.currentNoteIndex];
        const { html, objectUrls } = await storage.hydrateImages(currentNote.content);
        this.carouselObjectUrls = objectUrls;

        carouselContent.innerHTML = ui.renderNoteCard(currentNote, html);
        carouselContent.scrollTop = 0;

        ui.renderCarouselIndicators(indicators, filteredNotes.length, this.currentNoteIndex, (index) => {
            this.currentNoteIndex = index;
            this.renderCarousel();
        });
        ui.updateCarouselCounter(this.currentNoteIndex + 1, filteredNotes.length);

        ui.updateCarouselNavigation(
            document.getElementById('prevNote'),
            document.getElementById('nextNote'),
            this.currentNoteIndex > 0,
            this.currentNoteIndex < filteredNotes.length - 1
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
        const total = this.getFilteredNotes().length;
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

    // ===== TELA DE FILTRO (navegação em camadas: Anos → Meses → Semanas) =====

    prepareFilterScreen() {
        this.filterBrowse = {
            level: 'years',
            selectedYear: null,
            selectedMonth: null,
            checked: new Set()
        };
        this.renderFilterBrowse();
    }

    // Lista de todos os anos com pelo menos uma memória, sempre incluindo o
    // ano corrente (mesmo com 0 memórias, pra sempre haver uma opção óbvia).
    getAllYearsWithCounts() {
        const counts = {};
        this.notes.forEach((note) => {
            const year = new Date(note.date + 'T00:00:00').getFullYear();
            counts[year] = (counts[year] || 0) + 1;
        });
        const thisYear = new Date().getFullYear();
        if (!(thisYear in counts)) counts[thisYear] = 0;

        return Object.entries(counts)
            .map(([year, count]) => ({ year: parseInt(year, 10), count }))
            .sort((a, b) => b.year - a.year);
    }

    getMonthsWithCounts(year) {
        const counts = {};
        this.notes.forEach((note) => {
            const d = new Date(note.date + 'T00:00:00');
            if (d.getFullYear() === year) {
                counts[d.getMonth()] = (counts[d.getMonth()] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([month, count]) => ({ month: parseInt(month, 10), count }))
            .sort((a, b) => a.month - b.month);
    }

    // Semanas (domingo–sábado) que contêm pelo menos uma memória dentro do
    // ano/mês selecionado. Uma semana pode "vazar" um pouco para o mês
    // vizinho (ex: 28/jun–04/jul) — o rótulo mostra as datas exatas, então
    // fica claro pra quem está escolhendo.
    getWeeksWithCounts(year, month) {
        const weekMap = new Map();
        this.notes.forEach((note) => {
            const d = new Date(note.date + 'T00:00:00');
            if (d.getFullYear() === year && d.getMonth() === month) {
                const range = getWeekRange(note.date);
                if (!weekMap.has(range.start)) weekMap.set(range.start, { ...range, count: 0 });
                weekMap.get(range.start).count++;
            }
        });
        return Array.from(weekMap.values()).sort((a, b) => a.start.localeCompare(b.start));
    }

    renderFilterBrowse() {
        const state = this.filterBrowse;
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const path = [{ label: 'Todos os Anos', onClick: () => this.goToFilterLevel('years') }];
        if (state.selectedYear !== null) {
            const isCurrent = state.level === 'months';
            path.push(isCurrent
                ? { label: String(state.selectedYear) }
                : { label: String(state.selectedYear), onClick: () => this.goToFilterLevel('months') });
        }
        if (state.selectedMonth !== null) {
            path.push({ label: monthNames[state.selectedMonth] });
        }
        ui.renderFilterBreadcrumb(document.getElementById('filterBreadcrumb'), path);

        let items;
        if (state.level === 'years') {
            items = this.getAllYearsWithCounts().map((y) => ({
                id: String(y.year), label: String(y.year), count: y.count, drillable: y.count > 0
            }));
        } else if (state.level === 'months') {
            items = this.getMonthsWithCounts(state.selectedYear).map((m) => ({
                id: String(m.month), label: monthNames[m.month], count: m.count, drillable: true
            }));
        } else {
            items = this.getWeeksWithCounts(state.selectedYear, state.selectedMonth).map((w) => ({
                id: w.start, label: formatWeekLabel(w), count: w.count, drillable: false
            }));
        }

        ui.renderFilterBrowseList(document.getElementById('filterBrowseList'), items, state.checked, {
            onToggle: (id) => this.toggleFilterCheck(id),
            onDrill: (id) => this.drillFilterInto(id)
        });

        this.updateFilterApplyBarPreview();
    }

    goToFilterLevel(level) {
        this.filterBrowse.level = level;
        if (level === 'years') {
            this.filterBrowse.selectedYear = null;
            this.filterBrowse.selectedMonth = null;
        } else if (level === 'months') {
            this.filterBrowse.selectedMonth = null;
        }
        this.filterBrowse.checked = new Set();
        this.renderFilterBrowse();
    }

    drillFilterInto(id) {
        const state = this.filterBrowse;
        if (state.level === 'years') {
            state.selectedYear = parseInt(id, 10);
            state.level = 'months';
        } else if (state.level === 'months') {
            state.selectedMonth = parseInt(id, 10);
            state.level = 'weeks';
        } else {
            return;
        }
        state.checked = new Set();
        this.renderFilterBrowse();
    }

    toggleFilterCheck(id) {
        const checked = this.filterBrowse.checked;
        if (checked.has(id)) checked.delete(id); else checked.add(id);
        this.updateFilterApplyBarPreview();
    }

    // Monta o objeto de filtro a partir do que está marcado no nível atual
    // (ou null se nada estiver marcado).
    buildFilterFromBrowseState() {
        const state = this.filterBrowse;
        if (state.checked.size === 0) return null;

        if (state.level === 'years') {
            return { type: 'years', value: Array.from(state.checked).map(Number) };
        }
        if (state.level === 'months') {
            return {
                type: 'months',
                value: Array.from(state.checked).map((m) => ({ year: state.selectedYear, month: Number(m) }))
            };
        }
        const weeks = this.getWeeksWithCounts(state.selectedYear, state.selectedMonth);
        const selected = weeks.filter((w) => state.checked.has(w.start));
        return { type: 'weeks', value: selected.map((w) => ({ start: w.start, end: w.end })) };
    }

    updateFilterApplyBarPreview() {
        const filter = this.buildFilterFromBrowseState();
        const count = filter ? this.getFilteredNotes(filter).length : 0;
        ui.updateFilterApplyBar(count);
    }

    applySelectedBrowseFilter() {
        const filter = this.buildFilterFromBrowseState();
        if (!filter) return;
        this.applyFilter(filter);
    }

    openYearQuickModal() {
        const modal = document.getElementById('yearQuickModal');
        const list = document.getElementById('yearQuickList');
        const years = this.getAllYearsWithCounts();
        const activeYear = this.currentFilter.type === 'year' ? this.currentFilter.value : null;

        const today = new Date().toISOString().split('T')[0];
        const thisMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
        const thisWeek = getWeekRange(today);

        const filter = this.currentFilter;
        const isMonthActive = filter.type === 'month' && filter.value.year === thisMonth.year && filter.value.month === thisMonth.month;
        const isWeekActive = filter.type === 'week' && filter.value.start === thisWeek.start && filter.value.end === thisWeek.end;

        ui.renderYearQuickList(list, years, activeYear, {
            onAllClick: () => {
                this.closeYearQuickModal();
                this.applyFilter({ type: 'all' });
            },
            onMonthClick: () => {
                this.closeYearQuickModal();
                this.applyFilter({ type: 'month', value: thisMonth });
            },
            onWeekClick: () => {
                this.closeYearQuickModal();
                this.applyFilter({ type: 'week', value: thisWeek });
            },
            onYearClick: (year) => {
                this.closeYearQuickModal();
                this.applyFilter({ type: 'year', value: year });
            },
            isAllActive: filter.type === 'all',
            isMonthActive,
            isWeekActive
        });

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    closeYearQuickModal() {
        const modal = document.getElementById('yearQuickModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    // Ponto único de entrada para trocar o filtro ativo e voltar à tela de
    // visualização, seja qual for o tipo.
    applyFilter(filter) {
        this.currentFilter = filter;
        this.currentNoteIndex = 0;
        this.updateFilterIndicator();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    // ===== BACKUP (MODAL) =====

    prepareSettingsScreen() {
        ui.updateBackupStatusText(this.syncManager.state);
        document.getElementById('darkModeToggle').checked = this.darkModeEnabled;
        this.renderColorThemeSwatches();
    }

    // Expande/recolhe um item do accordion de Configurações, independente
    // dos demais (não fecha os outros ao abrir um novo).
    // Accordion clássico: abrir um item fecha os demais automaticamente.
    toggleSettingsAccordion(header) {
        const item = header.closest('.settings-accordion-item');
        const willOpen = !item.classList.contains('open');

        document.querySelectorAll('.settings-accordion-item').forEach((otherItem) => {
            if (otherItem !== item) {
                otherItem.classList.remove('open');
                otherItem.querySelector('.settings-accordion-header').setAttribute('aria-expanded', 'false');
            }
        });

        item.classList.toggle('open', willOpen);
        header.setAttribute('aria-expanded', String(willOpen));
    }

    async initDarkMode() {
        const saved = await storage.getSetting('darkMode', null);
        // Se nunca configurado, respeita a preferência do sistema operacional.
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const enabled = saved !== null ? saved : prefersDark;
        this.applyDarkMode(enabled, false);
    }

    async setDarkMode(enabled) {
        await this.applyDarkMode(enabled, true);
    }

    async applyDarkMode(enabled, persist) {
        this.darkModeEnabled = enabled;
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
        try {
            localStorage.setItem('darkMode', String(enabled));
        } catch (e) { /* localStorage indisponível — só afeta o anti-flash no próximo load */ }

        if (persist) {
            await storage.setSetting('darkMode', enabled);
        }
    }

    async initColorTheme() {
        const saved = await storage.getSetting('colorTheme', 'terracota');
        this.applyColorTheme(saved, false);
    }

    async setColorTheme(themeId) {
        await this.applyColorTheme(themeId, true);
    }

    async applyColorTheme(themeId, persist) {
        this.colorTheme = themeId;
        document.documentElement.setAttribute('data-color-theme', themeId);
        try {
            localStorage.setItem('colorTheme', themeId);
        } catch (e) { /* localStorage indisponível — só afeta o anti-flash no próximo load */ }

        if (persist) {
            await storage.setSetting('colorTheme', themeId);
        }

        this.renderColorThemeSwatches();
    }

    renderColorThemeSwatches() {
        const grid = document.getElementById('colorThemeGrid');
        if (!grid) return;

        grid.innerHTML = COLOR_THEMES.map((theme) => `
            <button type="button" class="color-theme-swatch ${theme.id === this.colorTheme ? 'active' : ''}"
                    style="--swatch-primary: ${theme.swatch}" data-theme-id="${theme.id}"
                    aria-label="Tema ${theme.label}" aria-pressed="${theme.id === this.colorTheme}">
                <span class="color-theme-swatch-dot"></span>
                <span class="color-theme-swatch-name">${theme.label}</span>
            </button>
        `).join('');

        grid.querySelectorAll('.color-theme-swatch').forEach((btn) => {
            btn.addEventListener('click', () => this.setColorTheme(btn.dataset.themeId));
        });
    }

    async exportNotes() {
        if (this.notes.length === 0) {
            showMessage('Não há memórias para exportar.', 'error');
            return;
        }
        const backupData = await storage.exportFullBackup();
        downloadBackup(backupData, `memorias-positivas-${new Date().toISOString().split('T')[0]}.json`);
        showMessage('Memórias exportadas com sucesso!', 'success');
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

                this.currentFilter = { type: 'year', value: new Date().getFullYear() };
                this.currentNoteIndex = 0;
                this.updateFilterIndicator();
                this.switchScreen('view-screen');
                this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
                this.renderCarousel();
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
                    showMessage('Nenhum arquivo vinculado ainda. Abra Configurações para vincular um arquivo primeiro.', 'warning');
                    this.switchScreen('settings-screen');
                    this.updateNavigation(document.querySelector('[data-screen="settings-screen"]'));
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

    getFilteredNotes(filterOverride) {
        const filter = filterOverride || this.currentFilter;
        let filtered;

        switch (filter.type) {
            case 'all':
                filtered = this.notes.slice();
                break;
            case 'year':
                filtered = this.notes.filter((note) => new Date(note.date + 'T00:00:00').getFullYear() === filter.value);
                break;
            case 'years':
                filtered = this.notes.filter((note) => filter.value.includes(new Date(note.date + 'T00:00:00').getFullYear()));
                break;
            case 'month':
                filtered = this.notes.filter((note) => {
                    const d = new Date(note.date + 'T00:00:00');
                    return d.getFullYear() === filter.value.year && d.getMonth() === filter.value.month;
                });
                break;
            case 'months':
                filtered = this.notes.filter((note) => {
                    const d = new Date(note.date + 'T00:00:00');
                    return filter.value.some((v) => v.year === d.getFullYear() && v.month === d.getMonth());
                });
                break;
            case 'week':
                filtered = this.notes.filter((note) => note.date >= filter.value.start && note.date <= filter.value.end);
                break;
            case 'weeks':
                filtered = this.notes.filter((note) => filter.value.some((v) => note.date >= v.start && note.date <= v.end));
                break;
            case 'day':
                filtered = this.notes.filter((note) => note.date === filter.value);
                break;
            default:
                filtered = [];
        }

        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    updateFilterIndicator() {
        document.getElementById('currentYearIndicator').textContent = formatFilterLabel(this.currentFilter);
    }

    renderCurrentView() {
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) return;
        if (activeScreen.id === 'view-screen') this.renderCarousel();
        if (activeScreen.id === 'years-screen') this.renderFilterBrowse();
    }

    handleKeyboardShortcuts(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'create-screen') this.saveNoteNow();
        }

        if (e.key === 'Escape') {
            const yearModal = document.getElementById('yearQuickModal');
            if (yearModal.classList.contains('active')) this.closeYearQuickModal();
        }

        if (document.querySelector('#view-screen.active')) {
            if (e.key === 'ArrowLeft') this.previousNote();
            else if (e.key === 'ArrowRight') this.nextNote();
        }
    }
}
