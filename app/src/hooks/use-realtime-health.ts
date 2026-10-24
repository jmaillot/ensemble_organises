import { useSyncExternalStore } from 'react';
import { getRealtimeHealth, subscribeRealtimeHealth, type RealtimeHealth } from '@/lib/data/supabase-adapter';
import { isLocalMode } from '@/lib/data';

/**
 * Santé du canal temps réel : `ok` tant qu'un canal au moins est abonné,
 * `degraded` dès qu'un canal signale une erreur — et toujours `ok` en mode
 * démo local, où aucun canal n'existe et rien ne peut se dégrader.
 */
export function useRealtimeHealth(): RealtimeHealth {
  return useSyncExternalStore(subscribeRealtimeHealth, getRealtimeHealth, () => 'ok' as const);
}

/** En mode local, le temps réel n'existe pas : rien à signaler. */
export function useRealtimeDegraded(): boolean {
  const health = useRealtimeHealth();
  return !isLocalMode && health === 'degraded';
}
