import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { replayOutbox } from '@/lib/offline/outbox-replay';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';

/**
 * Déclencheurs foreground du rejeu (phase 34, D-08, WRQ-02).
 *
 * POURQUOI CE HOOK EST MONTÉ UNE SEULE FOIS, ICI (providers de l'app). Le
 * rejeu est un service global de l'application, pas une préoccupation de
 * vue : un déclencheur par page créerait autant de passes concurrentes que
 * de vues visitées, pour le même effet. Le composant ci-dessous est rendu
 * une fois dans `AppRouter`, hors `Routes`.
 *
 * POURQUOI CES TROIS DÉCLENCHEURS ET PAS D'AUTRES. `onlineManager` est la
 * source réseau UNIQUE de l'app (phase 33) : s'y abonner couvre le retour
 * du réseau sans créer une seconde vérité `window.ononline`. Le
 * `visibilitychange` couvre le retour d'onglet (le réseau n'a pas changé,
 * l'app redevient visible). Le rejeu au montage couvre les écritures
 * pendantes d'un reload précédent (la file est persistée, D-01). PAS de
 * polling, PAS de background sync : foreground uniquement (D-08, hors
 * périmètre).
 */
export function useOutboxReplay(): void {
  const client = useQueryClient();

  useEffect(() => {
    // La portée (userId, householdId) est lue AU MOMENT du déclencheur via
    // les états courants des stores — jamais capturée dans une closure :
    // une session ou un foyer peut changer entre le montage et le rejeu.
    const replay = () => {
      if (!onlineManager.isOnline()) return;
      const userId = useSessionStore.getState().user?.id ?? null;
      const householdId = useHouseholdStore.getState().householdId;
      if (!userId || !householdId) return; // pas de foyer chargé : rien à rejouer
      void replayOutbox(client, userId, householdId);
    };

    const onVisibilityChange = () => {
      // Le retour d'onglet déclenche ; la perte de visibilité ne fait rien —
      // rejouer en partant serait exactement l'inverse du besoin (D-08).
      if (document.visibilityState === 'visible') replay();
    };

    const unsubscribeOnline = onlineManager.subscribe(replay);
    document.addEventListener('visibilitychange', onVisibilityChange);
    replay(); // au montage : des écritures peuvent dater du reload précédent

    return () => {
      unsubscribeOnline();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [client]);
}

/**
 * Point de montage unique du rejeu (rendu une fois dans `AppRouter`) :
 * un composant qui ne peint rien et ne porte que l'effet ci-dessus.
 */
export function OutboxReplayWatcher() {
  useOutboxReplay();
  return null;
}
