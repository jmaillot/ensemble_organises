// Fixture BONNE (33-02, contre-preuve OFFR-05) : forme attendue de dist/sw.js.
// Denylist navigation intacte, precacheAndRoute, AUCUNE stratégie cacheable.
import { registerRoute, NavigationRoute, createHandlerBoundToURL } from 'workbox-routing';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/realtime\//, /^\/storage\//],
  }),
);

self.skipWaiting();
clientsClaim();
