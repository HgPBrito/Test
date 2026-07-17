// js/utils.js
// Funções auxiliares puras, sem estado, reutilizadas pelos demais módulos.

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

export function formatDateToPortuguese(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

export function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Dado um dia qualquer (YYYY-MM-DD), devolve o intervalo domingo–sábado da
// semana que contém esse dia, também como YYYY-MM-DD (inclusive nas pontas).
export function getWeekRange(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const dayOfWeek = date.getDay(); // 0 = domingo
    const start = new Date(date);
    start.setDate(date.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const toISO = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    return { start: toISO(start), end: toISO(end) };
}

const MONTH_ABBREVIATIONS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// "05/07 – 11/07" — usado tanto na lista de semanas quanto no badge do header.
export function formatWeekLabel(range) {
    const [, sm, sd] = range.start.split('-');
    const [, em, ed] = range.end.split('-');
    return `${sd}/${sm} – ${ed}/${em}`;
}

// Texto curto para mostrar no badge do header e no cabeçalho da tela de
// visualização, representando o filtro de período ativo no momento.
export function formatFilterLabel(filter) {
    if (!filter) return '';

    if (filter.type === 'all') return 'Todas';

    if (filter.type === 'year') return String(filter.value);
    if (filter.type === 'years') {
        return filter.value.length === 1 ? String(filter.value[0]) : `${filter.value.length} anos`;
    }

    if (filter.type === 'month') {
        return `${MONTH_ABBREVIATIONS[filter.value.month]}/${filter.value.year}`;
    }
    if (filter.type === 'months') {
        return filter.value.length === 1
            ? `${MONTH_ABBREVIATIONS[filter.value[0].month]}/${filter.value[0].year}`
            : `${filter.value.length} meses`;
    }

    if (filter.type === 'week') return formatWeekLabel(filter.value);
    if (filter.type === 'weeks') {
        return filter.value.length === 1 ? formatWeekLabel(filter.value[0]) : `${filter.value.length} semanas`;
    }

    if (filter.type === 'day') {
        const [, m, d] = filter.value.split('-');
        return `${d}/${m}`;
    }

    return '';
}

export function showMessage(message, type = 'info') {
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

    const styles = getComputedStyle(document.documentElement);
    const colors = {
        success: styles.getPropertyValue('--success-color').trim(),
        error: styles.getPropertyValue('--danger-color').trim(),
        warning: styles.getPropertyValue('--warning-color').trim(),
        info: styles.getPropertyValue('--primary-color').trim()
    };
    messageEl.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(messageEl);

    setTimeout(() => {
        messageEl.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        messageEl.style.transform = 'translateX(100%)';
        setTimeout(() => messageEl.remove(), 300);
    }, 3000);
}

// Converte uma data URL (base64) em Blob, usado na migração de notas antigas
// e na importação de backups completos (que trazem imagens em base64).
export function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:(.*);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

export function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
