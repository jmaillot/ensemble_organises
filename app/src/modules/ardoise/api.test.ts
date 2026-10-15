import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addArdoiseMembers, createArdoise } from './api';

/**
 * Preuve comportementale WR-03 : `addArdoiseMembers` ne tait plus un échec
 * d'insertion, et n'envoie aucun `id` à `ardoise_members`.
 *
 * Fichier neuf et isolé volontairement : `ardoise-members-dialog.test.tsx`
 * couvre « ajoute puis retire un membre » et passe déjà en mode démo Dexie,
 * où l'`id` surnuméraire est inoffensif. C'est exactement pourquoi le défaut a
 * échappé à la CI — le mode local n'a ni colonne inconnue ni RLS, donc
 * l'insertion réussissait avec ou sans `id`.
 */

const { mockCreate, mockList } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { create: mockCreate, list: mockList } };
});

// `ardoise/api` importe le client pour ses chemins Edge : on neutralise le
// backend, seul le mode local (repli) est exercé ici.
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockImplementation(async (table: string) =>
    table === 'household_members' ? [{ id: 'membre-1', role: 'admin' }] : [],
  );
});

describe('addArdoiseMembers (WR-03)', () => {
  it('propage un échec d’insertion au lieu de le taire', async () => {
    mockCreate.mockRejectedValue(new Error('insertion refusée'));
    await expect(addArdoiseMembers('ardoise-x', ['membre-1'])).rejects.toThrow('insertion refusée');
  });

  it('écrit une ligne par membre, avec ardoise_id/member_id et aucun id', async () => {
    mockCreate.mockImplementation(async (_table: string, values: Record<string, unknown>) => ({ ...values }));

    await addArdoiseMembers('ardoise-x', ['membre-1', 'membre-2']);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    for (const [table, values] of mockCreate.mock.calls) {
      expect(table).toBe('ardoise_members');
      // Aucun `id` : `ardoise_members` est dans KEYLESS_TABLES (clé composite).
      expect(values).not.toHaveProperty('id');
    }
    expect(mockCreate).toHaveBeenNthCalledWith(1, 'ardoise_members', { ardoise_id: 'ardoise-x', member_id: 'membre-1' });
    expect(mockCreate).toHaveBeenNthCalledWith(2, 'ardoise_members', { ardoise_id: 'ardoise-x', member_id: 'membre-2' });
  });

  it('createArdoise (seed local) ne masque plus un échec sur ardoise_members', async () => {
    mockCreate.mockImplementation(async (table: string, values: Record<string, unknown>) => {
      if (table === 'ardoise_members') throw new Error('seed refusé');
      return { id: 'ardoise-creee', ...values };
    });

    await expect(createArdoise('foyer-1', { name: 'Week-end' })).rejects.toThrow('seed refusé');
  });
});
