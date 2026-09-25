import { useCallback, useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { useHouseholdStore } from '@/stores/household-store';
import type { ProviderRow, ProviderTypeRow } from '@/types';
import {
  createProvider,
  createProviderType,
  removeProvider as removeProviderRow,
  removeProviderType as removeProviderTypeRow,
  updateProvider,
  updateProviderType,
} from '../api';
import { toProvider, toProviderType, type Provider, type ProviderDraft, type ProviderType } from '../types';

/**
 * Invalidation par table. `useResource` indexe ses requêtes par
 * `[table, householdId, filter]` : on cible la table en tête de clé pour
 * rafraîchir toutes les variantes de filtre d'un coup.
 */
function invalidateTables(queryClient: QueryClient, tables: string[]) {
  return Promise.all(
    tables.map((table) => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === table })),
  );
}

export interface UsePrestatairesResult {
  providers: Provider[];
  types: ProviderType[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveProvider: (id: string | null, draft: ProviderDraft) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  saveProviderType: (id: string | null, values: { name: string; icon: string }) => Promise<void>;
  deleteProviderType: (id: string) => Promise<number>;
}

/** Carnet d'adresses des prestataires, avec ses types résolus. */
export function usePrestataires(): UsePrestatairesResult {
  const householdId = useHouseholdStore((state) => state.householdId);
  const providersResource = useResource<ProviderRow>('providers');
  const typesResource = useResource<ProviderTypeRow>('provider_types');
  const queryClient = useQueryClient();

  const types = useMemo(
    () => typesResource.rows.map(toProviderType).sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    [typesResource.rows],
  );

  const providers = useMemo(
    () =>
      providersResource.rows
        .map((row) => toProvider(row, types))
        .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    [providersResource.rows, types],
  );

  const invalidate = useCallback(async () => {
    await invalidateTables(queryClient, ['providers', 'provider_types']);
  }, [queryClient]);

  const saveProvider = useCallback(
    async (id: string | null, draft: ProviderDraft) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (id) await updateProvider(id, draft);
      else await createProvider(householdId, draft);
      await invalidate();
    },
    [householdId, invalidate],
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await removeProviderRow(id);
      await invalidate();
    },
    [invalidate],
  );

  const saveProviderType = useCallback(
    async (id: string | null, values: { name: string; icon: string }) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (id) await updateProviderType(id, values);
      else await createProviderType(householdId, values);
      await invalidate();
    },
    [householdId, invalidate],
  );

  const deleteProviderType = useCallback(
    async (id: string) => {
      const detached = await removeProviderTypeRow(id);
      await invalidate();
      return detached;
    },
    [invalidate],
  );

  return {
    providers,
    types,
    isLoading: providersResource.isLoading || typesResource.isLoading,
    isError: providersResource.isError || typesResource.isError,
    error: providersResource.error ?? typesResource.error,
    refetch: () => {
      providersResource.refetch();
      typesResource.refetch();
    },
    isMutating: providersResource.isMutating || typesResource.isMutating,
    saveProvider,
    deleteProvider,
    saveProviderType,
    deleteProviderType,
  };
}
