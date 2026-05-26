const CACHE_NAME = 'phoneme-coach-v27';

const SHELL_ASSETS = [
  './index.html',
  './app-data.js',
  './storage-utils.js',
  './zip-utils.js',
  './display-mapping-utils.js',
  './display-ui.js',
  './audio-controller.js',
  './lesson-source.js',
  './presentation-view.js',
  './candidate-profile.js',
  './editor-save-workflow.js',
  './word-rendering.js',
  './sentence-view.js',
  './ui-wiring.js',
  './app.js',
  './styles.css',
  './icon-192.png',
  './icon-512.png',
  './fonts/YanCui.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests; let API calls pass through
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Shell assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
