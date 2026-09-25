import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLocalMode } from '@/lib/data';
import { data } from '@/lib/data';
import { flushMutations, pendingCount } from '@/lib/data/sync-queue';
import { queryKeys } from '@/lib/data/useResource';
import { useToast } from '@/components/ui/toast';

export interface OfflineSyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
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
      const result = await flushMutations(async (mutation) => {
        try {
          if (mutation.operation === 'delete') {
            await data.remove(mutation.table, mutation.rowId);
            return { ok: true };
          }
          if (mutation.operation === 'update') {
            await data.update(mutation.table, mutation.rowId, mutation.values);
            return { ok: true };
          }
          await data.create(mutation.table, mutation.values as never);
          return { ok: true };
        } catch {
          return { ok: false };
        }
      });
      await queryClient.invalidateQueries();
      await refreshPending();
      if (result.replayed > 0) toast(`${result.replayed} modification(s) synchronisée(s).`);
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
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshPending, syncNow]);

  return { online, pending, syncing, syncNow };
}

export { queryKeys };
