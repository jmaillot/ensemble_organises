import { useEffect } from 'react';
import { useOutbox } from './use-outbox';
import { useBannerStore } from '@/components/banners/banner-store';

/** kind du bandeau outbox dans le banner-store — consommé par banner-slot.tsx. */
export const OUTBOX_BANNER_KIND = 'outbox-pending';

/**
 * Badge « N en attente » / « N bloquées » (phase 34, D-11/D-13, WRQ-05).
 *
 * MONTÉ UNE SEULE FOIS, à côté du rejeu (`OutboxBadgeWatcher` dans
 * `router.tsx`) : le badge est un service global de l'app, pas une
 * préoccupation de vue — le même raisonnement que `useOutboxReplay` (plan 03).
 *
 * (a) D-13 : tant que la file n'est pas vide, le bandeau est poussé dans le
 * banner-store, VISIBLE EN LIGNE COMME HORS LIGNE (aucune condition réseau —
 * pendant le rejeu on voit le compteur descendre, preuve que ça s'applique).
 * Il retombe (dismiss) quand la file se vide. Déduplication garantie par le
 * store (un `kind` est remplacé, jamais dupliqué — Pitfall 4 du 32-RESEARCH).
 *
 * (b) D-11 : le payload porte `{ pending, failed }` ; quand au moins une
 * écriture est bloquée, le rendu du bandeau (banner-slot) affiche
 * « N bloquées » cliquable vers le panneau offline de Paramètres.
 *
 * Le toast d'échec terminal D-12 a été retiré (phase 36, D-03) : le badge est
 * l'unique signal actif et le panneau offline l'unique canal de détail — un
 * seul canal de vérité, le toast était du bruit redondant.
 */
export function useOutboxReplayBadge(): void {
  const { pendingCount, failedCount } = useOutbox();

  // (a)+(b) Badge : pousse/met à jour tant que la file n'est pas vide.
  useEffect(() => {
    if (pendingCount + failedCount > 0) {
      useBannerStore.getState().push({
        kind: OUTBOX_BANNER_KIND,
        // Priorité croissante : sw-update = 1, install = 2, offline-stale = 3.
        // La file d'écritures est l'information la plus urgente : au-dessus.
        priority: 4,
        payload: { pending: pendingCount, failed: failedCount },
      });
    } else {
      useBannerStore.getState().dismiss(OUTBOX_BANNER_KIND);
    }
  }, [pendingCount, failedCount]);
}

/**
 * Point de montage unique du badge (rendu une fois dans `AppRouter`, à côté
 * d'`OutboxReplayWatcher`) : un composant qui ne peint rien.
 */
export function OutboxBadgeWatcher() {
  useOutboxReplayBadge();
  return null;
}
