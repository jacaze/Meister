// Service Worker MEIster — Cache de assets estáticos e SPA offline resiliente (exclui estritamente /api)
const CACHE_NAME = 'meister-static-v5';
const MAX_STATIC_ENTRIES = 80;
const PROTECTED_PATHS = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];
const STATIC_EXTENSIONS = [
  '.js',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.woff',
  '.woff2',
  '.ttf',
];

// Conjunto de assets referenciados diretamente pelo HTML do deploy ativo
const activeHtmlChunks = new Set();

/**
 * Analisa o HTML do deploy atual para extrair caminhos de assets gerados pelo bundler (/assets/*)
 * e impedir que o descarte de cache (trimCache) remova pedaços essenciais da SPA em execução.
 */
function recordActiveChunksFromHtml(htmlText) {
  if (!htmlText || typeof htmlText !== 'string') return;
  const chunkRegex = /(?:\/assets\/[a-zA-Z0-9_\-\.]+\.(?:js|css))/g;
  let match;
  while ((match = chunkRegex.exec(htmlText)) !== null) {
    activeHtmlChunks.add(match[0]);
  }
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  if (requests.length > maxItems) {
    // Procura a primeira entrada descartável que NÃO seja protegida nem pertença ao deploy atual
    const candidate = requests.find((req) => {
      const path = new URL(req.url).pathname;
      if (PROTECTED_PATHS.includes(path)) return false;
      if (activeHtmlChunks.has(path)) return false;
      return true;
    });

    if (candidate) {
      await cache.delete(candidate);
      return trimCache(cacheName, maxItems);
    }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Limpeza atômica por versão: ao ativar uma nova versão, descarta totalmente os caches legados
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Regra crítica: NUNCA interceptar ou cachear chamadas de API ou métodos não-GET
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/openfinance')
  ) {
    return;
  }

  // Apenas mesma origem
  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate' || url.pathname.endsWith('.html');

  // 1. Navegação e HTML: Network-First com fallback de cache offline
  // Previne servir index.html obsoleto com referências a scripts de deploy anterior
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const clone = networkResponse.clone();
            clone.text().then((text) => {
              recordActiveChunksFromHtml(text);
            }).catch(() => {});

            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            cached.clone().text().then((text) => recordActiveChunksFromHtml(text)).catch(() => {});
            return cached;
          }
          const indexFallback = await caches.match('/index.html');
          if (indexFallback) {
            indexFallback.clone().text().then((text) => recordActiveChunksFromHtml(text)).catch(() => {});
            return indexFallback;
          }
          return new Response('Rede indisponível no momento.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 2. Assets estáticos com extensão conhecida: Cache-First com atualização em background
  const isStaticAsset = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              cache.put(event.request, networkResponse.clone());
              trimCache(CACHE_NAME, MAX_STATIC_ENTRIES).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedResponse) {
          return cachedResponse;
        }

        const networkRes = await fetchPromise;
        if (networkRes) {
          return networkRes;
        }

        return new Response('', {
          status: 504,
          statusText: 'Gateway Timeout',
        });
      })
    );
  }
});
