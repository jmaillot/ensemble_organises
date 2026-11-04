import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryCache, QueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
// Sous-module direct, PAS le baril `date-fns/locale` : le baril évalue ~600
// modules de locales, et cette latence d'évaluation fait basculer en échec le
// test de reprise d'`use-auth.test.ts` (« ne relit pas à la reprise »),
// sensible au délai entre `householdLoaded` et `setReady` (prouvé : un délai
// synchrone de 500 ms en évaluation de module le reproduit). Le sous-module
// `date-fns/locale/fr` n'évalue que la locale française.
import { fr } from 'date-fns/locale/fr';
import { useOnlineStatus } from './use-online-status';
import { useBannerStore } from '@/components/banners/banner-store';
import { OFFLINE_FAMILIES } from '@/lib/query-policy';

/**
 * Bandeau « dernier état connu le [horodatage] » (OFFR-02) — D-12, D-13.
 *
 * POURQUOI CE CALCUL, ET POURQUOI LE MIN. L'horodatage affiché est la promesse
 * de fraîcheur faite à l'utilisateur (T-33-15) : un MIN mal calculé la fausse.
 * D-12 lettre : le MIN porte sur TOUTES les queries Tier 1 rendues depuis le
 * cache, annexes `household_members`/`profiles` COMPRISES (D-10 les fait
 * Tier 1). Une annexe très ancienne abaisse volontairement l'horodatage : c'est
 * la prudence demandée, jamais la plus flatteuse. L'exclusion des annexes
 * proposée par une ancienne annexe de l'UI-SPEC a été révoquée en révision de
 * plan (jamais approuvée par l'utilisateur, rendrait l'horodatage plus
 * flatteur).
 *
 * DÉTECTION « RENDU DEPUIS LE CACHE » (hypothèse flaggée OFFR-02). Le critère
 * du hook est `dataUpdatedAt > 0` : la donnée vient du cache et n'a jamais été
 * invalidée par un chargement. La coïncidence avec `isError` (RESEARCH
 * Pattern 5, via `networkMode: 'always'`) est observée par les pages, mais le
 * hook ne l'exige pas — le critère de partition des pages est porté par le
 * plan 03 / D-09.
 *
 * POURQUOI `useSyncExternalStore` SUR `queryCache.subscribe`. Même discipline
 * que `use-online-status.ts` : le cache TanStack est un magasin externe, on
 * s'y abonne au lieu d'en recopier l'état dans un state React. L'instantané
 * est recalculé à chaque notification du cache ; le MIN est pur et bon marché
 * (une dizaine de queries).
 */
function minTier1DataUpdatedAt(cache: QueryCache): number {
  let min = 0;
  for (const query of cache.getAll()) {
    const { dataUpdatedAt } = query.state;
    if (dataUpdatedAt <= 0) continue;
    const prefix = String(query.queryKey[0]);
    if (!OFFLINE_FAMILIES.some((family) => family.prefix === prefix)) continue;
    if (min === 0 || dataUpdatedAt < min) min = dataUpdatedAt;
  }
  return min;
}

function minDataUpdatedAtOf(client: QueryClient): number {
  return minTier1DataUpdatedAt(client.getQueryCache());
}

/**
 * Pousse/dismiss l'entrée `offline-stale` du banner-store et rend
 * l'horodatage formaté (date absolue, date-fns fr — jamais de relatif flou),
 * ou `null` quand le bandeau n'a pas lieu d'être.
 */
export function useOfflineStaleBanner(): string | null {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  // WR-05 (revue 33) : le `subscribe` est mémoïsé — inline, sa nouvelle
  // identité à chaque rendu du shell forçait React à se désabonner puis
  // réabonner au cache (churn sur un composant très rendu). `queryClient`
  // est stable (contexte), la dépendance ne retrigger donc jamais.
  const subscribe = useCallback(
    (onStoreChange: () => void) => queryClient.getQueryCache().subscribe(onStoreChange),
    [queryClient],
  );

  const minDataUpdatedAt = useSyncExternalStore(
    subscribe,
    () => minDataUpdatedAtOf(queryClient),
    () => 0,
  );

  const lastKnownAt =
    !isOnline && minDataUpdatedAt > 0
      ? format(new Date(minDataUpdatedAt), "d MMM 'à' HH:mm", { locale: fr })
      : null;

  useEffect(() => {
    if (!isOnline && minDataUpdatedAt > 0) {
      useBannerStore.getState().push({
        kind: 'offline-stale',
        // Priorité UI-SPEC : sw-update = 1, install = 2 → offline-stale = 3.
        priority: 3,
        payload: { lastKnownAt },
      });
    } else {
      useBannerStore.getState().dismiss('offline-stale');
    }
    // lastKnownAt dérive de minDataUpdatedAt ; le dismiss conditionnel couvre
    // le retour réseau (D-13) et le cas « plus de donnée Tier 1 rendue ».
  }, [isOnline, minDataUpdatedAt, lastKnownAt]);

  return lastKnownAt;
}
