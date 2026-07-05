const CACHE_NAME = 'salesmart-ai-v20260705d';
const CORE_ASSETS = [
  '/',
  '/pricing.html',
  '/account.html',
  '/salesmart-ai-app.html',
  '/tool-listing.html',
  '/tool-keywords.html',
  '/tool-reviews.html',
  '/offline.html',
  '/assets/styles.css?v=20260705c',
  '/assets/app.js?v=20260705d',
  '/assets/config.js?v=20260705c',
  '/assets/favicon.svg?v=20260705c',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key === CACHE_NAME ? null : caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return new Response('', { status: 408, statusText: 'Offline' });
      })
  );
});
