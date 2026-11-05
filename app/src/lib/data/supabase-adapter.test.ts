import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { SupabaseAdapter } from './supabase-adapter';
import { DataError } from './adapter';
import { OFFLINE_WRITE_REFUSED_MESSAGE } from './write-policy';

/**
 * Preuve du filet de sécurité posé dans l'adaptateur (T-34-05, §2.7 E).
 *
 * La garde vit en Trois endroits : hooks Tier 1 (useResource), MutationCache
 * central (query-policy.ts) et l'adaptateur LUI-MÊME. Ce dernier est le seul
 * que tout chemin d'écriture traverse tôt ou tard : le test prouve qu'une
 * écriture hors liste hors ligne y est refusée AVANT tout appel réseau —
 * le faux client ci-dessous compte ses appels `from()` : zéro appel, c'est
 * zéro requête partie vers PostgREST.
 */

type FromCall = { table: string; method: string };

let fromCalls: FromCall[] = [];

/** Constructeur de requête factice : chaînable, résout une ligne. */
function fakeBuilder(method: string) {
  const builder: Record<string, unknown> = {
    insert: () => fakeBuilder('insert'),
    update: () => fakeBuilder('update'),
    delete: () => fakeBuilder('delete'),
    upsert: () => fakeBuilder('upsert'),
    select: () => fakeBuilder('select'),
    eq: () => fakeBuilder('eq'),
    is: () => fakeBuilder('is'),
    in: () => fakeBuilder('in'),
    single: () => Promise.resolve({ data: { id: 'row-1' }, error: null }),
    then: undefined,
  };
  return Object.assign(Promise.resolve({ data: [{ id: 'row-1' }], error: null }), builder, { __method: method });
}

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ table, method: 'from' });
      return fakeBuilder(table);
    },
  },
}));

beforeEach(() => {
  fromCalls = [];
});

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('SupabaseAdapter — garde d’écriture upfront (filet de classe, T-34-05)', () => {
  it('A. create hors liste hors ligne : DataError ET zéro appel réseau', async () => {
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('notes', { title: 'x' })).rejects.toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
    expect(fromCalls, 'aucune requête ne doit partir vers PostgREST').toEqual([]);
  });

  it('B. update, remove et removeWhere hors liste hors ligne : même refus, zéro appel réseau', async () => {
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.update('notes', 'n1', { title: 'x' })).rejects.toThrow(DataError);
    await expect(adapter.remove('notes', 'n1')).rejects.toThrow(DataError);
    await expect(adapter.removeWhere('post_comments', { post_id: 'p1' })).rejects.toThrow(DataError);
    expect(fromCalls).toEqual([]);
  });

  it('C. une écriture allowlistée hors ligne TRAVERSE la garde (l’adaptateur n’enfile jamais)', async () => {
    // `tasks` est dans la liste : le filet la laisse passer — c'est le
    // MutationCache qui décidera de l'enfilage, pas l'adaptateur. Ici, avec un
    // réseau déclaré coupé, la requête part quand même vers le (faux) client.
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('tasks', { name: 'x' })).resolves.toEqual({ id: 'row-1' });
    expect(fromCalls).toEqual([{ table: 'tasks', method: 'from' }]);
  });

  it('D. la même écriture hors liste passe en ligne — la liste blanche borne le hors-ligne', async () => {
    onlineManager.setOnline(true);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('notes', { title: 'x' })).resolves.toEqual({ id: 'row-1' });
    expect(fromCalls).toEqual([{ table: 'notes', method: 'from' }]);
  });
});
