import { useEffect, useRef } from 'react';
import { useOutbox } from './use-outbox';
import { useBannerStore } from '@/components/banners/banner-store';
import { useToast } from '@/components/ui/toast';

/** kind du bandeau outbox dans le banner-store — consommé par banner-slot.tsx. */
export const OUTBOX_BANNER_KIND = 'outbox-pending';

/**
 * Badge « N en attente » / « N bloquées » + toast d'échec terminal (phase 34,
 * D-11/D-12/D-13, WRQ-05).
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
 * (c) D-12 : UN toast discret PAR PASSE d'échecs terminaux. Les échecs d'une
 * même passe arrivent en rafale (une mutation `setQueryData` par entrée) :
 * un antirebond attend la fin de la rafale pour n'en émettre qu'un. Un
 * simple retard réseau (pendingCount seul) NE toast PAS ; le toast ne
 * réapparaît que si de NOUVEAUX échecs surviennent (failedCount croît à
 * nouveau au-dessus de la dernière valeur vue).
 */
export function useOutboxReplayBadge(): void {
  const { pendingCount, failedCount } = useOutbox();
  const toast = useToast();

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

  // (c) Toast une fois par passe d'échecs (antirebond sur la rafale).
  const previousFailed = useRef(0);
  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    const previous = previousFailed.current;
    previousFailed.current = failedCount;
    if (failedCount <= previous) {
      // Recul (Abandonner) ou inchangé : une émission en attente est annulée —
      // la passe a peut-être été résolue entre-temps.
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
      return;
    }
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    const target = failedCount;
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      toast(
        target === 1
          ? '1 écriture n’a pas pu être appliquée — voir détails dans Paramètres.'
          : `${target} écritures n’ont pas pu être appliquées — voir détails dans Paramètres.`,
        'error',
      );
    }, 400);
    return () => {
      // Le nettoyage React n'annule PAS l'émission (la rafale re-rend entre
      // deux échecs de la même passe) : seul le recul de failedCount
      // l'annule, au-dessus.
    };
  }, [failedCount, toast]);
}

/**
 * Point de montage unique du badge (rendu une fois dans `AppRouter`, à côté
 * d'`OutboxReplayWatcher`) : un composant qui ne peint rien.
 */
export function OutboxBadgeWatcher() {
  useOutboxReplayBadge();
  return null;
}
