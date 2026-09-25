const CACHE_NAME = 'ensemble-organises-react-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './assets/adresses.jpg',
  './assets/animaux.jpg',
  './assets/ardoise.jpg',
  './assets/cadeaux.jpg',
  './assets/calendrier.jpg',
  './assets/cercle.jpg',
  './assets/courses.jpg',
  './assets/lisbonne.jpg',
  './assets/routines.jpg',
  './assets/taches.jpg',
  './assets/voyages.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && ['document', 'style', 'script', 'image'].includes(event.request.destination)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
