import type { ModuleKey } from './modules';

/**
 * Le chemin qui ouvre une FICHE, quand le module sait l'ouvrir.
 *
 * La palette de commandes trouve une tâche, une note, un contact… et
 * l'ouvrait jusqu'ici dans son ESPACE : l'utilisateur devait retrouver la
 * ligne lui-même. Un lien profond rend la fiche directement — et il se
 * partage (une URL, un message).
 *
 * DEUX FORMES, selon ce que le module sait faire :
 *
 * - une FICHE a sa propre page (`/recettes/:id`, `/voyages/:id`) : le chemin
 *   est celui de la page ;
 * - une FICHE s'ouvre dans un DIALOGUE, sur la page de son espace : le chemin
 *   porte alors le paramètre `ouvrir`, et la page lit ce paramètre pour
 *   ouvrir la fiche demandée (voir `useOpenRecord`).
 *
 * CE QUI N'A PAS DE LIEN PROFOND, et pourquoi c'est dit ici plutôt que
 * laissé au hasard :
 *
 * - `cercle` : une publication n'a pas de fiche — elle se lit dans le fil ;
 * - `ardoise` : une dépense vit sur la page de SON ardoise, et l'palette ne
 *   connaît pas cette ardoise ; ouvrir l'espace est le repli honnête ;
 * - `messages` : un message se lit dans son fil, que la page choisit.
 *
 * Un module absent de la table ouvre son ESPACE. La table est donc la
 * déclaration exhaustive de ce que la palette sait faire.
 */

/** Le paramètre d'URL qui demande l'ouverture d'une fiche. */
export const OPEN_RECORD_PARAM = 'ouvrir';

const RECORD_PATHS: Partial<Record<ModuleKey, (id: string) => string>> = {
  taches: (id) => `/taches?${OPEN_RECORD_PARAM}=${id}`,
  notes: (id) => `/notes?${OPEN_RECORD_PARAM}=${id}`,
  courses: (id) => `/courses?${OPEN_RECORD_PARAM}=${id}`,
  contacts: (id) => `/contacts?${OPEN_RECORD_PARAM}=${id}`,
  routines: (id) => `/routines?${OPEN_RECORD_PARAM}=${id}`,
  anniversaires: (id) => `/anniversaires?${OPEN_RECORD_PARAM}=${id}`,
  adresses: (id) => `/adresses?${OPEN_RECORD_PARAM}=${id}`,
  prestataires: (id) => `/prestataires?${OPEN_RECORD_PARAM}=${id}`,
  animaux: (id) => `/animaux?${OPEN_RECORD_PARAM}=${id}`,
  fidelite: (id) => `/fidelite?${OPEN_RECORD_PARAM}=${id}`,
  cadeaux: (id) => `/cadeaux?${OPEN_RECORD_PARAM}=${id}`,
  calendrier: (id) => `/calendrier?${OPEN_RECORD_PARAM}=${id}`,
  recettes: (id) => `/recettes/${id}`,
  voyages: (id) => `/voyages/${id}`,
};

/** Vrai pour les modules dont la palette ouvre la FICHE, pas l'espace. */
export function opensRecord(module: ModuleKey): boolean {
  return Boolean(RECORD_PATHS[module]);
}

/**
 * Le chemin d'un résultat de recherche : la fiche quand le module sait
 * l'ouvrir, l'espace sinon.
 */
export function recordPath(module: ModuleKey, rowId: string): string {
  const deep = RECORD_PATHS[module];
  // L'identifiant est ENCODÉ : une URL malformée ne serait pas lue, et le
  // paramètre ne trouverait jamais sa fiche.
  return deep ? deep(encodeURIComponent(rowId)) : `/${module}`;
}
