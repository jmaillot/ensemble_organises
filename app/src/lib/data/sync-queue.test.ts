import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataError } from './adapter';
import type { PendingMutation } from './dexie';
import type { RowFilter } from '@/types';

const state = vi.hoisted(() => ({
  writeError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => {
      // Chaîne d'écriture minimale : `insert/update/delete` + filtres, puis
      // `single()` (create/update) ou await direct (remove/removeWhere).
      const builder: Record<string, (...args: never[]) => unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.is = () => builder;
      builder.in = () => builder;
      builder.insert = () => builder;
      builder.update = () => builder;
      builder.delete = () => builder;
      builder.single = async () =>
        state.writeError ? { data: null, error: state.writeError } : { data: { id: 'ligne-1' }, error: null };
      builder.then = ((resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (state.writeError) return Promise.resolve({ data: null, error: state.writeError }).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      }) as (...args: never[]) => unknown;
      return builder;
    },
  },
}));

const { SupabaseAdapter } = await import('./supabase-adapter');
const { enqueueMutation, flushWithAdapter, pendingCount, replayOne } = await import('./sync-queue');
const { getDatabase } = await import('./dexie');

const adapter = new SupabaseAdapter();

/** Assure la visibilité des `void enqueueMutation(...)` non attendus. */
async function waitForPending(expected: number) {
  await vi.waitFor(async () => {
    expect(await pendingCount()).toBe(expected);
  });
}

const queued = async () => getDatabase().mutations.orderBy('createdAt').toArray();

describe('mise en file sur échec constaté (D-02)', () => {
  beforeEach(() => {
    state.writeError = null;
  });

  it('met en file une création quand le réseau répond en erreur, même en ligne', async () => {
    state.writeError = { message: 'boom 500' };

    const error = await adapter.create('tasks', { name: 'Tâche' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as DataError).queuedForSync).toBe(true);
    await waitForPending(1);
  });

  it('met en file un removeWhere de jointure avec son filtre', async () => {
    state.writeError = { message: 'timeout' };
    const filter = { task_id: 't1' } as RowFilter;

    await expect(adapter.removeWhere('task_assignees', filter)).rejects.toMatchObject({ queuedForSync: true });
    await waitForPending(1);

    const entries = await queued();
    expect(entries[0].operation).toBe('deleteWhere');
    expect(entries[0].values).toEqual(filter);
  });

  it('ne remet pas en file pendant un rejeu : pas de duplication', async () => {
    await enqueueMutation({ table: 'tasks', operation: 'update', rowId: 't1', values: { name: 'x' } });
    state.writeError = { message: 'toujours en panne' };

    const result = await flushWithAdapter(adapter);

    expect(result).toEqual({ replayed: 0, failed: 1 });
    expect(await pendingCount()).toBe(1);
    expect((await queued())[0].attempts).toBe(1);
  });
});

describe('rejeu ordonné (D-06)', () => {
  it('rejoue dans l’ordre d’arrivée, deleteWhere compris', async () => {
    const calls: string[] = [];
    const target = {
      create: async (table: string) => {
        calls.push(`insert:${table}`);
        return {};
      },
      update: async (table: string, id: string) => {
        calls.push(`update:${table}/${id}`);
        return {};
      },
      remove: async (table: string, id: string) => {
        calls.push(`delete:${table}/${id}`);
      },
      removeWhere: async (table: string, filter: RowFilter) => {
        calls.push(`deleteWhere:${table}/${JSON.stringify(filter)}`);
      },
    };
    const stamp = (operation: PendingMutation['operation'], rowId: string, values: Record<string, unknown> = {}) =>
      enqueueMutation({ table: 'tasks', operation, rowId, values });

    await stamp('insert', 'a', { name: 'a' });
    await stamp('update', 'b', { name: 'b' });
    await stamp('deleteWhere', '*', { task_id: 'b' });
    await stamp('delete', 'c');

    const result = await flushWithAdapter(target);

    expect(result).toEqual({ replayed: 4, failed: 0 });
    expect(calls).toEqual([
      'insert:tasks',
      'update:tasks/b',
      'deleteWhere:tasks/{"task_id":"b"}',
      'delete:tasks/c',
    ]);
    expect(await pendingCount()).toBe(0);
  });

  it('conserve les échecs avec attempts incrémenté', async () => {
    await enqueueMutation({ table: 'tasks', operation: 'delete', rowId: 't1', values: {} });
    const failing = {
      create: async () => ({}),
      update: async () => ({}),
      remove: async () => {
        throw new Error('panne persistante');
      },
      removeWhere: async () => {},
    };

    const result = await flushWithAdapter(failing);

    expect(result).toEqual({ replayed: 0, failed: 1 });
    const entries = await queued();
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBe(1);
  });

  it('replayOne dispatche chaque verbe vers la bonne méthode cible', async () => {
    const calls: string[] = [];
    const target = {
      create: async () => {
        calls.push('create');
        return {};
      },
      update: async () => {
        calls.push('update');
        return {};
      },
      remove: async () => {
        calls.push('remove');
      },
      removeWhere: async () => {
        calls.push('removeWhere');
      },
    };

    await replayOne(target, { table: 't', operation: 'insert', rowId: 'a', values: {}, createdAt: 1, attempts: 0 });
    await replayOne(target, { table: 't', operation: 'update', rowId: 'a', values: {}, createdAt: 2, attempts: 0 });
    await replayOne(target, { table: 't', operation: 'delete', rowId: 'a', values: {}, createdAt: 3, attempts: 0 });
    await replayOne(target, { table: 't', operation: 'deleteWhere', rowId: '*', values: {}, createdAt: 4, attempts: 0 });

    expect(calls).toEqual(['create', 'update', 'remove', 'removeWhere']);
  });
});
