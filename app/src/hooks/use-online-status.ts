import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * État réseau de l'application, lu depuis `onlineManager` de TanStack Query.
 *
 * POURQUOI CETTE SOURCE, ET PAS LES ÉVÉNEMENTS DU NAVIGATEUR. `onlineManager`
 * est l'état réseau unique de l'application : c'est lui que TanStack interroge
 * (`networkMode`, et le rechargement à la reconnexion). Un bandeau abonné
 * à `window.ononline`/`onoffline` serait une SECONDE vérité : au mieux elle
 * suivrait la première avec un décalage, au pire elle afficherait « hors
 * ligne » sur une lecture qui aboutit, ou l'inverse. Un seul état, une seule
 * source, donc pas de contradiction possible entre ce que le bandeau annonce et
 * ce que les requêtes font.
 *
 * `useSyncExternalStore` est l'outil prévu pour un magasin externe : il rend
 * `onlineManager.isOnline()` et se réabonne à chaque changement. L'instantané
 * serveur vaut `true` (pré-rendu considéré en ligne) pour ne pas peindre un
 * faux bandeau hors ligne là où il n'y a pas de réseau à mesurer.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
