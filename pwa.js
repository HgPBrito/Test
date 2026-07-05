// js/pwa.js
// Registro do Service Worker e gerenciamento do prompt de instalação do PWA.

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch((err) => console.warn('Falha ao registrar Service Worker:', err));
    });
}

// Captura o evento beforeinstallprompt (Chrome/Edge/Android) para permitir
// disparar a instalação a partir de um botão próprio da UI, em vez de
// depender só do menu do navegador.
export function setupInstallPrompt(onAvailabilityChange) {
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        if (onAvailabilityChange) onAvailabilityChange(true);
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        if (onAvailabilityChange) onAvailabilityChange(false);
    });

    return {
        isAvailable: () => !!deferredPrompt,
        promptInstall: async () => {
            if (!deferredPrompt) return null;
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            deferredPrompt = null;
            return choice;
        }
    };
}
