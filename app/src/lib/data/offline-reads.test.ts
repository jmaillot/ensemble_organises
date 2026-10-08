import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/types';

const state = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'throw' | 'error',
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => {
        // Imitation minimale du constructeur PostgREST : chaînable puis
        // awaitable (`await` appelle `then`, jamais `execute`).
        const builder: Record<string, (...args: never[]) => unknown> = {};
        builder.eq = () => builder;
        builder.is = () => builder;
        builder.in = () => builder;
        builder.then = ((resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (state.mode === 'throw') return Promise.reject(new TypeError('fetch failed')).then(resolve, reject);
          if (state.mode === 'error') return Promise.resolve({ data: null, error: { message: 'boom 500' } }).then(resolve, reject);
          return Promise.resolve({ data: state.rows, error: null }).then(resolve, reject);
        }) as (...args: never[]) => unknown;
        return builder;
      },
    }),
  },
}));

const { SupabaseAdapter } = await import('./supabase-adapter');
const { getDatabase } = await import('./dexie');
const { rowKey } = await import('./keys');
const { DataError } = await import('./adapter');

const adapter = new SupabaseAdapter();

type SeedEntry = { table: string; household: string; data: Record<string, unknown> };

async function seedCache(entries: SeedEntry[]) {
  const db = getDatabase();
  await db.rows.bulkPut(
    entries.map((entry) => ({
      key: rowKey(entry.table, entry.data as Row),
      table: entry.table,
      householdId: entry.household,
      data: entry.data as Row,
      updatedAt: Date.now(),
    })),
  );
}

const taskRow = (id: string, household: string, extra: Record<string, unknown> = {}) => ({
  id,
  household_id: household,
  name: `Tâche ${id}`,
  ...extra,
});

beforeEach(() => {
  state.mode = 'ok';
  state.rows = [];
});

describe('repli lecture hors ligne (D-01)', () => {
  it('sert le cache avec le drapeau périmé quand le réseau lève', async () => {
    await seedCache([
      { table: 'tasks', household: 'foyer-a', data: taskRow('t1', 'foyer-a') },
      { table: 'tasks', household: 'foyer-a', data: taskRow('t2', 'foyer-a') },
    ]);
    state.mode = 'throw';

    const result = await adapter.listWithMeta<Row>('tasks', { household_id: 'foyer-a' });

    expect(result.fromCache).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual(['t1', 't2']);
  });

  it('expose les lignes périmées via list() sans lever', async () => {
    await seedCache([{ table: 'tasks', household: 'foyer-a', data: taskRow('t1', 'foyer-a') }]);
    state.mode = 'throw';

    const rows = await adapter.list<Row>('tasks', { household_id: 'foyer-a' });

    expect(rows.map((row) => row.id)).toEqual(['t1']);
  });

  it('sert aussi le cache sur une réponse 5xx, pas seulement sur exception', async () => {
    await seedCache([{ table: 'tasks', household: 'foyer-a', data: taskRow('t1', 'foyer-a') }]);
    state.mode = 'error';

    const result = await adapter.listWithMeta<Row>('tasks', { household_id: 'foyer-a' });

    expect(result.fromCache).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it('le cache vide reste une erreur, jamais un faux succès', async () => {
    state.mode = 'throw';

    await expect(adapter.listWithMeta<Row>('tasks', { household_id: 'foyer-a' })).rejects.toBeInstanceOf(DataError);
    await expect(adapter.list<Row>('tasks', { household_id: 'foyer-a' })).rejects.toBeInstanceOf(DataError);
  });

  it('le repli respecte le filtre foyer au lieu de tout servir', async () => {
    await seedCache([
      { table: 'tasks', household: 'foyer-a', data: taskRow('t1', 'foyer-a') },
      { table: 'tasks', household: 'foyer-b', data: taskRow('t9', 'foyer-b') },
    ]);
    state.mode = 'throw';

    const result = await adapter.listWithMeta<Row>('tasks', { household_id: 'foyer-a' });

    expect(result.fromCache).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual(['t1']);
  });

  it('le succès rafraîchit le cache et n’est pas marqué périmé', async () => {
    state.rows = [taskRow('live-1', 'foyer-a')];

    const result = await adapter.listWithMeta<Row>('tasks', { household_id: 'foyer-a' });

    expect(result.fromCache).toBe(false);
    expect(result.rows.map((row) => row.id)).toEqual(['live-1']);
    const cached = await getDatabase().rows.where('[table+householdId]').equals(['tasks', 'foyer-a']).toArray();
    expect(cached.map((entry) => (entry.data as Row).id)).toEqual(['live-1']);
  });
});
