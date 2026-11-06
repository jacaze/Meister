// Service Worker MEIster — Cache de assets estáticos e SPA offline resiliente (exclui estritamente /api)
const BUILD_VERSION = '__BUILD_VERSION__';
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;
const CACHE_NAME = 'meister-static-' + BUILD_VERSION;

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

// Precache no install: grava atomicamente a lista completa de assets do build atual
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

// Limpeza atômica no activate: apaga todos os caches antigos de deploys anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('meister-static-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
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
            const forCache = networkResponse.clone();
            const forIndexHtmlCache = networkResponse.clone();

            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) =>
                Promise.all([
                  cache.put(event.request, forCache),
                  cache.put('/index.html', forIndexHtmlCache),
                ])
              )
            );
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const indexFallback = await caches.match('/index.html');
          if (indexFallback) return indexFallback;
          return new Response('Rede indisponível no momento.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 2. Assets estáticos com extensão conhecida:
  const isStaticAsset = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (isStaticAsset) {
    const isImmutableAsset = url.pathname.startsWith('/assets/');

    // Para /assets/* (com hash gerado pelo Vite): Cache-first puro. Não refaz download na rede se já está em cache.
    if (isImmutableAsset) {
      event.respondWith(
        caches.match(event.request).then(async (cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          try {
            const networkResponse = await fetch(event.request);
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const forCache = networkResponse.clone();
              event.waitUntil(
                caches.open(CACHE_NAME).then((c) => c.put(event.request, forCache))
              );
            }
            return networkResponse;
          } catch {
            return new Response('', {
              status: 504,
              statusText: 'Gateway Timeout',
            });
          }
        })
      );
      return;
    }

    // Para estáticos mutáveis sem hash (favicon.svg, icon-*.png, manifest):
    // Revalidação em segundo plano com devolução da promise do cache.put dentro de waitUntil
    const updatePromise = fetch(event.request)
      .then(async (networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const forCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, forCache);
        }
        return networkResponse;
      })
      .catch(() => null);

    event.waitUntil(updatePromise);

    event.respondWith(
      caches.match(event.request).then(async (cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        const networkRes = await updatePromise;
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
