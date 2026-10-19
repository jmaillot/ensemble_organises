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
 * POURQUOI `navigator.onLine` EST LA SEULE SOURCE. Elle dit l'existence d'une
 * connexion au sens du navigateur, rien de plus, et l'état la suit ensuite par
 * les événements `online`/`offline` — jamais déduit d'un succès réseau (un GET
 * qui réussit ne prouve pas que le réseau sera là pour le suivant, et
 * inversement : une seule vérité). `navigator.onLine` ne dit pas non plus si
 * NOTRE backend répond : cet état sert seulement à ne pas mentir sur
 * l'existence d'une connexion, jamais à garantir qu'une lecture aboutira.
 */
export function seedOnlineStatus(): void {
  // Pré-rendu sans `navigator` : rien à amorcer, l'état par défaut reste en
  // ligne — le même arbitrage que l'instantané serveur de
  // `use-online-status.ts` (pré-rendu considéré en ligne, pour ne pas peindre
  // un faux bandeau hors ligne là où il n'y a pas de réseau à mesurer).
  if (typeof navigator === 'undefined') return;

  onlineManager.setOnline(navigator.onLine);
}
