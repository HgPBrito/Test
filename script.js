// Aplicativo de Memórias Positivas - JavaScript Principal
class MemoryApp {
    constructor() {
        this.notes = [];
        this.currentNoteIndex = 0;
        this.currentYear = new Date().getFullYear();
        this.isEditing = false;
        this.editingNoteId = null;
        
        this.init();
    }

    init() {
        this.loadNotes();
        this.setupEventListeners();
        this.updateYearIndicator();
        this.renderCurrentView();
        this.formatDateDisplay();
    }

    // ===== GERENCIAMENTO DE DADOS =====
    
    loadNotes() {
        try {
            const stored = localStorage.getItem('memoryNotes');
            this.notes = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Erro ao carregar notas:', error);
            this.notes = [];
        }
    }

    saveNotes() {
        try {
            localStorage.setItem('memoryNotes', JSON.stringify(this.notes));
        } catch (error) {
            console.error('Erro ao salvar notas:', error);
            this.showMessage('Erro ao salvar memória. Verifique o espaço disponível.', 'error');
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // ===== NAVEGAÇÃO ENTRE TELAS =====
    
    setupEventListeners() {
        // Navegação entre telas
        document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
            item.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.switchScreen(screen);
                this.updateNavigation(e.currentTarget);
            });
        });

        // Carrossel
        document.getElementById('prevNote').addEventListener('click', () => this.previousNote());
        document.getElementById('nextNote').addEventListener('click', () => this.nextNote());

        // Criação/Edição
        document.getElementById('noteDate').addEventListener('change', () => this.formatDateDisplay());
        document.getElementById('saveNote').addEventListener('click', () => this.saveNote());
        document.getElementById('deleteNote').addEventListener('click', () => this.deleteNote());
        document.getElementById('cancelEdit').addEventListener('click', () => this.cancelEdit());

        // Editor rich text
        this.setupRichEditor();

        // Backup modal
        document.getElementById('backupBtn').addEventListener('click', () => this.openBackupModal());
        document.querySelector('.modal-close').addEventListener('click', () => this.closeBackupModal());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('importBtn').addEventListener('click', () => this.triggerImport());
        document.getElementById('importInput').addEventListener('change', (e) => this.importNotes(e));

        // Fechar modal clicando fora
        document.getElementById('backupModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeBackupModal();
            }
        });

        // Teclas de atalho
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    switchScreen(screenId) {
        // Remove classe active de todas as telas
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Adiciona classe active na tela selecionada
        document.getElementById(screenId).classList.add('active');

        // Atualiza conteúdo baseado na tela
        switch(screenId) {
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
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        activeItem.classList.add('active');
    }

    // ===== TELA DE VISUALIZAÇÃO (CARROSSEL) =====
    
    renderCarousel() {
        const currentYearNotes = this.getCurrentYearNotes();
        const carouselContent = document.getElementById('carouselContent');
        const indicators = document.getElementById('carouselIndicators');
        
        if (currentYearNotes.length === 0) {
            carouselContent.innerHTML = `
                <div class="empty-state">
                    <h2>Nenhuma memória encontrada</h2>
                    <p>Crie sua primeira memória positiva clicando no botão "Criar" abaixo!</p>
                </div>
            `;
            indicators.innerHTML = '';
            this.updateCarouselNavigation(false, false);
            return;
        }

        // Garante que o índice atual seja válido
        if (this.currentNoteIndex >= currentYearNotes.length) {
            this.currentNoteIndex = 0;
        }

        const currentNote = currentYearNotes[this.currentNoteIndex];
        carouselContent.innerHTML = this.renderNoteCard(currentNote);

        // Renderiza indicadores
        this.renderCarouselIndicators(currentYearNotes.length);

        // Atualiza navegação
        this.updateCarouselNavigation(
            this.currentNoteIndex > 0,
            this.currentNoteIndex < currentYearNotes.length - 1
        );

        // Adiciona listener para editar nota
        const editButton = carouselContent.querySelector('.edit-note-btn');
        if (editButton) {
            editButton.addEventListener('click', () => this.editNote(currentNote.id));
        }
    }

    renderNoteCard(note) {
        const formattedDate = this.formatDateToPortuguese(note.date);
        
        return `
            <div class="note-card">
                <div class="note-header">
                    <div class="note-date">${formattedDate}</div>
                    <div class="note-location">${note.location || 'Local não informado'}</div>
                </div>
                <div class="note-content">${note.content}</div>
                <button class="btn btn-secondary edit-note-btn" style="margin-top: 1rem; align-self: flex-start;">
                    Editar Memória
                </button>
            </div>
        `;
    }

    renderCarouselIndicators(total) {
        const indicators = document.getElementById('carouselIndicators');
        let indicatorsHTML = '';
        
        for (let i = 0; i < total; i++) {
            const activeClass = i === this.currentNoteIndex ? 'active' : '';
            indicatorsHTML += `<div class="indicator ${activeClass}" data-index="${i}"></div>`;
        }
        
        indicators.innerHTML = indicatorsHTML;

        // Adiciona listeners aos indicadores
        indicators.querySelectorAll('.indicator').forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                this.currentNoteIndex = index;
                this.renderCarousel();
            });
        });
    }

    updateCarouselNavigation(canGoPrev, canGoNext) {
        const prevBtn = document.getElementById('prevNote');
        const nextBtn = document.getElementById('nextNote');
        
        prevBtn.disabled = !canGoPrev;
        nextBtn.disabled = !canGoNext;
    }

    previousNote() {
        const currentYearNotes = this.getCurrentYearNotes();
        if (this.currentNoteIndex > 0) {
            this.currentNoteIndex--;
            this.renderCarousel();
        }
    }

    nextNote() {
        const currentYearNotes = this.getCurrentYearNotes();
        if (this.currentNoteIndex < currentYearNotes.length - 1) {
            this.currentNoteIndex++;
            this.renderCarousel();
        }
    }

    // ===== TELA DE CRIAÇÃO/EDIÇÃO =====
    
    prepareCreateScreen() {
        if (!this.isEditing) {
            this.resetCreateForm();
        }
        this.formatDateDisplay();
    }

    resetCreateForm() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('noteDate').value = today;
        document.getElementById('noteLocation').value = '';
        document.getElementById('noteContent').innerHTML = '<p>Escreva sua memória positiva aqui...</p>';
        document.getElementById('deleteNote').style.display = 'none';
        this.isEditing = false;
        this.editingNoteId = null;
        this.formatDateDisplay();
    }

    formatDateDisplay() {
        const dateInput = document.getElementById('noteDate');
        const dateDisplay = document.getElementById('dateDisplay');
        
        if (dateInput.value) {
            const date = new Date(dateInput.value + 'T00:00:00');
            dateDisplay.textContent = this.formatDateToPortuguese(dateInput.value);
        } else {
            dateDisplay.textContent = '';
        }
    }

    formatDateToPortuguese(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        
        return `${day} de ${month} de ${year}`;
    }

    setupRichEditor() {
        const editor = document.getElementById('noteContent');
        const toolbar = document.querySelector('.editor-toolbar');

        // Comandos de formatação
        toolbar.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const command = btn.dataset.command;
                document.execCommand(command, false, null);
                this.updateToolbarState();
            });
        });

        // Inserir imagem
        document.getElementById('insertImage').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });

        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.insertImage(e.target.files[0]);
        });

        // Atualizar estado da toolbar
        editor.addEventListener('mouseup', () => this.updateToolbarState());
        editor.addEventListener('keyup', () => this.updateToolbarState());

        // Placeholder behavior
        editor.addEventListener('focus', () => {
            if (editor.innerHTML === '<p>Escreva sua memória positiva aqui...</p>') {
                editor.innerHTML = '<p></p>';
            }
        });

        editor.addEventListener('blur', () => {
            if (editor.innerHTML === '<p></p>' || editor.innerHTML === '') {
                editor.innerHTML = '<p>Escreva sua memória positiva aqui...</p>';
            }
        });
    }

    updateToolbarState() {
        const commands = ['bold', 'italic', 'underline'];
        commands.forEach(command => {
            const btn = document.querySelector(`[data-command="${command}"]`);
            if (btn) {
                if (document.queryCommandState(command)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    }

    insertImage(file) {
        if (!file || !file.type.startsWith('image/')) {
            this.showMessage('Por favor, selecione um arquivo de imagem válido.', 'error');
            return;
        }

        // Verifica tamanho do arquivo (máx 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showMessage('A imagem é muito grande. Máximo 5MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.borderRadius = '0.5rem';
            img.style.margin = '1rem 0';
            
            // Insere a imagem na posição do cursor
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.insertNode(img);
                range.collapse(false);
            } else {
                document.getElementById('noteContent').appendChild(img);
            }
        };
        reader.readAsDataURL(file);
    }

    saveNote() {
        const date = document.getElementById('noteDate').value;
        const location = document.getElementById('noteLocation').value.trim();
        const content = document.getElementById('noteContent').innerHTML;

        // Validações
        if (!date) {
            this.showMessage('Por favor, selecione uma data.', 'error');
            return;
        }

        if (!content || content === '<p>Escreva sua memória positiva aqui...</p>' || content === '<p></p>') {
            this.showMessage('Por favor, escreva o conteúdo da memória.', 'error');
            return;
        }

        const noteData = {
            id: this.isEditing ? this.editingNoteId : this.generateId(),
            date: date,
            location: location || '',
            content: content,
            createdAt: this.isEditing ? this.findNoteById(this.editingNoteId)?.createdAt || Date.now() : Date.now(),
            updatedAt: Date.now()
        };

        if (this.isEditing) {
            // Atualizar nota existente
            const index = this.notes.findIndex(note => note.id === this.editingNoteId);
            if (index !== -1) {
                this.notes[index] = noteData;
            }
        } else {
            // Criar nova nota
            this.notes.push(noteData);
        }

        this.saveNotes();
        this.showMessage(this.isEditing ? 'Memória atualizada com sucesso!' : 'Memória criada com sucesso!', 'success');
        
        // Reset form and switch to view
        this.resetCreateForm();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    editNote(noteId) {
        const note = this.findNoteById(noteId);
        if (!note) return;

        this.isEditing = true;
        this.editingNoteId = noteId;

        // Preencher formulário
        document.getElementById('noteDate').value = note.date;
        document.getElementById('noteLocation').value = note.location;
        document.getElementById('noteContent').innerHTML = note.content;
        document.getElementById('deleteNote').style.display = 'inline-flex';

        this.formatDateDisplay();

        // Mudar para tela de criação
        this.switchScreen('create-screen');
        this.updateNavigation(document.querySelector('[data-screen="create-screen"]'));
    }

    deleteNote() {
        if (!this.isEditing || !this.editingNoteId) return;

        if (confirm('Tem certeza de que deseja excluir esta memória? Esta ação não pode ser desfeita.')) {
            this.notes = this.notes.filter(note => note.id !== this.editingNoteId);
            this.saveNotes();
            this.showMessage('Memória excluída com sucesso!', 'success');
            
            this.resetCreateForm();
            this.switchScreen('view-screen');
            this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
            this.renderCarousel();
        }
    }

    cancelEdit() {
        this.resetCreateForm();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
    }

    // ===== TELA DE ANOS ANTERIORES =====
    
    renderYearsList() {
        const yearsList = document.getElementById('yearsList');
        const years = this.getAvailableYears();
        
        if (years.length === 0) {
            yearsList.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum ano anterior com memórias encontrado.</p>
                </div>
            `;
            return;
        }

        const yearsHTML = years.map(yearData => `
            <div class="year-item" data-year="${yearData.year}">
                <div class="year-number">${yearData.year}</div>
                <div class="year-count">${yearData.count} ${yearData.count === 1 ? 'memória' : 'memórias'}</div>
            </div>
        `).join('');

        yearsList.innerHTML = yearsHTML;

        // Adicionar listeners
        yearsList.querySelectorAll('.year-item').forEach(item => {
            item.addEventListener('click', () => {
                const year = parseInt(item.dataset.year);
                this.viewYearNotes(year);
            });
        });
    }

    getAvailableYears() {
        const yearCounts = {};
        
        this.notes.forEach(note => {
            const year = new Date(note.date + 'T00:00:00').getFullYear();
            if (year !== this.currentYear) {
                yearCounts[year] = (yearCounts[year] || 0) + 1;
            }
        });

        return Object.entries(yearCounts)
            .map(([year, count]) => ({ year: parseInt(year), count }))
            .sort((a, b) => b.year - a.year);
    }

    viewYearNotes(year) {
        this.currentYear = year;
        this.currentNoteIndex = 0;
        this.updateYearIndicator();
        this.switchScreen('view-screen');
        this.updateNavigation(document.querySelector('[data-screen="view-screen"]'));
        this.renderCarousel();
    }

    // ===== BACKUP E IMPORTAÇÃO =====
    
    openBackupModal() {
        const modal = document.getElementById('backupModal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        
        // Foco no primeiro elemento focável
        const firstFocusable = modal.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }

    closeBackupModal() {
        const modal = document.getElementById('backupModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    exportNotes() {
        if (this.notes.length === 0) {
            this.showMessage('Não há memórias para exportar.', 'error');
            return;
        }

        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            notes: this.notes
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `memorias-positivas-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showMessage('Memórias exportadas com sucesso!', 'success');
        this.closeBackupModal();
    }

    triggerImport() {
        document.getElementById('importInput').click();
    }

    importNotes(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'application/json') {
            this.showMessage('Por favor, selecione um arquivo JSON válido.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // Validar estrutura do arquivo
                if (!data.notes || !Array.isArray(data.notes)) {
                    throw new Error('Estrutura de arquivo inválida');
                }

                // Confirmar substituição
                if (this.notes.length > 0) {
                    if (!confirm('Isso substituirá todas as suas memórias atuais. Deseja continuar?')) {
                        return;
                    }
                }

                // Validar e importar notas
                const validNotes = data.notes.filter(note => 
                    note.id && note.date && note.content
                );

                if (validNotes.length === 0) {
                    throw new Error('Nenhuma memória válida encontrada no arquivo');
                }

                this.notes = validNotes;
                this.saveNotes();
                this.showMessage(`${validNotes.length} memórias importadas com sucesso!`, 'success');
                
                // Atualizar visualização
                this.currentYear = new Date().getFullYear();
                this.currentNoteIndex = 0;
                this.updateYearIndicator();
                this.renderCurrentView();
                this.closeBackupModal();
                
            } catch (error) {
                console.error('Erro ao importar:', error);
                this.showMessage('Erro ao importar arquivo. Verifique se é um arquivo válido.', 'error');
            }
        };

        reader.readAsText(file);
        
        // Reset input
        event.target.value = '';
    }

    // ===== FUNÇÕES AUXILIARES =====
    
    getCurrentYearNotes() {
        return this.notes
            .filter(note => new Date(note.date + 'T00:00:00').getFullYear() === this.currentYear)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    findNoteById(id) {
        return this.notes.find(note => note.id === id);
    }

    updateYearIndicator() {
        document.getElementById('currentYearIndicator').textContent = this.currentYear;
    }

    renderCurrentView() {
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen) {
            const screenId = activeScreen.id;
            switch(screenId) {
                case 'view-screen':
                    this.renderCarousel();
                    break;
                case 'years-screen':
                    this.renderYearsList();
                    break;
            }
        }
    }

    showMessage(message, type = 'info') {
        // Criar elemento de mensagem
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            color: white;
            font-weight: 500;
            max-width: 300px;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;

        // Cores baseadas no tipo
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#6366f1'
        };
        messageEl.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(messageEl);

        // Animar entrada
        setTimeout(() => {
            messageEl.style.transform = 'translateX(0)';
        }, 100);

        // Remover após 3 segundos
        setTimeout(() => {
            messageEl.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(messageEl);
            }, 300);
        }, 3000);
    }

    showLoading(show = true) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
        } else {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + S para salvar
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'create-screen') {
                this.saveNote();
            }
        }

        // Escape para fechar modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('backupModal');
            if (modal.classList.contains('active')) {
                this.closeBackupModal();
            }
        }

        // Setas para navegação no carrossel
        if (document.querySelector('#view-screen.active')) {
            if (e.key === 'ArrowLeft') {
                this.previousNote();
            } else if (e.key === 'ArrowRight') {
                this.nextNote();
            }
        }
    }
}

// Inicializar aplicativo quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.memoryApp = new MemoryApp();
});

// Service Worker removido para evitar 404 errors nos logs