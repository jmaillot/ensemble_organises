/// <reference lib="webworker" />
/**
 * Service worker.
 *
 * POURQUOI CE FICHIER EST VERSIONNÉ ALORS QUE VITE EN GÉNÉRAIT UN
 * `generateSW` : ce mode ne permet d'ajouter aucun écouteur d'événement, et
 * l'API Push en a deux. `push` affiche la notification, `notificationclick` la
 * renvoie dans l'application. En `generateSW`, la seule façon de les obtenir
 * était de passer en `injectManifest` — c'est donc ce que fait
 * `vite.config.ts`, en reproduisant à la main ce que le mode précédent
 * configurait (`globPatterns`, repli de navigation, cache des médias).
 *
 * `userVisibleOnly: true` est imposé par l'API Push : CHAQUE message reçu doit
 * produire une notification visible. D'où le repli ci-dessous — un message dont
 * le corps n'est pas décodable affiche malgré tout une notification. Sans lui,
 * une rotation de format de charge utile produirait un `push` silencieusement
 * sans effet, et l'utilisateur en tirerait la conclusion que l'application ne
 * notifie pas.
 */

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const FALLBACK: PushPayload = {
  title: 'Ensemble & Organisés',
  body: 'Vous avez un nouveau rappel.',
  url: '/accueil',
  tag: 'eo-rappel',
};

/**
 * Version fonctionnelle du worker, répondue au ping `EO_VERSION` de la page.
 * À bumper à chaque modification des gestionnaires ci-dessous : c'est ce qui
 * permet au panneau de détecter un worker ACTIF mais OBSOLÈTE (mise à jour
 * bloquée derrière un ancien worker sans `skipWaiting`, données de site
 * conservées à la réinstallation…), cas où les push arrivent mais où rien ne
 * s'affiche, nulle part, sans aucune erreur.
 */
const SW_VERSION = 'push-popup-v1';

/** Clé du reçu du dernier push, lisible par la page via l'API Cache. */
const PUSH_RECEIPT_URL = '/__push_last__';

interface PushReceipt {
  at: number;
  title: string;
  shown: boolean;
  error: string | null;
}

/**
 * Constate la réception, quoi qu'il arrive ensuite.
 *
 * Le panneau lit ce reçu : s'il avance à chaque test sans notification,
 * c'est la phase d'affichage (OS, permission révoquée après coup) qui est en
 * cause ; s'il ne bouge pas, c'est le transport (service Push → navigateur).
 * L'écriture est isolée : un stockage indisponible ne doit jamais faire
 * perdre la notification elle-même.
 */
async function writePushReceipt(receipt: PushReceipt): Promise<void> {
  try {
    const cache = await caches.open('eo-push-log');
    await cache.put(
      new Request(PUSH_RECEIPT_URL),
      new Response(JSON.stringify(receipt), { headers: { 'content-type': 'application/json' } }),
    );
  } catch {
    // Stockage indisponible (navigation privée…) : tant pis pour le reçu.
  }
}

self.skipWaiting();
clientsClaim();

// --- Précache et navigation -------------------------------------------------

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Les routes de l'API ne doivent JAMAIS être servies depuis le cache de
// navigation : une réponse HTML à la place d'un JSON de PostgREST se contente de
// déplacer l'échec, et en le rendant illisible.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/realtime\//, /^\/storage\//],
  }),
);

registerRoute(
  ({ url }) => /\.(?:jpg|jpeg|png|webp|svg|avif)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'eo-media',
    plugins: [
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// --- Notifications push ----------------------------------------------------

function readPayload(event: PushEvent): PushPayload {
  if (!event.data) return FALLBACK;
  try {
    const parsed = event.data.json() as Partial<PushPayload>;
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : FALLBACK.title,
      body: typeof parsed.body === 'string' ? parsed.body : FALLBACK.body,
      url: typeof parsed.url === 'string' && parsed.url.startsWith('/') ? parsed.url : FALLBACK.url,
      tag: typeof parsed.tag === 'string' && parsed.tag ? parsed.tag : FALLBACK.tag,
    };
  } catch {
    // Corps illisible : `text()` reste une piste, et à défaut le repli.
    const text = event.data.text();
    return { ...FALLBACK, body: text || FALLBACK.body };
  }
}

self.addEventListener('push', (event: PushEvent) => {
  const payload = readPayload(event);
  // `renotify` est standard mais absent de la lib DOM de TypeScript : extension
  // locale plutôt qu'un contournement global.
  const options: NotificationOptions & { renotify: boolean } = {
    body: payload.body,
    tag: payload.tag,
    // Sans lui, tout renvoi sous le même tag (rappel répété, tests
    // successifs) remplace le précédent en silence : ni bannière, ni son.
    // Le tag continue de regrouper, mais chaque envoi ré-alerte.
    renotify: true,
    icon: 'icon.svg',
    badge: 'icon.svg',
    lang: 'fr',
    data: { url: payload.url },
  };
  event.waitUntil(
    (async () => {
      const receipt: PushReceipt = { at: Date.now(), title: payload.title, shown: false, error: null };
      try {
        // App ouverte et visible : popup in-app via la page, et notification
        // système SILENCIEUSE. Chrome impose une notification visible par
        // message push (`userVisibleOnly`) : la sauter afficherait un message
        // générique du navigateur à la place du rappel.
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const visible = windows.some((client) => client.visibilityState === 'visible');
        if (visible) {
          for (const client of windows) {
            client.postMessage({ type: 'EO_PUSH', title: payload.title, body: payload.body, url: payload.url });
          }
          await self.registration.showNotification(payload.title, { ...options, silent: true });
        } else {
          // App fermée ou cachée : notification système classique (rideau
          // Android, centre de notifications Windows).
          await self.registration.showNotification(payload.title, options);
        }
        receipt.shown = true;
      } catch (error) {
        receipt.error = error instanceof Error ? error.name : 'inconnue';
      }
      await writePushReceipt(receipt);
    })(),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = ((event.notification.data as { url?: string } | null)?.url ?? FALLBACK.url) as string;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        // Le rappel est déjà ouvert dans un onglet : on le focuses, on ne crée
        // pas une seconde fenêtre du même foyer.
        if (client.url.includes(target)) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * La notification est affichée par le service worker, pas par la page : c'est la
 * seule façon d'en afficher une quand l'onglet est fermé. Le clic est donc
 * traité ici, et `clients.openWindow` est la seule action possible — un
 * `postMessage` à la page n'aurait personne pour le recevoir.
 */

// --- Diagnostic : la page ping pour savoir QUEL worker est actif ------------

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: unknown } | null;
  if (!data || data.type !== 'EO_VERSION') return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({ type: 'EO_VERSION_REPLY', version: SW_VERSION });
      }
    })(),
  );
});
