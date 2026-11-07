import { useCallback, useMemo } from 'react';
import { keepPreviousData, onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  /**
   * Vrai UNIQUEMENT hors ligne, en erreur et sans aucune donnée en cache
   * (35-09, G-35-5) : c'est le cas où `error` porte le message D-11 substitué
   * au lieu de l'erreur transport brute. Les pages qui veulent distinguer
   * l'état sans dépendre du texte du message lisent ce booléen.
   */
  offlineWithoutData: boolean;
  /**
   * Vrai dès que la requête porte des données (35-10) — `data !== undefined`,
   * même périmées ou en échec de refetch. Les compositions d'annexe des hooks
   * (tâches, routines) l'utilisent pour ne JAMAIS laisser l'échec d'une annexe
   * masquer des lignes en cache (D-09 : les lignes rendues restent
   * autoritaires, G-35-6).
   */
  hasData: boolean;
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
 * L'échec vient-il d'être enfilé dans l'outbox ?
 *
 * Le MutationCache (query-policy.ts) vient d'enfiler cette écriture dans
 * l'outbox (D-02) : absorber l'échec ici — le signal utilisateur est le
 * badge D-11/D-12, pas un toast d'erreur (UAT-34-1). Le prédicat recopie
 * EXACTEMENT le filtre `onError` du MutationCache (meta table+operation
 * garanti par construction : les trois mutations portent leur meta et le
 * catch vit dans le même hook qui les a lancées) pour ne JAMAIS avaler un
 * échec non enfilé — table hors liste ou refus métier —, ce qui serait une
 * perte silencieuse (T-34-14). L'export sert au test d'invariant qui refuse
 * toute divergence future entre les deux couches.
 */
export function isEnqueuedFailure(table: string, error: unknown): boolean {
  return isWriteAllowed(table) && isNetworkFailure(error);
}

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
 * Message D-11 (35-09, gap G-35-5) : hors ligne, SANS données en cache, la
 * lecture réseau (qui part quand même sous networkMode 'always', D-10 —
 * inchangé) échoue et l'utilisateur voyait « TypeError: Failed to fetch ». Le
 * message substitué décrit le fait sans suggérer aucune perte : les données
 * ne sont pas ENCORE sur cet appareil, une reconnexion les mettra en cache.
 */
export const MESSAGE_HORS_LIGNE_SANS_DONNEES =
  'Ces données ne sont pas encore sur cet appareil — reconnectez-vous une fois pour les mettre en cache.';

/**
 * Garde hors-ligne partage (35-10, gap G-35-6) : miroir EXACT du useMemo de
 * substitution de `useResource` ci-dessous, extrait pour les compositions
 * d'erreur qui mélangent un `useResource` principal et des annexes `useQuery`
 * brutes (tâches, routines). Une seule mécanique, deux appelants — le message
 * et la condition ne peuvent pas diverger (§2.7 E).
 *
 * - hors ligne + en erreur + SANS données → l'état honnête D-11, l'erreur
 *   d'origine préservée en `cause` (rien n'est avalé pour le diagnostic) ;
 * - en erreur AVEC données → null (D-09 : les lignes rendues restent
 *   autoritaires, l'erreur ne les masque pas) ;
 * - hors erreur → null ; en ligne → l'erreur brute, inchangée (D-11
 *   n'édulcore rien en ligne).
 *
 * Les annexes (assignataires, rappels) sont hors persistance (décision 33-03)
 * : leur erreur brute ne doit jamais écraser l'état honnête quand l'app se
 * sait hors ligne, ni passer en ligne — c'est la chaîne `?? annexe` des hooks
 * qui décide de qui gagne ; ce helper garantit que ce qui passe est digne
 * d'être rendu.
 */
export function composeOfflineAwareError(query: { isError: boolean; data: unknown; error: unknown }): Error | null {
  if (!query.isError) return null;
  if (query.data !== undefined) return null;
  if (!onlineManager.isOnline()) return new Error(MESSAGE_HORS_LIGNE_SANS_DONNEES, { cause: query.error });
  return (query.error as Error | null) ?? null;
}

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
  // une écriture hors liste quand l'app est hors ligne. La copie posée dans
  // l'adaptateur (supabase-adapter.ts) est un filet de sécurité de classe
  // (§2.7 E) ; celle-ci, AVANT prepareCreate, protège l'overlay optimiste :
  // sans elle, une écriture refusée peindrait puis dépeindrait une ligne
  // fantôme dans le cache.
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
        // UAT-34-1 : si le MutationCache vient d'enfiler l'écriture (table
        // allowlistée + échec réseau), l'incident transport ne remonte PAS
        // à l'appelant — la promesse rend la ligne overlay déjà peinte
        // (identité client id + client_key portée par l'outbox, cohérente
        // avec la réconciliation du rejeu). Sinon comportement inchangé :
        // refus métier → retrait d'overlay + rejet.
        if (prepared.overlay && isEnqueuedFailure(table, error)) return prepared.overlay as T;
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
        // UAT-34-1 : écriture enfilée (D-02) → l'incident transport ne
        // remonte pas ; la promesse rend la ligne fusionnée LUE DANS LE
        // CACHE, source de vérité de l'overlay. WR-02 : sur échec RÉSEAU
        // l'overlay RESTE peint : la MutationCache vient d'enfiler l'update
        // dans l'outbox et le rejeu le réconciliera. Restaurer le snapshot
        // sans distinction ferait disparaître à l'écran un changement qui
        // s'appliquera pourtant au rejeu — et ferait diverger l'écran de la
        // file jusqu'à l'invalidation suivante. Seul un refus MÉTIER remet
        // l'écran en l'état : l'écriture n'aura jamais lieu.
        if (isEnqueuedFailure(table, error)) {
          // Ligne fusionnée lue dans le cache, source de vérité de
          // l'overlay ; si la ligne n'est pas (encore) peinte — cache vide
          // ou requête désactivée — la promesse reflète quand même l'état
          // final de la file : l'écriture est enfilée, la ligne
          // réconciliée au rejeu portera { id, ...values }. Relancer ici
          // ferait absorber l'échec selon la chance du cache (T-34-15).
          const cached = (queryClient.getQueryData<T[]>(key) ?? []).find(
            (row) => hasId(row as unknown as Row) && (row as unknown as Row).id === id,
          );
          if (cached !== undefined) return cached;
          return { ...(values as object), id } as T;
        }
        if (!isNetworkFailure(error)) queryClient.setQueryData<T[]>(key, snapshot);
        throw error;
      }
    },
    [create, invalidate, key, optimistic, queryClient, updateMutation],
  );

  const update = useCallback(async (id: string, values: Partial<T>) => mutate(id, values), [mutate]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await removeMutation.mutateAsync(id);
        await invalidate();
      } catch (error) {
        // UAT-34-1 : un remove enfilé (table allowlistée + échec réseau,
        // D-02) résout — le rejet d'un incident transport déjà converti en
        // écriture différée ne doit pas atteindre l'appelant. Le remove ne
        // pose pas d'overlay optimiste, il n'y a donc ni snapshot ni
        // restauration à faire ici : sur un refus métier, le rejet seul se
        // propage (D-10) et le cache est déjà en l'état.
        if (isEnqueuedFailure(table, error)) return;
        throw error;
      }
    },
    [invalidate, removeMutation, table],
  );

  // 35-09 (G-35-5) : hors ligne, sans données en cache, l'erreur transport
  // brute est substituée par l'état honnête D-11 — l'ErrorState des pages rend
  // `error?.message` tel quel, la substitution dans le hook suffit sans
  // toucher aucune page. L'erreur d'origine est PRÉSERVÉE en `error.cause`
  // (ES2022) pour le diagnostic machine : rien n'est avalé. La substitution
  // ne s'applique QUE sans données (D-09 inchangé avec du cache) et QUE hors
  // ligne (en ligne, le message d'origine reste entier).
  // 35-10 : la mécanique vit dans `composeOfflineAwareError` — un seul site
  // pour la condition et le message, partagé avec les annexes des hooks.
  const offlineWithoutData = query.isError && query.data === undefined && !onlineManager.isOnline();
  const error = useMemo(
    () => composeOfflineAwareError(query),
    // `query.data` participe : la substitution bascule dès qu'une donnée
    // apparaît (hydrate offline) ou disparaît.
    [query.isError, query.data, query.error],
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
    error,
    offlineWithoutData,
    hasData: query.data !== undefined,
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
