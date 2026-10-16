import { describe, expect, it, vi, beforeEach } from 'vitest';
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
