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
  guestVoyage: () => import('@/modules/voyages/guest-trip-page'),
  guestRecette: () => import('@/modules/recettes/guest-recipe-page'),
  welcome: () => import('@/modules/landing/welcome-page'),
  createHousehold: () => import('@/modules/landing/create-household-page'),
  joinHousehold: () => import('@/modules/landing/join-household-page'),
  dashboard: () => import('@/modules/dashboard/dashboard-page'),
  dashboardGuide: () => import('@/modules/dashboard/dashboard-guide-page'),
  taches: () => import('@/modules/taches/taches-page'),
  tachesGuide: () => import('@/modules/taches/taches-guide-page'),
  calendrier: () => import('@/modules/calendrier/calendrier-page'),
  calendrierGuide: () => import('@/modules/calendrier/calendrier-guide-page'),
  notes: () => import('@/modules/notes/notes-page'),
  notesGuide: () => import('@/modules/notes/notes-guide-page'),
  courses: () => import('@/modules/courses/courses-page'),
  coursesGuide: () => import('@/modules/courses/courses-guide-page'),
  productCatalog: () => import('@/modules/courses/product-catalog-page'),
  routines: () => import('@/modules/routines/routines-page'),
  routinesGuide: () => import('@/modules/routines/routines-guide-page'),
  recettes: () => import('@/modules/recettes/recettes-page'),
  recettesGuide: () => import('@/modules/recettes/recettes-guide-page'),
  recetteDetail: () => import('@/modules/recettes/recette-detail-page'),
  ardoise: () => import('@/modules/ardoise/ardoise-page'),
  ardoiseGuide: () => import('@/modules/ardoise/ardoise-guide-page'),
  ardoiseDetail: () => import('@/modules/ardoise/ardoise-detail-page'),
  cadeaux: () => import('@/modules/cadeaux/cadeaux-page'),
  cadeauxGuide: () => import('@/modules/cadeaux/cadeaux-guide-page'),
  anniversaires: () => import('@/modules/anniversaires/anniversaires-page'),
  anniversairesGuide: () => import('@/modules/anniversaires/anniversaires-guide-page'),
  contacts: () => import('@/modules/contacts/contacts-page'),
  contactsGuide: () => import('@/modules/contacts/contacts-guide-page'),
  frigo: () => import('@/modules/frigo/frigo-page'),
  frigoGuide: () => import('@/modules/frigo/frigo-guide-page'),
  documents: () => import('@/modules/documents/documents-page'),
  documentsGuide: () => import('@/modules/documents/documents-guide-page'),
  menu: () => import('@/modules/menu/menu-page'),
  menuGuide: () => import('@/modules/menu/menu-guide-page'),
  animaux: () => import('@/modules/animaux/animaux-page'),
  animauxGuide: () => import('@/modules/animaux/animaux-guide-page'),
  prestataires: () => import('@/modules/prestataires/prestataires-page'),
  prestatairesGuide: () => import('@/modules/prestataires/prestataires-guide-page'),
  fidelite: () => import('@/modules/fidelite/fidelite-page'),
  fideliteGuide: () => import('@/modules/fidelite/fidelite-guide-page'),
  adresses: () => import('@/modules/adresses/adresses-page'),
  adressesGuide: () => import('@/modules/adresses/adresses-guide-page'),
  cercle: () => import('@/modules/cercle/cercle-page'),
  cercleGuide: () => import('@/modules/cercle/cercle-guide-page'),
  voyages: () => import('@/modules/voyages/voyages-page'),
  voyagesGuide: () => import('@/modules/voyages/voyages-guide-page'),
  voyageDetail: () => import('@/modules/voyages/trip-detail-page'),
  messages: () => import('@/modules/messages/messages-page'),
  messagesGuide: () => import('@/modules/messages/messages-guide-page'),
  parametres: () => import('@/modules/parametres/parametres-page'),
  parametresDonnees: () => import('@/modules/parametres/gdpr-cancel-page'),
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
 * - En ligne seulement : hors ligne, télécharger est voué à l'échec — les
 *   requêtes n'ont de toute façon aucun réseau à emprunter, et attendre l'idle
 *   ne change rien à l'issue.
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
