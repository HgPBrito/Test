// js/ui.js
// Funções de renderização (apresentação pura). Não acessam storage nem
// sync diretamente — recebem dados já prontos de app.js e devolvem HTML ou
// atualizam elementos específicos do DOM.

import { formatDateToPortuguese, formatTime } from './utils.js';

export function renderNoteCard(note, hydratedContentHtml) {
    const formattedDate = formatDateToPortuguese(note.date);
    return `
        <div class="note-card">
            <div class="note-header">
                <div class="note-date">${formattedDate}</div>
                <div class="note-location">${escapeHtml(note.location) || 'Local não informado'}</div>
            </div>
            <div class="note-content">${hydratedContentHtml}</div>
            <button class="btn btn-secondary edit-note-btn" style="margin-top: 1rem; align-self: flex-start;">
                Editar Memória
            </button>
        </div>
    `;
}

export function renderEmptyCarouselState() {
    return `
        <div class="empty-state">
            <h2>Nenhuma memória encontrada</h2>
            <p>Crie sua primeira memória positiva clicando no botão "Criar" abaixo!</p>
        </div>
    `;
}

export function renderCarouselIndicators(container, total, currentIndex, onIndicatorClick) {
    let html = '';
    for (let i = 0; i < total; i++) {
        html += `<div class="indicator ${i === currentIndex ? 'active' : ''}" data-index="${i}"></div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('.indicator').forEach((indicator, index) => {
        indicator.addEventListener('click', () => onIndicatorClick(index));
    });
}

export function renderYearsList(container, years, onYearClick) {
    if (years.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Nenhum ano anterior com memórias encontrado.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = years.map((yearData) => `
        <div class="year-item" data-year="${yearData.year}">
            <div class="year-number">${yearData.year}</div>
            <div class="year-count">${yearData.count} ${yearData.count === 1 ? 'memória' : 'memórias'}</div>
        </div>
    `).join('');

    container.querySelectorAll('.year-item').forEach((item) => {
        item.addEventListener('click', () => onYearClick(parseInt(item.dataset.year, 10)));
    });
}

// Lista usada no modal de acesso rápido (botão do ano no header): inclui o
// ano atual (destacado) junto com todos os anos anteriores que tiverem
// memórias.
export function renderYearQuickList(container, years, activeYear, onYearClick) {
    if (years.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Nenhuma memória encontrada ainda.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = years.map((yearData) => `
        <div class="year-quick-item ${yearData.year === activeYear ? 'current' : ''}" data-year="${yearData.year}">
            ${yearData.year === activeYear ? '<span class="year-quick-badge">Atual</span>' : ''}
            <div class="year-quick-number">${yearData.year}</div>
            <div class="year-quick-count">${yearData.count} ${yearData.count === 1 ? 'memória' : 'memórias'}</div>
        </div>
    `).join('');

    container.querySelectorAll('.year-quick-item').forEach((item) => {
        item.addEventListener('click', () => onYearClick(parseInt(item.dataset.year, 10)));
    });
}

export function updateCarouselNavigation(prevBtn, nextBtn, canGoPrev, canGoNext) {
    prevBtn.disabled = !canGoPrev;
    nextBtn.disabled = !canGoNext;
}

// ===== Indicador de sincronização (backup em arquivo) =====

const BACKUP_STATUS_MESSAGES = {
    checking: 'Verificando suporte do navegador...',
    unsupported: '⚠️ Seu navegador não permite vincular um arquivo automaticamente (recurso disponível apenas em Chrome/Edge desktop). Use o botão de sincronização rápida ou a exportação manual.',
    'not-linked': 'Nenhum arquivo vinculado. Suas memórias estão salvas apenas neste dispositivo.',
    linked: '✅ Backup automático ativo e sincronizado.',
    pending: '⏳ Alterações pendentes de sincronização...',
    error: '❌ Erro ao sincronizar com o arquivo de backup.'
};

export function updateBackupStatusText(state) {
    const el = document.getElementById('backupStatus');
    if (!el) return;
    el.textContent = BACKUP_STATUS_MESSAGES[state] || '';
    el.className = `backup-status backup-status--${state}`;
}

export function updateSyncBadge(needsSync) {
    const dot = document.getElementById('syncPendingDot');
    if (!dot) return;
    dot.hidden = !needsSync;
}

export function setSyncButtonSpinning(spinning) {
    const btn = document.getElementById('headerSyncBtn');
    if (!btn) return;
    btn.classList.toggle('spinning', spinning);
    btn.disabled = spinning;
}

// ===== Indicador de autosave =====

export function updateAutosaveIndicator(state, timestamp) {
    const el = document.getElementById('autosaveIndicator');
    if (!el) return;

    if (state === 'saving') {
        el.textContent = 'Salvando...';
        el.className = 'autosave-indicator autosave-indicator--saving';
    } else if (state === 'saved') {
        el.textContent = `Salvo automaticamente às ${formatTime(timestamp)}`;
        el.className = 'autosave-indicator autosave-indicator--saved';
    } else if (state === 'unsaved') {
        el.textContent = 'Alterações não salvas ainda';
        el.className = 'autosave-indicator autosave-indicator--unsaved';
    } else {
        el.textContent = '';
        el.className = 'autosave-indicator';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
