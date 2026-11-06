import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Row, TaskRow } from '@/types';
import { createTestQueryClient } from '@/test/render';
import type { UseResourceOptions } from './useResource';

/**
 * D-08 : la clé de cache doit contenir tout ce qui change le résultat, sans y
 * mettre la fonction `select`.
 *
 * La preuve porte sur la CLÉ, pas sur l'adaptateur : `data.list` est observé et
 * rend, pour la table `tasks`, deux lignes reconnaissables — une tâche de foyer
 * (`trip_id` nul) et une tâche de voyage (`trip_id` non nul). `vi.mock` étant
 * hissé par fichier, ce fichier ne teste que `useResource`.
 */
const listMock = vi.fn(async (table: string) =>
  table === 'tasks'
    ? [
        { id: 'task-foyer', household_id: 'h-1', trip_id: null, status: 'a_faire' },
        { id: 'task-voyage', household_id: 'h-1', trip_id: 'trip-1', status: 'a_faire' },
      ]
    : [],
);
vi.mock('@/lib/data', () => ({
  data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn(), removeWhere: vi.fn() },
}));

// Import APRÈS le mock (comme `use-auth.test.ts`) : le factory du mock lit
// `listMock`, qui doit être initialisé quand le module est chargé.
const { useResource } = await import('./useResource');

// WR-02 : dépendances du bloc overlay optimiste — importées au niveau module
// (un `await` n'est pas permis dans une fonction de rappel `describe`).
const dataModule = await import('@/lib/data');
const { onlineManager } = await import('@tanstack/react-query');
const { useSessionStore } = await import('@/stores/session-store');
const { useHouseholdStore } = await import('@/stores/household-store');

const wrapperFor =
  (client: ReturnType<typeof createTestQueryClient>) =>
  ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

describe('useResource — la clé contient le selectKey (D-08)', () => {
  beforeEach(() => {
    listMock.mockClear();
  });

  it('ne fait pas partager une entrée de cache à deux `select` différents', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => ({
        // Même table, même filtre, deux sélecteurs : le `selectKey` stable les
        // sépare. Sans lui dans la clé, le second recevrait la réponse du
        // premier (les deux partageraient l'entrée `['tasks', …, filter]`).
        sansVoyage: useResource<TaskRow>('tasks', {
          scoped: false,
          filter: { status: 'a_faire' },
          select: (rows) => rows.filter((row) => (row as unknown as TaskRow).trip_id == null),
          selectKey: 'sans-voyage',
        }),
        toutes: useResource<TaskRow>('tasks', {
          scoped: false,
          filter: { status: 'a_faire' },
          select: (rows) => rows,
          selectKey: 'toutes',
        }),
      }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.sansVoyage.rows).toHaveLength(1);
      expect(result.current.toutes.rows).toHaveLength(2);
    });

    // Deux entrées distinctes pour la même table : c'est la clé — et son
    // quatrième élément `selectKey` — qui les sépare.
    const taskEntries = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === 'tasks');
    expect(taskEntries).toHaveLength(2);
  });

  it('refuse `select` sans `selectKey` — l’union discriminée le porte (D-08)', () => {
    // @ts-expect-error `select` sans `selectKey` : le type l'exige (union discriminée).
    const invalid: UseResourceOptions = { select: (rows: Row[]) => rows };
    // La ligne ci-dessus ne compile pas : c'est la preuve que le type tient la
    // règle. L'assertion empêche `noUnusedLocals` de rejeter la déclaration.
    expect(invalid).toBeDefined();
  });
});

/**
 * Constat (d) des `deferred-items` de la phase 19 : `rows: query.data ?? []`
 * fabriquait un tableau NEUF à chaque rendu quand la requête n'a rien rendu
 * (désactivée, ou premier rendu). Tout `useMemo` qui dépend de `rows` se
 * recalculait alors sans qu'aucune donnée ait changé.
 */
describe('useResource — `rows` a une identité stable quand la requête est désactivée', () => {
  it('rend le MÊME tableau entre deux rendus', () => {
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(
      () => useResource<TaskRow>('tasks', { scoped: false, enabled: false }),
      { wrapper: wrapperFor(queryClient) },
    );

    // La requête est désactivée : rien n'est chargé, `query.data` est `undefined`.
    expect(result.current.rows).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();

    const first = result.current.rows;
    rerender();
    expect(result.current.rows).toBe(first);
  });
});

describe('useResource — overlay optimiste de l’update (WR-02)', () => {
  const updateMock = vi.fn();
  beforeEach(() => {
    updateMock.mockReset();
    vi.mocked(dataModule.data.update).mockImplementation(updateMock);
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: 'u-1', email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
    });
    useHouseholdStore.setState({ householdId: 'h-1' });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    useSessionStore.setState({ status: 'guest', user: null });
    useHouseholdStore.getState().reset();
  });

  it('conserve l’overlay sur échec RÉSEAU — l’update est enfilé, le rejeu réconciliera', async () => {
    // Cas historique du verdict pré-UAT-34-1 : le catch restaurait le
    // snapshot sans distinction, puis re-propageait l'échec. Depuis 34-06
    // l'update ENFILÉ (table allowlistée + échec réseau, D-02) résout avec
    // la ligne fusionnée du cache — l'incident transport ne traverse plus
    // la couche hook (le badge est le signal, D-11/D-12), et l'overlay
    // reste peint tant que la ligne n'a pas été invalidée.
    onlineManager.setOnline(false);
    updateMock.mockRejectedValue(new TypeError('fetch failed'));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useResource<TaskRow>('tasks'), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    const returned = await result.current.update('task-foyer', { status: 'fait' });
    expect(returned.status).toBe('fait');

    const painted = queryClient
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[0] === 'tasks')
      ?.state.data as Array<Row>;
    expect(painted?.find((row) => row.id === 'task-foyer')?.status, 'l’overlay reste peint tant que la ligne n’a pas été invalidée').toBe('fait');
  });

  it('retire l’overlay sur refus MÉTIER (RLS) — l’écriture n’aura jamais lieu', async () => {
    const refusal = Object.assign(new Error('row-level security'), { code: '42501' });
    updateMock.mockRejectedValue(refusal);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useResource<TaskRow>('tasks'), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    await expect(result.current.update('task-foyer', { status: 'fait' })).rejects.toThrow();

    const painted = queryClient
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[0] === 'tasks')
      ?.state.data as Array<Row>;
    expect(painted?.find((row) => row.id === 'task-foyer')?.status).toBe('a_faire');
  });
});
