// js/ui.js
// Funções de renderização (apresentação pura). Não acessam storage nem
// sync diretamente — recebem dados já prontos de app.js e devolvem HTML ou
// atualizam elementos específicos do DOM.

import { formatDateToPortuguese } from './utils.js';

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

const MAX_VISIBLE_INDICATORS = 5;

export function renderCarouselIndicators(container, total, currentIndex, onIndicatorClick) {
    if (total <= MAX_VISIBLE_INDICATORS) {
        renderIndicatorDots(container, 0, total, currentIndex, onIndicatorClick);
        return;
    }

    // Janela deslizante de no máximo 5 bolinhas, centralizada na posição
    // atual (evita uma parede de pontos quando há muitas memórias).
    let start = currentIndex - Math.floor(MAX_VISIBLE_INDICATORS / 2);
    start = Math.max(0, Math.min(start, total - MAX_VISIBLE_INDICATORS));
    const end = start + MAX_VISIBLE_INDICATORS;

    renderIndicatorDots(container, start, end, currentIndex, onIndicatorClick);
}

function renderIndicatorDots(container, start, end, currentIndex, onIndicatorClick) {
    let html = '';
    for (let i = start; i < end; i++) {
        html += `<div class="indicator ${i === currentIndex ? 'active' : ''}" data-index="${i}"></div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('.indicator').forEach((indicator) => {
        const index = parseInt(indicator.dataset.index, 10);
        indicator.addEventListener('click', () => onIndicatorClick(index));
    });
}

export function updateCarouselCounter(current, total) {
    const el = document.getElementById('carouselCounter');
    if (!el) return;
    el.textContent = total > 0 ? `${current} de ${total}` : '';
}

// (renderYearsList removida — substituída pela navegação em camadas mais abaixo)


// Lista usada no modal de acesso rápido (botão do header): opções "Todas as
// memórias", "Este Mês" e "Esta Semana" no topo, seguidas dos anos com
// memórias (ano corrente destacado). `options` = { onAllClick, onMonthClick,
// onWeekClick, onYearClick, isAllActive, isMonthActive, isWeekActive }.
export function renderYearQuickList(container, years, activeYear, options) {
    const { onAllClick, onMonthClick, onWeekClick, onYearClick, isAllActive, isMonthActive, isWeekActive } = options;

    const allItemHtml = `
        <div class="year-quick-item year-quick-item--all ${isAllActive ? 'current' : ''}" data-quick="all">
            ${isAllActive ? '<span class="year-quick-badge">Atual</span>' : ''}
            <div class="year-quick-number">Todas</div>
            <div class="year-quick-count">as memórias</div>
        </div>
    `;

    const monthItemHtml = `
        <div class="year-quick-item ${isMonthActive ? 'current' : ''}" data-quick="month">
            ${isMonthActive ? '<span class="year-quick-badge">Atual</span>' : ''}
            <div class="year-quick-number">Este Mês</div>
        </div>
    `;

    const weekItemHtml = `
        <div class="year-quick-item ${isWeekActive ? 'current' : ''}" data-quick="week">
            ${isWeekActive ? '<span class="year-quick-badge">Atual</span>' : ''}
            <div class="year-quick-number">Esta Semana</div>
        </div>
    `;

    const yearsHtml = years.map((yearData) => `
        <div class="year-quick-item ${yearData.year === activeYear ? 'current' : ''}" data-year="${yearData.year}">
            ${yearData.year === activeYear ? '<span class="year-quick-badge">Atual</span>' : ''}
            <div class="year-quick-number">${yearData.year}</div>
            <div class="year-quick-count">${yearData.count} ${yearData.count === 1 ? 'memória' : 'memórias'}</div>
        </div>
    `).join('');

    container.innerHTML = allItemHtml + monthItemHtml + weekItemHtml + yearsHtml;

    container.querySelector('[data-quick="all"]').addEventListener('click', () => onAllClick());
    container.querySelector('[data-quick="month"]').addEventListener('click', () => onMonthClick());
    container.querySelector('[data-quick="week"]').addEventListener('click', () => onWeekClick());
    container.querySelectorAll('.year-quick-item[data-year]').forEach((item) => {
        item.addEventListener('click', () => onYearClick(parseInt(item.dataset.year, 10)));
    });
}

// ===== Navegação em camadas do filtro (Anos → Meses → Semanas) =====

// path: array de { label, onClick } — o último item é o nível atual
// (não clicável). Ex: [{label:'Todos os Anos', onClick:fn}, {label:'2026'}]
export function renderFilterBreadcrumb(container, path) {
    container.innerHTML = path.map((item, index) => {
        const isCurrent = index === path.length - 1;
        const itemHtml = `<button type="button" class="filter-breadcrumb-item ${isCurrent ? 'current' : ''}" data-index="${index}">${escapeHtml(item.label)}</button>`;
        return index === 0 ? itemHtml : `<span class="filter-breadcrumb-sep">›</span>${itemHtml}`;
    }).join('');

    container.querySelectorAll('.filter-breadcrumb-item:not(.current)').forEach((btn) => {
        const index = parseInt(btn.dataset.index, 10);
        btn.addEventListener('click', () => path[index].onClick());
    });
}

// items: array de { id, label, count, drillable }. `checkedIds` é um Set.
// options: { onToggle(id), onDrill(id) }
export function renderFilterBrowseList(container, items, checkedIds, options) {
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Nenhuma memória encontrada neste período.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map((item) => `
        <div class="filter-browse-item ${checkedIds.has(item.id) ? 'checked' : ''}" data-id="${item.id}">
            <input type="checkbox" class="filter-browse-checkbox" data-id="${item.id}" ${checkedIds.has(item.id) ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(item.label)}">
            <button type="button" class="filter-browse-info ${item.drillable ? 'drillable' : ''}" data-id="${item.id}">
                <span class="filter-browse-label">${escapeHtml(item.label)}</span>
                <span class="filter-browse-count">${item.count} ${item.count === 1 ? 'memória' : 'memórias'}</span>
            </button>
            ${item.drillable ? `
                <svg class="filter-browse-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            ` : ''}
        </div>
    `).join('');

    container.querySelectorAll('.filter-browse-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            checkbox.closest('.filter-browse-item').classList.toggle('checked', checkbox.checked);
            options.onToggle(checkbox.dataset.id);
        });
    });
    container.querySelectorAll('.filter-browse-info.drillable').forEach((btn) => {
        btn.addEventListener('click', () => options.onDrill(btn.dataset.id));
    });
}

export function updateFilterApplyBar(count) {
    const bar = document.getElementById('filterApplyBar');
    const btn = document.getElementById('filterApplyBtn');
    if (count > 0) {
        btn.textContent = `Ver ${count} ${count === 1 ? 'memória selecionada' : 'memórias selecionadas'}`;
        bar.hidden = false;
    } else {
        bar.hidden = true;
    }
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

// ===== Seletor de emoji =====

const EMOJI_LIST = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🥰', '😍', '🤩', '😘', '😊', '🙂', '🥲', '😇', '🤗',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💕', '💞', '💓', '💗', '💖', '💘',
    '🎉', '🎊', '🎂', '🎁', '🥳', '🎈', '🎇', '🎆', '✨', '🌟', '⭐', '🔥', '👏', '🙌',
    '☀️', '🌤️', '🌈', '🌸', '🌻', '🌺', '🌼', '🍀', '🌊', '🏖️', '⛰️', '🌅', '🌄', '🌙'
];

export function renderEmojiPicker(container, onSelect) {
    container.innerHTML = EMOJI_LIST.map((emoji) =>
        `<button type="button" class="emoji-picker-btn" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    container.querySelectorAll('.emoji-picker-btn').forEach((btn) => {
        btn.addEventListener('click', () => onSelect(btn.dataset.emoji));
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
