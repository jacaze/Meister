// Service Worker MEIster — Cache de assets estáticos (exclui estritamente /api)
const CACHE_NAME = 'meister-static-v1';
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
  '.html',
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Regra crítica: NUNCA interceptar ou cachear chamadas de API ou métodos não-GET
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/openfinance')) {
    return;
  }

  // Interceptar apenas mesma origem e assets estáticos conhecidos ou navegação SPA
  if (url.origin === self.location.origin) {
    const isStaticAsset = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
    const isNavigation = event.request.mode === 'navigate';

    if (isStaticAsset || isNavigation) {
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
          cache.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                  cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
              })
              .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
          })
        )
      );
    }
  }
});
