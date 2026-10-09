import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from './index';
import { DataError, type ListResult } from './adapter';
import { isKeylessTable } from './keys';
import { useHouseholdStore } from '@/stores/household-store';
import { useOnline } from '@/hooks/use-online';
import { randomId } from '@/lib/utils';
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
  /**
   * Vrai quand il n'y a rien à afficher faute de réseau et de cache (D-07) :
   * premier lancement hors ligne ou lecture en échec sans repli. L'UI rend
   * alors l'état de cache vide explicite — jamais une liste muette, jamais
   * une erreur brute. Faux dès qu'une ligne existe (direct, périmée ou en
   * attente) et faux quand la dernière lecture a réussi (vraie liste vide).
   */
  isEmptyCacheOffline: boolean;
  /** Identifiants des créations en file, en attente de confirmation serveur. */
  pendingIds: string[];
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
  const online = useOnline();
  /**
   * Créations mises en file (D-07) : conservées hors du cache React Query —
   * un réessai qui écrase le cache ne doit pas les faire disparaître avant
   * leur rejeu — et fusionnées à `rows` ci-dessous jusqu'à confirmation.
   */
  const [pendingRows, setPendingRows] = useState<T[]>([]);

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
      // Identifiant stable généré côté appelant : en cas de mise en file, la
      // ligne optimiste, l'entrée de file et la future ligne serveur portent
      // le même `id` — le rejeu confirme sans dupliquer.
      const ensured =
        isKeylessTable(table) || typeof (values as { id?: unknown }).id === 'string'
          ? values
          : { ...values, id: randomId(table) };
      try {
        const result = await createMutation.mutateAsync(ensured);
        await invalidate();
        return result;
      } catch (error) {
        // Écriture mise en file (D-02/D-07) : la ligne reste visible, marquée
        // en attente, jusqu'à ce que le rejeu la confirme. Seule une vraie
        // erreur remonte à l'appelant.
        if (error instanceof DataError && error.queuedForSync) {
          const optimistic = ensured as unknown as T;
          const optimisticId = (ensured as { id?: unknown }).id;
          if (typeof optimisticId === 'string') {
            setPendingRows((previous) =>
              previous.some((row) => (row as unknown as Row).id === optimisticId)
                ? previous
                : [...previous, optimistic],
            );
          }
          return optimistic;
        }
        throw error;
      }
    },
    [createMutation, invalidate, table],
  );

  const update = useCallback(async (id: string, values: Partial<T>) => mutate(id, values), [mutate]);

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
      await invalidate();
    },
    [invalidate, removeMutation],
  );

  const serverRows = query.data ?? [];
  const pendingIds = useMemo(
    () =>
      pendingRows
        .map((row) => (row as unknown as Row).id)
        .filter((id): id is string => typeof id === 'string'),
    [pendingRows],
  );
  // Les lignes en attente survivent aux réessais : elles ne sont dans aucun
  // cache serveur, un `refetch` seul les effacerait de l'écran avant le rejeu.
  const rows = useMemo<T[]>(() => {
    if (pendingRows.length === 0) return serverRows;
    const serverIds = new Set(serverRows.map((row) => (row as unknown as Row).id));
    return [...serverRows, ...pendingRows.filter((row) => !serverIds.has((row as unknown as Row).id))];
  }, [serverRows, pendingRows]);

  // Confirmation : une ligne en attente retrouvée dans des données serveur a
  // été rejouée — la marque disparaît, sans doublon (même identifiant).
  useEffect(() => {
    if (pendingRows.length === 0 || !query.data) return;
    const serverIds = new Set(query.data.map((row) => (row as unknown as Row).id));
    setPendingRows((previous) => {
      const next = previous.filter((row) => !serverIds.has((row as unknown as Row).id));
      return next.length === previous.length ? previous : next;
    });
  }, [query.data, pendingRows.length]);

  // Cache vide hors ligne (D-07) : ni ligne en direct, ni repli périmé, ni
  // création en attente — et la dernière lecture n'a pas réussi (sinon c'est
  // une vraie liste vide). La requête doit être active : sans foyer, l'absence
  // de lignes n'est pas un état de cache.
  const queryEnabled = enabled && (scoped ? Boolean(householdId) : true);
  const isEmptyCacheOffline =
    queryEnabled && !online && rows.length === 0 && query.status !== 'success';

  return {
    rows,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    isStale: dataFromCache,
    dataFromCache,
    isEmptyCacheOffline,
    pendingIds,
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
