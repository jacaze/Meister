// Service Worker MEIster — Cache de assets estáticos e SPA offline resiliente (exclui estritamente /api)
const STATIC_CACHE_PREFIX = 'meister-static-';
const DEFAULT_CACHE_NAME = 'meister-static-v5';
const FALLBACK_STATIC_ENTRIES = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
];

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

// Obtém o nome da versão ativa do cache a partir do manifesto do deploy ou usa fallback
async function getDeployCacheName() {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-cache' });
    if (res && res.status === 200) {
      const data = await res.json();
      if (data && data.version) {
        return `${STATIC_CACHE_PREFIX}${data.version}`;
      }
    }
  } catch {}
  return DEFAULT_CACHE_NAME;
}

// Precache no install: carrega asset-manifest.json com TODOS os assets (inclusive chunks dinâmicos)
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      let cacheName = DEFAULT_CACHE_NAME;
      let assetsToCache = FALLBACK_STATIC_ENTRIES;

      try {
        const res = await fetch('/asset-manifest.json', { cache: 'no-cache' });
        if (res && res.status === 200) {
          const manifest = await res.json();
          if (manifest && Array.isArray(manifest.assets) && manifest.version) {
            cacheName = `${STATIC_CACHE_PREFIX}${manifest.version}`;
            assetsToCache = manifest.assets;
          }
        }
      } catch {
        // Fallback para lista básica caso o manifesto não esteja disponível
      }

      const cache = await caches.open(cacheName);
      await Promise.allSettled(
        assetsToCache.map((url) =>
          cache.add(url).catch(() => {})
        )
      );

      await self.skipWaiting();
    })()
  );
});

// Limpeza atômica por deploy: apaga caches antigos preservando apenas a versão do deploy atual
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const currentCacheName = await getDeployCacheName();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(STATIC_CACHE_PREFIX) && k !== currentCacheName)
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
              getDeployCacheName().then((cacheName) =>
                caches.open(cacheName).then((cache) =>
                  Promise.all([
                    cache.put(event.request, forCache),
                    cache.put('/index.html', forIndexHtmlCache),
                  ])
                )
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

  // 2. Assets estáticos com extensão conhecida ou manifesto: Cache-First com atualização em background
  const isStaticAsset =
    STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)) ||
    url.pathname === '/asset-manifest.json';

  if (isStaticAsset) {
    // Dispara a busca na rede e o salvamento em cache de forma síncrona
    const updatePromise = fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const forCache = networkResponse.clone();
          getDeployCacheName()
            .then((cacheName) => caches.open(cacheName))
            .then((c) => c.put(event.request, forCache))
            .catch(() => {});
        }
        return networkResponse;
      })
      .catch(() => null);

    // Registra imediatamente o trabalho de atualização em segundo plano para o SW não morrer
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
