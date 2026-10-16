import { useCallback, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from './index';
import { useHouseholdStore } from '@/stores/household-store';
import type { Row, RowFilter } from '@/types';

export const queryKeys = {
  // Le quatrième élément est le `selectKey` (D-08) : deux `select` différents
  // sur la même table et le même filtre ne partagent plus d'entrée. `null`
  // quand aucun sélecteur n'est déclaré — les deux sites d'appel (`useResource`
  // et `useLinkedRows`) gardent ainsi la même forme de clé, et l'invalidation
  // par préfixe (`[table]`) continue de les atteindre.
  table: (table: string, householdId: string | null, filter?: RowFilter, selectKey?: string) =>
    [table, householdId, filter ?? {}, selectKey ?? null] as const,
  tableAll: (table: string) => ['all', table] as const,
};

export interface ResourceResult<T> {
  rows: T[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  create: (values: Partial<T>) => Promise<T>;
  update: (id: string, values: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
  isMutating: boolean;
  /** Insertion ou mise à jour optimiste avec retour arrière en cas d'erreur. */
  mutate: (id: string | null, values: Partial<T>) => Promise<T>;
}

/** Options communes aux deux formes de `UseResourceOptions`. */
interface ResourceOptionsBase {
  filter?: RowFilter;
  enabled?: boolean;
  optimistic?: boolean;
  /** Ajoute automatiquement le filtre `household_id` du foyer courant. */
  scoped?: boolean;
  /** Re-interroge la ressource à intervalle régulier (ms). `false` = désactivé. */
  refetchInterval?: number | false;
}

/**
 * Options SANS sélecteur, ou options AVEC sélecteur — jamais l'un sans l'autre.
 *
 * D-08 : la clé de cache doit contenir tout ce qui change le résultat. `select`
 * transforme les lignes, donc deux `select` différents sur la même table et le
 * même filtre ne doivent pas partager d'entrée. Mais la FONCTION `select` ne
 * peut **pas** entrer dans la clé : une flèche en ligne change d'identité à
 * chaque rendu et ferait boucler le rechargement — le piège que la revue
 * signale. C'est donc un `selectKey` **stable** (constante de module ou chaîne
 * littérale, jamais une valeur recalculée) que l'appelant déclare, et que le
 * type exige dès qu'un `select` est présent : l'oubli devient une erreur de
 * compilation, pas un piège silencieux.
 */
export type UseResourceOptions =
  | (ResourceOptionsBase & { select?: undefined; selectKey?: never })
  | (ResourceOptionsBase & { select: (rows: Row[]) => Row[]; selectKey: string });

const hasId = (row: Row): row is Row & { id: string } => typeof row.id === 'string';

/**
 * Hook CRUD générique : une seule implémentation de cache, d'invalidation et
 * de mise à jour optimiste pour tous les modules.
 */
export function useResource<T = Row>(
  table: string,
  { filter, enabled = true, select, selectKey, optimistic = true, scoped = true, refetchInterval = false }: UseResourceOptions = {},
): ResourceResult<T> {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const effectiveFilter = useMemo<RowFilter>(
    () => (scoped && householdId && filter?.household_id === undefined ? { ...filter, household_id: householdId } : { ...filter }),
    [filter, householdId, scoped],
  );
  const key = queryKeys.table(table, householdId, effectiveFilter, selectKey);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && (scoped ? Boolean(householdId) : true),
    placeholderData: keepPreviousData,
    refetchInterval,
    queryFn: async () => {
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
        queryClient.setQueryData<T[]>(key, snapshot);
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
  add: (values: Partial<T>) => Promise<T>;
  remove: (filter: RowFilter) => Promise<void>;
  isMutating: boolean;
}

/** Lignes de jointure (sans `id`) : ajout et retrait par filtre. */
export function useLinkedRows<T = Row>(table: string, filter: RowFilter = {}): LinkedResult<T> {
  const queryClient = useQueryClient();
  const key = queryKeys.table(table, null, filter);

  const query = useQuery({
    queryKey: key,
    queryFn: async () => data.list<T>(table, filter),
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
    add,
    remove,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}

/** Accès direct à l'adaptateur pour les requêtes composées d'un module. */
export function useDataAdapter() {
  return useMemo(() => data, []);
}
