import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preuve de contrat de `remove`/`removeWhere` (WR-01, D-02).
 *
 * C'est le chemin de bout en bout du tracer : le module `@/lib/data` est le
 * module **réel**. Avec `isSupabaseConfigured` moqué à `true`, `data` y résout
 * vers `SupabaseAdapter` — aucun mock de `@/lib/data`. Le faux client capture
 * la chaîne `.from().delete().eq()/.select()` et sert un jeu commandé (zéro
 * ligne, N lignes, ou une erreur), pour que le comptage soit exercé pour de
 * vrai plutôt que simulé.
 *
 * Le même fichier prouve ensuite la symétrie du mode démo : l'adaptateur local
 * lève aussi sur une ligne absente, faute de quoi le défaut resterait invisible
 * en CI (Vitest tourne en Dexie, sans RLS).
 */

/** Ce que le faux client rendrait après un `DELETE` avec représentation. */
interface FakeDeleteResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/** Constructeur de requête minimal : juste assez pour compter une suppression. */
interface FakeQuery {
  eq(key: string, value: unknown): FakeQuery;
  is(key: string, value: unknown): FakeQuery;
  in(key: string, value: unknown): FakeQuery;
  select(): FakeQuery;
  then(onFulfilled: (value: FakeDeleteResult) => unknown, onRejected?: (reason: unknown) => unknown): Promise<unknown>;
}

const fake = vi.hoisted(() => {
  const state: {
    result: FakeDeleteResult;
    entries: { table: string; filters: [string, unknown][]; selected: boolean }[];
  } = { result: { data: [], error: null }, entries: [] };
  return state;
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://api.exemple.fr',
  supabasePublishableKey: 'pk_test',
  supabaseFunctionsBase: 'https://api.exemple.fr/functions/v1',
  supabase: {
    from: (table: string) => ({
      delete: () => {
        const entry = { table, filters: [] as [string, unknown][], selected: false };
        fake.entries.push(entry);
        const builder: FakeQuery = {
          eq(key, value) {
            entry.filters.push([key, value]);
            return builder;
          },
          is(key, value) {
            entry.filters.push([key, value]);
            return builder;
          },
          in(key, value) {
            entry.filters.push([key, value]);
            return builder;
          },
          select() {
            entry.selected = true;
            return builder;
          },
          then(onFulfilled, onRejected) {
            return Promise.resolve(fake.result).then(onFulfilled, onRejected);
          },
        };
        return builder;
      },
    }),
  },
}));

import { data, DataError } from '@/lib/data';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { removeArdoiseMember } from '@/modules/ardoise/api';
import type { Row } from '@/types';

const CLIENT_ERROR = { message: 'permission denied for table tasks' };

beforeEach(() => {
  fake.result = { data: [], error: null };
  fake.entries.length = 0;
});

describe('Contrat de suppression — SupabaseAdapter (WR-01)', () => {
  it('lève sur zéro ligne au lieu de rendre un faux succès, et demande la représentation', async () => {
    fake.result = { data: [], error: null };
    await expect(data.remove('tasks', 'tache-1')).rejects.toBeInstanceOf(DataError);
    // `.select()` est la mesure : sans lui, PostgREST répond 204 que 0 ou N
    // lignes soient parties (c'est exactement WR-01).
    expect(fake.entries).toEqual([{ table: 'tasks', filters: [['id', 'tache-1']], selected: true }]);
  });

  it('résout quand au moins une ligne est retirée', async () => {
    fake.result = { data: [{ id: 'tache-1' }], error: null };
    await expect(data.remove('tasks', 'tache-1')).resolves.toBeUndefined();
  });

  it('n’accepte une suppression idempotente que si l’appelant la déclare', async () => {
    fake.result = { data: [], error: null };
    await expect(data.remove('tasks', 'tache-1', { ifMissing: 'ignore' })).resolves.toBeUndefined();
  });

  it('remonte l’erreur du client avec sa cause d’origine', async () => {
    fake.result = { data: null, error: CLIENT_ERROR };
    const error = await data.remove('tasks', 'tache-1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).cause).toBe(CLIENT_ERROR);
  });

  it('removeWhere compte aussi, sans nom de colonne dans la représentation', async () => {
    fake.result = { data: [], error: null };
    await expect(
      data.removeWhere('conversation_members', { conversation_id: 'c1', member_id: 'm1' }),
    ).rejects.toBeInstanceOf(DataError);
    expect(fake.entries).toEqual([
      {
        table: 'conversation_members',
        filters: [
          ['conversation_id', 'c1'],
          ['member_id', 'm1'],
        ],
        selected: true,
      },
    ]);
  });

  it('removeWhere résout sur N lignes et sur ignore, et remonte l’erreur client', async () => {
    fake.result = { data: [{ conversation_id: 'c1' }], error: null };
    await expect(data.removeWhere('conversation_members', { conversation_id: 'c1' })).resolves.toBeUndefined();

    fake.result = { data: [], error: null };
    await expect(
      data.removeWhere('conversation_members', { conversation_id: 'c1' }, { ifMissing: 'ignore' }),
    ).resolves.toBeUndefined();

    fake.result = { data: null, error: CLIENT_ERROR };
    const error = await data.removeWhere('conversation_members', { conversation_id: 'c1' }).catch(
      (reason: unknown) => reason,
    );
    expect((error as DataError).cause).toBe(CLIENT_ERROR);
  });
});

describe('Contrat de suppression — LocalAdapter (symétrie du mode démo)', () => {
  const adapter = getLocalAdapter();

  it('remove lève sur une ligne absente, ignore la laisse passer', async () => {
    await expect(adapter.remove('note_folders', 'dossier-absent')).rejects.toBeInstanceOf(DataError);
    await expect(adapter.remove('note_folders', 'dossier-absent', { ifMissing: 'ignore' })).resolves.toBeUndefined();
  });

  it('remove supprime une ligne présente', async () => {
    const created = await adapter.create<Row>('note_folders', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Dossier de test',
      visibility: 'foyer',
    });
    await expect(adapter.remove('note_folders', created.id)).resolves.toBeUndefined();
    expect(await adapter.list('note_folders', { id: created.id })).toHaveLength(0);
  });

  it('removeWhere lève sans cible, ignore la laisse passer, et supprime les cibles trouvées', async () => {
    await expect(adapter.removeWhere('task_assignees', { task_id: 'tache-sans-assignation' })).rejects.toBeInstanceOf(
      DataError,
    );
    await expect(
      adapter.removeWhere('task_assignees', { task_id: 'tache-sans-assignation' }, { ifMissing: 'ignore' }),
    ).resolves.toBeUndefined();

    await adapter.create('task_assignees', { task_id: 'tache-assignee', member_id: 'membre-1' });
    await adapter.create('task_assignees', { task_id: 'tache-assignee', member_id: 'membre-2' });
    await expect(adapter.removeWhere('task_assignees', { task_id: 'tache-assignee' })).resolves.toBeUndefined();
    expect(await adapter.list('task_assignees', { task_id: 'tache-assignee' })).toHaveLength(0);
  });
});

describe('Chemin complet contrat → adaptateur → API de module', () => {
  it('removeArdoiseMember rejette désormais sur une cible absente', async () => {
    fake.result = { data: [], error: null };
    await expect(removeArdoiseMember('ardoise-x', 'membre-x')).rejects.toBeInstanceOf(DataError);
  });
});
