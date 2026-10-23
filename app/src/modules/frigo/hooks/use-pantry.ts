import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { useHouseholdStore } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import type { PantryItemRow } from '@/types';
import { createPantryItem, removePantryItem, updatePantryItem } from '../api';
import { sortPantryItems, toPantryItem, type PantryFormValues, type PantryItem, type PantryLocation } from '../types';

/**
 * Articles du frigo du foyer : lecture via `useResource` (cache TanStack,
 * RLS côté serveur), écritures via `api.ts` (jamais d'écriture optimiste :
 * l'état affiché doit rester la vérité du foyer).
 * Le tri (péremption) et les comptages sont dérivés, jamais stockés.
 */
export interface PantryResource {
  items: PantryItem[];
  today: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveItem: (id: string | null, values: PantryFormValues) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  itemsOfLocation: (location: PantryLocation | 'tous') => PantryItem[];
}

export function usePantry(): PantryResource {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const resource = useResource<PantryItemRow>('pantry_items', {
    filter: { household_id: householdId ?? '' },
    enabled: Boolean(householdId),
  });

  const today = todayIso();
  // Invalidation par prédicat (motif du calendrier) : elle atteint la clé
  // réelle de `useResource` ([table, householdId, filter, selectKey]).
  const refresh = useCallback(() => {
    void invalidateTables(queryClient, ['pantry_items']);
  }, [queryClient]);

  // Réactivité hors ligne / démo : l'adaptateur local notifie les écritures.
  useEffect(() => data.subscribe('pantry_items', refresh), [refresh]);

  const items = useMemo(() => resource.rows.map(toPantryItem), [resource.rows]);

  const itemsOfLocation = useCallback(
    (location: PantryLocation | 'tous') => {
      const rows = location === 'tous' ? items : items.filter((item) => item.location === location);
      return sortPantryItems(rows, today);
    },
    [items, today],
  );

  const saveItem = useCallback(
    async (id: string | null, values: PantryFormValues) => {
      if (id) {
        await updatePantryItem(id, values);
      } else {
        await createPantryItem(values, householdId ?? '');
      }
      refresh();
    },
    [householdId, refresh],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await removePantryItem(id);
      refresh();
    },
    [refresh],
  );

  return {
    items,
    today,
    isLoading: resource.isLoading,
    isError: resource.isError,
    error: resource.error,
    refetch: resource.refetch,
    isMutating: resource.isMutating,
    saveItem,
    removeItem,
    itemsOfLocation,
  };
}
