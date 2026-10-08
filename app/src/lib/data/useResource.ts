import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from './index';
import { DataError, type ListResult } from './adapter';
import { useHouseholdStore } from '@/stores/household-store';
import type { Row, RowFilter } from '@/types';

export const queryKeys = {
  table: (table: string, householdId: string | null, filter?: RowFilter) => [table, householdId, filter ?? {}] as const,
  tableAll: (table: string) => ['all', table] as const,
};

export interface ResourceResult<T> {
  rows: T[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  /**
   * Vrai quand `rows` vient du cache local après un échec réseau (D-01) :
   * à afficher comme données périmées, jamais comme du direct.
   */
  isStale: boolean;
  /** Alias de `isStale`, conservé pour l'honnêteté d'affichage. */
  dataFromCache: boolean;
  refetch: () => void;
  create: (values: Partial<T>) => Promise<T>;
  update: (id: string, values: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
  isMutating: boolean;
  /** Insertion ou mise à jour optimiste avec retour arrière en cas d'erreur. */
  mutate: (id: string | null, values: Partial<T>) => Promise<T>;
}

export interface UseResourceOptions {
  filter?: RowFilter;
  enabled?: boolean;
  select?: (rows: Row[]) => Row[];
  optimistic?: boolean;
  /** Ajoute automatiquement le filtre `household_id` du foyer courant. */
  scoped?: boolean;
  /** Re-interroge la ressource à intervalle régulier (ms). `false` = désactivé. */
  refetchInterval?: number | false;
}

const hasId = (row: Row): row is Row & { id: string } => typeof row.id === 'string';

/**
 * Hook CRUD générique : une seule implémentation de cache, d'invalidation et
 * de mise à jour optimiste pour tous les modules.
 */
export function useResource<T = Row>(
  table: string,
  { filter, enabled = true, select, optimistic = true, scoped = true, refetchInterval = false }: UseResourceOptions = {},
): ResourceResult<T> {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const effectiveFilter = useMemo<RowFilter>(
    () => (scoped && householdId && filter?.household_id === undefined ? { ...filter, household_id: householdId } : { ...filter }),
    [filter, householdId, scoped],
  );
  const key = queryKeys.table(table, householdId, effectiveFilter);
  // Positionné par `queryFn` ci-dessous : vrai quand la dernière lecture a
  // servi le cache local (repli D-01). État local au hook, pas de course
  // entre tables : chaque instance ne suit que sa propre requête.
  const [dataFromCache, setDataFromCache] = useState(false);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && (scoped ? Boolean(householdId) : true),
    placeholderData: keepPreviousData,
    refetchInterval,
    queryFn: async () => {
      const withMeta = data as typeof data & {
        listWithMeta?: <T>(table: string, filter?: RowFilter) => Promise<ListResult<T>>;
      };
      if (typeof withMeta.listWithMeta === 'function') {
        const result = await withMeta.listWithMeta<T>(table, effectiveFilter);
        setDataFromCache(result.fromCache);
        return (select ? select(result.rows as unknown as Row[]) : (result.rows as unknown as Row[])) as T[];
      }
      setDataFromCache(false);
      const rows = await data.list<T>(table, effectiveFilter);
      return (select ? select(rows as unknown as Row[]) : (rows as unknown as Row[])) as T[];
    },
  });

  const invalidate = useCallback(async () => {
    // Les clés de requêtes commencent toutes par le nom de la table :
    // une invalidation par préfixe touche tous les filtres de la table.
    await queryClient.invalidateQueries({ queryKey: [table] });
  }, [queryClient, table]);

  const createMutation = useMutation({ mutationFn: (values: Partial<T>) => data.create<T>(table, values) });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<T> }) => data.update<T>(table, id, values),
  });
  const removeMutation = useMutation({ mutationFn: (id: string) => data.remove(table, id) });

  const mutate = useCallback(
    async (id: string | null, values: Partial<T>) => {
      if (!optimistic || !id) {
        const result = id ? await updateMutation.mutateAsync({ id, values }) : await createMutation.mutateAsync(values);
        await invalidate();
        return result;
      }
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<T[]>(key);
      queryClient.setQueryData<T[]>(key, (previous) =>
        (previous ?? []).map((row) => (hasId(row as unknown as Row) && (row as unknown as Row).id === id ? { ...row, ...values } : row)),
      );
      try {
        const result = await updateMutation.mutateAsync({ id, values });
        await invalidate();
        return result;
      } catch (error) {
        // Écriture mise en file (D-02) : l'état optimiste est conservé, il
        // sera confirmé au rejeu. Seule une vraie erreur retourne en arrière.
        if (!(error instanceof DataError) || !error.queuedForSync) {
          queryClient.setQueryData<T[]>(key, snapshot);
        }
        throw error;
      }
    },
    [createMutation, invalidate, key, optimistic, queryClient, updateMutation],
  );

  const create = useCallback(
    async (values: Partial<T>) => {
      const result = await createMutation.mutateAsync(values);
      await invalidate();
      return result;
    },
    [createMutation, invalidate],
  );

  const update = useCallback(async (id: string, values: Partial<T>) => mutate(id, values), [mutate]);

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
      await invalidate();
    },
    [invalidate, removeMutation],
  );

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    isStale: dataFromCache,
    dataFromCache,
    refetch: () => void query.refetch(),
    create,
    update,
    remove,
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
    mutate,
  };
}

export interface LinkedResult<T> {
  rows: T[];
  isLoading: boolean;
  /** Vrai quand `rows` vient du cache local après un échec réseau (D-01). */
  isStale: boolean;
  /** Alias de `isStale`. */
  dataFromCache: boolean;
  add: (values: Partial<T>) => Promise<T>;
  remove: (filter: RowFilter) => Promise<void>;
  isMutating: boolean;
}

/** Lignes de jointure (sans `id`) : ajout et retrait par filtre. */
export function useLinkedRows<T = Row>(table: string, filter: RowFilter = {}): LinkedResult<T> {
  const queryClient = useQueryClient();
  const key = queryKeys.table(table, null, filter);
  const [dataFromCache, setDataFromCache] = useState(false);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const withMeta = data as typeof data & {
        listWithMeta?: <T>(table: string, filter?: RowFilter) => Promise<ListResult<T>>;
      };
      if (typeof withMeta.listWithMeta === 'function') {
        const result = await withMeta.listWithMeta<T>(table, filter);
        setDataFromCache(result.fromCache);
        return result.rows;
      }
      setDataFromCache(false);
      return data.list<T>(table, filter);
    },
  });

  const addMutation = useMutation({ mutationFn: (values: Partial<T>) => data.create<T>(table, values) });
  const removeMutation = useMutation({ mutationFn: (values: RowFilter) => data.removeWhere(table, values) });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [table] });
  }, [queryClient, table]);

  const add = useCallback(
    async (values: Partial<T>) => {
      const result = await addMutation.mutateAsync(values);
      await invalidate();
      return result;
    },
    [addMutation, invalidate],
  );

  const remove = useCallback(
    async (values: RowFilter) => {
      await removeMutation.mutateAsync(values);
      await invalidate();
    },
    [invalidate, removeMutation],
  );

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isStale: dataFromCache,
    dataFromCache,
    add,
    remove,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}

/** Accès direct à l'adaptateur pour les requêtes composées d'un module. */
export function useDataAdapter() {
  return useMemo(() => data, []);
}
