import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { data, isLocalMode } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import {
  syncHousehold,
  type FullSyncProgress,
  type FullSyncReport,
} from './full-sync';

/**
 * Intervalle de la synchro périodique (D-08) : 15 minutes, tant que l’app est
 * ouverte (onglet visible) et en ligne. Sobre par construction — T-09-05 :
 * déclenchement manuel + intervalle espacé, tables lues séquentiellement, les
 * mêmes lectures RLS que la navigation. Aucune promesse d’arrière-plan onglet
 * fermé au-delà du handler Background Sync 09-02 (rejeu de file, pas relecture).
 */
export const FULL_SYNC_INTERVAL_MS = 15 * 60 * 1000;

const LAST_FULL_SYNC_KEY = 'eo:last-full-sync-at';

function readLastFullSyncAt(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_FULL_SYNC_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Garde-fous partagés entre instances (l’app monte le minuteur dans
 * `app-shell`, le bouton dans le panneau) : un seul rejeu à la fois, et un
 * seul passage auto par intervalle même à deux instances.
 */
let fullSyncInFlight: Promise<FullSyncReport> | null = null;
let lastAutoRunAt = 0;

export interface FullSyncState {
  syncing: boolean;
  progress: FullSyncProgress | null;
  report: FullSyncReport | null;
  /** Horodatage (ms) de la dernière synchro ayant rechargé au moins une table. */
  lastFullSyncAt: number | null;
  syncNowFull: () => Promise<void>;
}

/**
 * Bouton manuel + minuteur périodique de la synchro foyer. Le minuteur ne
 * tourne que si `auto` (l’app-shell le monte pour toute l’app, le panneau
 * n’a besoin que du bouton) et saute silencieusement les tops hors ligne ou
 * onglet masqué — sans erreur, sans horodatage.
 */
export function useFullSync(options?: { auto?: boolean }): FullSyncState {
  const auto = options?.auto ?? true;
  const householdId = useHouseholdStore((state) => state.householdId);
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<FullSyncProgress | null>(null);
  const [report, setReport] = useState<FullSyncReport | null>(null);
  const [lastFullSyncAt, setLastFullSyncAt] = useState<number | null>(() => readLastFullSyncAt());
  const syncingRef = useRef(false);

  const syncNowFull = useCallback(async () => {
    if (isLocalMode || !householdId || syncingRef.current) return;
    // Deux instances (shell + panneau) : la seconde attend la première.
    if (fullSyncInFlight) {
      await fullSyncInFlight;
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    setProgress(null);
    const run = syncHousehold(data, householdId, (fired) => setProgress(fired));
    fullSyncInFlight = run;
    try {
      const result = await run;
      setReport(result);
      await queryClient.invalidateQueries();
      // N’horodate que le réel : un passage tout-en-échec (serveur en panne)
      // n’est pas une « dernière synchro ».
      if (result.synced.length > 0) {
        const stamped = Date.now();
        setLastFullSyncAt(stamped);
        try {
          localStorage.setItem(LAST_FULL_SYNC_KEY, String(stamped));
        } catch {
          // Stockage indisponible : l’horodatage reste en mémoire, sans casser.
        }
      }
    } finally {
      fullSyncInFlight = null;
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [householdId, queryClient]);

  useEffect(() => {
    if (!auto || isLocalMode || !householdId || typeof window === 'undefined') return;
    const tick = () => {
      // Onglet masqué : pas de promesse d’arrière-plan, on saute sans bruit.
      if (typeof document !== 'undefined' && document.hidden) return;
      // Hors ligne : saut silencieux, jamais une erreur.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastAutoRunAt < FULL_SYNC_INTERVAL_MS) return;
      lastAutoRunAt = now;
      void syncNowFull();
    };
    const id = window.setInterval(tick, FULL_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [auto, householdId, syncNowFull]);

  return { syncing, progress, report, lastFullSyncAt, syncNowFull };
}
