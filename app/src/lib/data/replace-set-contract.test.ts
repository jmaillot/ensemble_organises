import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data/adapter';
import { getDatabase } from '@/lib/data/dexie';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { SupabaseAdapter } from '@/lib/data/supabase-adapter';
import { SET_TABLES } from '@/lib/data/set-tables';

/**
 * Contrat de `replaceSet` — le remplacement d'ensemble atomique (0133).
 *
 * Deux propriétés, et chacune peut tomber seule :
 *
 * - en mode Supabase, l'écriture est UN appel `rpc` : la carte `SET_TABLES`
 *   nomme la fonction et ses paramètres, et une erreur remonte en `DataError`.
 *   Un `delete` suivi d'un `insert` n'aurait aucune transaction commune ;
 * - en mode démo, la suppression et l'insertion tiennent dans une transaction
 *   Dexie : un échec en cours de route laisse l'ensemble PRÉCÉDENT intact.
 */

const fake = vi.hoisted(() => {
  const state: {
    calls: { name: string; args: Record<string, unknown> }[];
    error: { message: string } | null;
  } = { calls: [], error: null };
  return state;
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://api.exemple.fr',
  supabasePublishableKey: 'pk_test',
  supabaseFunctionsBase: 'https://api.exemple.fr/functions/v1',
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      fake.calls.push({ name, args });
      return Promise.resolve({ data: 0, error: fake.error });
    },
  },
}));

beforeEach(async () => {
  fake.calls = [];
  fake.error = null;
  await getDatabase().rows.clear();
  getLocalAdapter().invalidateSeedCache();
});

describe('replaceSet en mode Supabase', () => {
  it('appelle la fonction de la carte avec ses paramètres nommés', async () => {
    const adapter = new SupabaseAdapter();

    await adapter.replaceSet('task_assignees', 'task_1', ['m1', 'm2']);

    expect(fake.calls).toEqual([
      { name: SET_TABLES.task_assignees.rpc, args: { p_task_id: 'task_1', p_member_ids: ['m1', 'm2'] } },
    ]);
  });

  it('transmet les rappels sous leur propre nom de paramètre', async () => {
    const adapter = new SupabaseAdapter();

    await adapter.replaceSet('routine_reminders', 'routine_1', ['2026-10-20T08:00:00.000Z']);

    expect(fake.calls).toEqual([
      {
        name: SET_TABLES.routine_reminders.rpc,
        args: { p_routine_id: 'routine_1', p_remind_ats: ['2026-10-20T08:00:00.000Z'] },
      },
    ]);
  });

  it('lève une DataError quand la fonction refuse', async () => {
    fake.error = { message: 'écriture refusée sur cette tâche' };
    const adapter = new SupabaseAdapter();

    await expect(adapter.replaceSet('task_assignees', 'task_1', [])).rejects.toBeInstanceOf(DataError);
  });
});

describe('replaceSet en mode démo', () => {
  const parent = 'task_test_replace';

  it('remplace l’ensemble et retire les lignes absentes du nouveau', async () => {
    const adapter = getLocalAdapter();

    await adapter.replaceSet('task_assignees', parent, ['m1', 'm2']);
    await adapter.replaceSet('task_assignees', parent, ['m2', 'm3']);

    const rows = await adapter.list<{ task_id: string; member_id: string }>('task_assignees', {
      task_id: parent,
    });
    expect(rows.map((row) => row.member_id).sort()).toEqual(['m2', 'm3']);
  });

  it('replie les doublons comme le fait `select distinct` côté serveur', async () => {
    const adapter = getLocalAdapter();

    await adapter.replaceSet('task_assignees', parent, ['m1', 'm1']);

    const rows = await adapter.list('task_assignees', { task_id: parent });
    expect(rows).toHaveLength(1);
  });

  it('restaure l’ensemble précédent quand l’écriture échoue en cours de route', async () => {
    const adapter = getLocalAdapter();
    await adapter.replaceSet('task_assignees', parent, ['m1', 'm2']);

    // L'échec tombe APRÈS la suppression : c'est la transaction qui doit
    // ramener les deux lignes, pas le désordre des appels.
    const bulkPut = vi.spyOn(getDatabase().rows, 'bulkPut').mockRejectedValueOnce(new Error('quota dépassé'));
    await expect(adapter.replaceSet('task_assignees', parent, ['m3'])).rejects.toThrow();
    bulkPut.mockRestore();

    const rows = await adapter.list<{ member_id: string }>('task_assignees', { task_id: parent });
    expect(rows.map((row) => row.member_id).sort()).toEqual(['m1', 'm2']);
  });

  it('refuse de remplacer les liens d’une recette absente, sans rien écrire', async () => {
    const adapter = getLocalAdapter();

    await expect(
      adapter.replaceSet('recipe_tag_links', 'recipe_inconnue', ['tag_1']),
    ).rejects.toBeInstanceOf(DataError);

    const rows = await adapter.list('recipe_tag_links', { recipe_id: 'recipe_inconnue' });
    expect(rows).toHaveLength(0);
  });
});
