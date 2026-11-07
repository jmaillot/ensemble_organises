import { onlineManager } from '@tanstack/react-query';

/**
 * Amorçage de l'état réseau de l'application, une fois, depuis le navigateur.
 *
 * POURQUOI AMORCER. `onlineManager` naît avec `#online = true` en dur et ne
 * change QUE sur un événement `online`/`offline` du document courant. Sur un
 * démarrage à froid hors ligne, aucun de ces événements n'arrive : l'état reste
 * `true`, le bandeau se tait, et le retour réel du réseau — `setOnline(true)` —
 * n'est PAS un changement, donc `setOnline` ne notifie personne ; le
 * `refetchOnReconnect: true` de la politique réseau reste mort sur ce chemin.
 * Poser l'état initial depuis `navigator.onLine` rétablit les deux : le premier
 * rendu dit la vérité, et le retour du réseau redevient un changement notifié.
 *
 * POURQUOI `navigator.onLine` EST LA VALEUR INITIALE OPTIMISTE. Elle dit
 * l'existence d'une connexion au sens du navigateur, rien de plus, et l'état
 * la suit ensuite par les événements `online`/`offline`. Ce seed ne dit
 * jamais lui-même si NOTRE backend répond : il sert seulement à ne pas
 * peindre un faux bandeau avant preuve, jamais à garantir qu'une lecture
 * aboutira.
 *
 * CE N'EST PLUS LA SEULE SOURCE (révision 35-07, §2.7 I — l'affirmation
 * précédente « seule source » était devenue fausse). La sonde de
 * `reachability.ts` est la couche CORRECTRICE pour les plateformes où
 * `navigator.onLine` ment (H1 Android : mode avion proclamé en ligne). Le
 * seed reste optimiste — ne pas peindre un faux bandeau hors ligne là où il
 * est fiable — et la sonde bascule sur preuve observée : l'upgrade en ligne
 * exige un succès de sonde, le downgrade un échec ou un événement `offline`.
 */
export function seedOnlineStatus(): void {
  // Pré-rendu sans `navigator` : rien à amorcer, l'état par défaut reste en
  // ligne — le même arbitrage que l'instantané serveur de
  // `use-online-status.ts` (pré-rendu considéré en ligne, pour ne pas peindre
  // un faux bandeau hors ligne là où il n'y a pas de réseau à mesurer).
  if (typeof navigator === 'undefined') return;

  onlineManager.setOnline(navigator.onLine);
}
