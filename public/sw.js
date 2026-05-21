const CACHE = 'vacation-v1.1.0';

const SHELL = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/state.js',
  '/js/events.js',
  '/js/utils.js',
  '/js/mapManager.js',
  '/js/mapLabel.js',
  '/js/locationManager.js',
  '/js/journeyManager.js',
  '/js/panels.js',
  '/js/shareManager.js',
  '/manifest.json',
  '/icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only cache GET requests for our own origin; never intercept API calls
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
  );
});

// ── Share Mode: store latest coordinates sent from the page ────────

const SHARE_CACHE = 'share-data-v1';

self.addEventListener('message', async e => {
  if (e.data?.type !== 'share-location-update') return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put('/_sw_share_data', new Response(JSON.stringify(e.data)));
  } catch (_) {}
});

// Periodic background sync — fires even when app is not open
self.addEventListener('periodicsync', async e => {
  if (e.tag !== 'share-location') return;
  e.waitUntil((async () => {
    try {
      const cache  = await caches.open(SHARE_CACHE);
      const stored = await cache.match('/_sw_share_data');
      if (!stored) return;
      const { name, lat, lng } = await stored.json();
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') return;
      await fetch('/api/location', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, lat, lng }),
      });
    } catch (_) {}
  })());
});
