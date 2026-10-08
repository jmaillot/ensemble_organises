import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLocalMode } from '@/lib/data';
import { data } from '@/lib/data';
import { flushWithAdapter, pendingCount } from '@/lib/data/sync-queue';
import { EO_SYNC_DONE, EO_SYNC_MESSAGE, requestPeriodicSync } from '@/hooks/use-pwa';
import { queryKeys } from '@/lib/data/useResource';
import { useToast } from '@/components/ui/toast';

const LAST_SYNC_KEY = 'eo:last-sync-at';

function readLastSyncedAt(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export interface OfflineSyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  /** Horodatage (ms) de la dernière synchronisation réussie, `null` si jamais. */
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
}

/**
 * Rejoue la file de synchronisation à la reconnexion et signale le nombre
 * d'écritures en attente à l'utilisateur.
 */
export function useOfflineSync(): OfflineSyncState {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => readLastSyncedAt());
  const queryClient = useQueryClient();
  const toast = useToast();

  const refreshPending = useCallback(async () => {
    if (isLocalMode) return;
    setPending(await pendingCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (isLocalMode) return;
    setSyncing(true);
    try {
      // Rejeu ordonné vers l'adaptateur actif, `deleteWhere` compris : chaque
      // verbe est rejoué par `replayOne`, les échecs restant en file avec
      // `attempts` incrémenté (dernier-écrivain, D-06 — voir sync-queue.ts).
      const result = await flushWithAdapter(data);
      await queryClient.invalidateQueries();
      await refreshPending();
      const stamped = Date.now();
      setLastSyncedAt(stamped);
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(stamped));
      } catch {
        // Stockage indisponible (navigation privée stricte) : l'horodatage
        // reste en mémoire pour la session, sans casser la synchronisation.
      }
      if (result.replayed > 0) toast(`${result.replayed} modification(s) synchronisée(s).`);
      if (result.failed > 0) toast(`${result.failed} modification(s) restent en attente (conflit ou réseau).`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [queryClient, refreshPending, toast]);

  useEffect(() => {
    void refreshPending();
    if (isLocalMode) return;

    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Déclenchement Background Sync (D-05) : le worker réveillé par le
    // navigateur demande aux onglets de rejouer — même `syncNow`, donc même
    // chemin `flushWithAdapter`, sans changement de protocole. L'accusé
    // passé par le port dédié libère le `waitUntil` du worker.
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: unknown } | null;
      if (!payload || payload.type !== EO_SYNC_MESSAGE) return;
      const replyPort = event.ports?.[0];
      void (async () => {
        try {
          await syncNow();
        } finally {
          try {
            replyPort?.postMessage({ type: EO_SYNC_DONE });
          } catch {
            // Port fermé (onglet en cours de fermeture) : le worker a son timeout.
          }
        }
      })();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    }
    // Periodic Sync best-effort (Chrome/Edge) : sans support, sans effet.
    requestPeriodicSync();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
      }
    };
  }, [refreshPending, syncNow]);

  return { online, pending, syncing, lastSyncedAt, syncNow };
}

export { queryKeys };
