import { useCallback, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from './index';
import { assertWriteAllowed, isWriteAllowed } from '@/lib/query-policy';
import { isNetworkFailure, newClientKey } from '@/lib/offline/outbox';
import { isKeylessTable } from './keys';
import { randomId } from '@/lib/utils';
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
 * Prépare une création sur table allowlistée (Pitfall 7, RESEARCH 34).
 *
 * L'identité est générée CÔTÉ CLIENT d'emblée : l'`id` texte (l'adaptateur le
 * transmet tel quel) et la `client_key` uuid (D-05/D-14 — clé d'idempotence
 * du rejeu). Injectés pour TOUTE création allowlistée, en ligne comme hors
 * ligne : depuis 0177, la base refuse (NOT NULL sans défaut) toute insertion
 * sans `client_key`. Pour une jointure sans `id` (ex. `task_assignees`), la
 * `client_key` seule est injectée. Hors liste : comportement inchangé.
 */
function prepareCreate<T>(table: string, values: Partial<T>): { values: Partial<T>; overlay: Partial<T> | null } {
  if (!isWriteAllowed(table)) return { values, overlay: null };
  const withKey = { ...values, client_key: newClientKey() } as Partial<T>;
  if (isKeylessTable(table)) return { values: withKey, overlay: withKey };
  const row = { ...withKey, id: randomId(table) } as Partial<T>;
  // Les champs d'audit sont posés par le serveur (défauts SQL) : l'overlay
  // les simule, sinon la chaîne de select des vues (ex. buildRoutines lit
  // `row.created_at`) crashe sur la ligne optimiste. D-16 : Realtime /
  // invalidation remplaceront l'overlay par la ligne serveur.
  const now = new Date().toISOString();
  const overlay = { ...row, created_at: now, updated_at: now } as Partial<T>;
  return { values: row, overlay };
}

/**
 * Repli de `rows` quand la requête est désactivée ou n'a rien rendu.
 *
 * Constante de MODULE, jamais un littéral sur place : `query.data ?? []`
 * fabrique un tableau neuf à chaque rendu, donc tout `useMemo` qui dépend de
 * `rows` se recalcule sans qu'aucune donnée ait changé (constat (d) de la
 * phase 19, fermé ici). `never[]` est assignable à n'importe quel `T[]` : le
 * repli n'impose aucun type à l'appelant.
 */
const NO_ROWS: never[] = [];

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

  // meta { table, operation } : la marque que lit le MutationCache central
  // (D-02) pour enfiler l'écriture en cas d'échec réseau — aucun composant de
  // vue ne change. assertWriteAllowed (D-07) refuse AVANT tout départ réseau
  // une écriture hors liste quand l'app est hors ligne.
  const createMutation = useMutation({
    mutationFn: (values: Partial<T>) => {
      assertWriteAllowed(table);
      return data.create<T>(table, values);
    },
    meta: { table, operation: 'create' },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<T> }) => {
      assertWriteAllowed(table);
      return data.update<T>(table, id, values);
    },
    meta: { table, operation: 'update' },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => {
      assertWriteAllowed(table);
      return data.remove(table, id);
    },
    meta: { table, operation: 'remove' },
  });

  const create = useCallback(
    async (values: Partial<T>) => {
      const prepared = prepareCreate(table, values);
      // Overlay optimiste (Pitfall 7) : la ligne est peinte immédiatement
      // avec l'identité client (id + client_key). Au refus MÉTIER (RLS,
      // check) elle est retirée — l'écriture n'aura jamais lieu ; à l'échec
      // RÉSEAU elle RESTE peinte : l'écriture vient d'être enfilée dans
      // l'outbox et le rejeu la réconciliera. `isNetworkFailure` distingue
      // les deux (Pitfall 2).
      const snapshot = queryClient.getQueryData<T[]>(key);
      if (prepared.overlay) {
        queryClient.setQueryData<T[]>(key, (previous) => [...(previous ?? []), prepared.overlay as T]);
      }
      try {
        const result = await createMutation.mutateAsync(prepared.values);
        await invalidate();
        return result;
      } catch (error) {
        if (prepared.overlay && !isNetworkFailure(error)) queryClient.setQueryData<T[]>(key, snapshot);
        throw error;
      }
    },
    [createMutation, invalidate, key, queryClient, table],
  );

  const mutate = useCallback(
    async (id: string | null, values: Partial<T>) => {
      if (!optimistic || !id) {
        // La branche create passe par `create` : mêmes identité client
        // (id + client_key) et overlay optimiste que la voie directe.
        const result = id ? await updateMutation.mutateAsync({ id, values }) : await create(values);
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
    [create, invalidate, key, optimistic, queryClient, updateMutation],
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
    rows: query.data ?? NO_ROWS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // Après un refetch échoué hors ligne, TanStack v5 garde `data` et pose
    // `status: "error"` — l'erreur n'est honnête que SANS données en cache
    // (D-09) ; les lignes rendues restent signalées périmées par le bandeau
    // ambre (D-12/D-13).
    isError: query.isError && query.data === undefined,
    error: query.isError && query.data === undefined ? ((query.error as Error | null) ?? null) : null,
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

  // Mêmes marque meta et même garde upfront que useResource (Pitfall 6 :
  // useLinkedRows est un DEUXIÈME chemin de mutation — `task_assignees` et
  // `routine_assignees` passent ici, pas par les 3 mutations de useResource).
  const addMutation = useMutation({
    mutationFn: (values: Partial<T>) => {
      assertWriteAllowed(table);
      return data.create<T>(table, values);
    },
    meta: { table, operation: 'create' },
  });
  const removeMutation = useMutation({
    mutationFn: (values: RowFilter) => {
      assertWriteAllowed(table);
      return data.removeWhere(table, values);
    },
    meta: { table, operation: 'removeWhere' },
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [table] });
  }, [queryClient, table]);

  const add = useCallback(
    async (values: Partial<T>) => {
      // Identité client (`client_key`) injectée comme dans useResource —
      // depuis 0177 la base refuse une jointure Tier 1 sans client_key.
      const prepared = prepareCreate(table, values);
      const result = await addMutation.mutateAsync(prepared.values);
      await invalidate();
      return result;
    },
    [addMutation, invalidate, table],
  );

  const remove = useCallback(
    async (values: RowFilter) => {
      await removeMutation.mutateAsync(values);
      await invalidate();
    },
    [invalidate, removeMutation],
  );

  return {
    rows: query.data ?? NO_ROWS,
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
