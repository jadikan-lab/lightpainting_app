const CACHE_NAME = 'lightpainting-shell-v9';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/settings.js',
  './js/camera.js',
  './js/capture-engine.js',
  './js/recorder.js',
  './js/timelapse.js',
  './js/gallery.js',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Network-first : les mises à jour de code doivent atteindre les téléphones
  // dès qu'ils sont en ligne. Le cache ne sert que de repli hors-ligne.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Ne cacher que les réponses valides de notre propre origine :
        // évite de stocker des erreurs (404/500) ou des réponses opaques
        // tierces qui seraient ensuite servies hors-ligne à tort.
        const sameOrigin = new URL(event.request.url).origin === self.location.origin;
        if (response.ok && sameOrigin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
