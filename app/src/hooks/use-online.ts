import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function snapshot() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * État réseau réactif : vrai quand le navigateur se dit en ligne. Partagé par
 * les états de cache vide (D-07) : lire `navigator.onLine` au rendu ne suffit
 * pas, il faut se réabonner pour basculer d'état au retour réseau.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
