import type { ComponentType } from 'react';

/**
 * Table UNIQUE des morceaux de routes (09-06, D-09).
 *
 * POURQUOI UNE SEULE TABLE : `router.tsx` consomme ces mêmes importeurs via
 * `LazyRoute`, et le préchargeur ci-dessous les déclenche à l'idle. Une seule
 * liste de spécificateurs `import()` = impossibilité de précharger un morceau
 * que le routeur ne demanderait pas, et inversement. Ajouter une route, c'est
 * ajouter UNE entrée ici — le préchargement et la couverture précache suivent
 * sans autre modification.
 *
 * Aucun groupement eager : chaque entrée reste un import dynamique, donc un
 * morceau séparé. Appeler l'importeur à l'idle ne fait que télécharger le
 * morceau plus tôt — jamais le fusionner dans le bundle initial.
 */
export type RouteChunkLoader = () => Promise<{ default: ComponentType }>;

export const routeChunkLoaders = {
  landing: () => import('@/modules/landing/landing-page'),
  signIn: () => import('@/modules/landing/sign-in-page'),
  privacy: () => import('@/modules/landing/privacy-page'),
  terms: () => import('@/modules/landing/terms-page'),
  guestArdoise: () => import('@/modules/ardoise/guest-ardoise-page'),
  guestCadeau: () => import('@/modules/cadeaux/guest-cadeau-page'),
  welcome: () => import('@/modules/landing/welcome-page'),
  createHousehold: () => import('@/modules/landing/create-household-page'),
  joinHousehold: () => import('@/modules/landing/join-household-page'),
  dashboard: () => import('@/modules/dashboard/dashboard-page'),
  taches: () => import('@/modules/taches/taches-page'),
  calendrier: () => import('@/modules/calendrier/calendrier-page'),
  notes: () => import('@/modules/notes/notes-page'),
  courses: () => import('@/modules/courses/courses-page'),
  productCatalog: () => import('@/modules/courses/product-catalog-page'),
  routines: () => import('@/modules/routines/routines-page'),
  recettes: () => import('@/modules/recettes/recettes-page'),
  ardoise: () => import('@/modules/ardoise/ardoise-page'),
  ardoiseDetail: () => import('@/modules/ardoise/ardoise-detail-page'),
  cadeaux: () => import('@/modules/cadeaux/cadeaux-page'),
  anniversaires: () => import('@/modules/anniversaires/anniversaires-page'),
  contacts: () => import('@/modules/contacts/contacts-page'),
  animaux: () => import('@/modules/animaux/animaux-page'),
  prestataires: () => import('@/modules/prestataires/prestataires-page'),
  fidelite: () => import('@/modules/fidelite/fidelite-page'),
  adresses: () => import('@/modules/adresses/adresses-page'),
  cercle: () => import('@/modules/cercle/cercle-page'),
  voyages: () => import('@/modules/voyages/voyages-page'),
  messages: () => import('@/modules/messages/messages-page'),
  parametres: () => import('@/modules/parametres/parametres-page'),
  notFound: () => import('./not-found-page'),
} satisfies Record<string, RouteChunkLoader>;

export type RouteChunkKey = keyof typeof routeChunkLoaders;

/** Nombre de morceaux attendus — la preuve de couverture précache s'y réfère. */
export const ROUTE_CHUNK_COUNT = Object.keys(routeChunkLoaders).length;

let preloadStarted = false;

/**
 * Précharge tous les morceaux de routes en arrière-plan (D-09).
 *
 * - À l'idle (`requestIdleCallback`, repli `setTimeout` différé) : la première
 *   peinture n'est jamais ralentie — rien ne part avant que le navigateur
 *   soit inactif.
 * - En ligne seulement : hors ligne, télécharger est voué à l'échec et
 *   disputerait la bande passante à la file de synchro.
 * - Séquentiel, chaque échec avalé : un morceau indisponible n'interrompt pas
 *   les suivants, et la garde par route (`LazyRoute`) gère l'UX dans tous les
 *   cas (T-09-07 : pas de rafale, pas de minuteur qui martèle).
 * - Monté une fois : le garde-fou `preloadStarted` absorbe le double-effet du
 *   mode strict en développement.
 */
export function preloadRouteChunks(loaders: RouteChunkLoader[] = Object.values(routeChunkLoaders)): void {
  if (preloadStarted) return;
  preloadStarted = true;
  if (typeof window === 'undefined') return;
  const scheduleIdle = (work: () => void): void => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => work(), { timeout: 8000 });
      return;
    }
    window.setTimeout(work, 2000);
  };
  scheduleIdle(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void (async () => {
        for (const load of loaders) {
          try {
            await load();
          } catch {
            // Morceau indisponible (réseau coupé entre-temps…) : on continue
            // les suivants, la garde par route affichera le réessai si
            // l'utilisateur ouvre justement cette page.
          }
        }
      })();
    } catch {
      // Le préchargement ne doit jamais casser le shell qui l'héberge.
    }
  });
}

/** Garde-fou réinitialisable — réservé aux tests. */
export function __resetRoutePreloadForTests(): void {
  preloadStarted = false;
}
