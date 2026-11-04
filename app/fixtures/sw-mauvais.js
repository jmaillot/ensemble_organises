// Fixture MAUVAISE (33-02, contre-preuve OFFR-05) : le défaut que le contrôle
// doit refuser — une stratégie CacheFirst enregistrée sur une route de l'API.
// Identique à la fixture bonne, plus ce seul ajout.
import { registerRoute, NavigationRoute, createHandlerBoundToURL } from 'workbox-routing';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/realtime\//, /^\/storage\//],
  }),
);

// LE DEFAUT : cacher les réponses PostgREST — interdit par D-10 / OFFR-05.
registerRoute(
  new CacheFirst({
    cacheName: 'api-reponses',
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

self.skipWaiting();
clientsClaim();
