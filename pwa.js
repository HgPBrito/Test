// js/pwa.js
// Registro do Service Worker, gerenciamento do prompt de instalação do PWA,
// e detecção/controle de novas versões (atualização só aplicada quando o
// usuário confirmar, nunca trocando o código em uso no meio de uma sessão).

let currentRegistration = null;

export function registerServiceWorker(onUpdateAvailable) {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            currentRegistration = registration;

            // Se já existe um worker esperando (ex: usuário abriu o app,
            // uma atualização terminou de baixar, e ele voltou depois),
            // avisa imediatamente.
            if (registration.waiting && navigator.serviceWorker.controller) {
                if (onUpdateAvailable) onUpdateAvailable();
            }

            // Detecta quando uma nova versão termina de instalar durante a
            // sessão atual.
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    const isUpdate = newWorker.state === 'installed' && navigator.serviceWorker.controller;
                    if (isUpdate && onUpdateAvailable) onUpdateAvailable();
                });
            });
        } catch (err) {
            console.warn('Falha ao registrar Service Worker:', err);
        }
    });

    // Quando a nova versão assume o controle (após confirmarmos a troca),
    // recarrega a página uma única vez para usar o código novo.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
    });
}

// Chamado quando o usuário clica em "Atualizar agora" no aviso de nova
// versão: manda a versão em espera assumir; o reload acontece sozinho via
// o listener de 'controllerchange' configurado acima.
export function applyUpdate() {
    if (currentRegistration && currentRegistration.waiting) {
        currentRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
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

// Estado de conectividade: usado para mostrar um indicativo visual de
// "offline" e para o app decidir se vale a pena tentar operações de rede
// (ex: sincronização) ou já avisar que está sem conexão.
export function setupConnectivityWatcher(onChange) {
    const notify = () => onChange(navigator.onLine);
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
    notify();
}
