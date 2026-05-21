const CACHE = 'vacation-v0.7.0';

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
