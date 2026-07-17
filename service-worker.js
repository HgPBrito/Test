// service-worker.js - Memórias Positivas do Ano
// Responsável pela instalação como PWA e pelo funcionamento offline.
// Os dados do usuário (notas e imagens) ficam no IndexedDB, não neste
// arquivo — este Service Worker cuida apenas dos arquivos estáticos
// (HTML/CSS/JS/ícones), permitindo abrir e usar o app inteiro sem conexão.
//
// Estratégia: cache-first em tudo (o app carrega instantaneamente a partir
// do que já está salvo no aparelho, funcionando 100% offline). A internet só
// é usada em segundo plano para buscar uma versão mais nova dos arquivos —
// e essa versão nova só entra em uso quando o usuário confirmar (ver
// mensagem 'SKIP_WAITING' abaixo e js/pwa.js), nunca de forma automática no
// meio de uma sessão em uso.

const CACHE_VERSION = 'v8';
const CACHE_NAME = `memorias-positivas-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './',
    './index.html',
    './offline.html',
    './styles.css',
    './script.js',
    './manifest.json',
    './js/app.js',
    './js/database.js',
    './js/storage.js',
    './js/backup.js',
    './js/sync.js',
    './js/pwa.js',
    './js/ui.js',
    './js/utils.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .catch((err) => console.warn('SW: falha ao pré-cachear', err))
        // Propositalmente NÃO chama self.skipWaiting() aqui: a nova versão
        // fica "esperando" até o usuário confirmar a atualização pela UI,
        // para nunca trocar o código em uso no meio de uma sessão ativa.
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Permite que a página peça para esta versão em espera assumir agora
// (disparado quando o usuário clica em "Atualizar" no aviso de nova versão).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // Cache-first para tudo, incluindo a navegação de páginas: responde
    // instantaneamente com o que já está salvo (funciona 100% offline) e
    // busca uma versão atualizada em segundo plano para a próxima visita,
    // sem nunca bloquear o carregamento atual esperando a rede.
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    if (request.mode === 'navigate') {
                        return cachedResponse || caches.match('./offline.html');
                    }
                    return cachedResponse;
                });

            return cachedResponse || networkFetch;
        })
    );
});
