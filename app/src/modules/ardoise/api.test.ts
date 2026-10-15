import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addArdoiseMembers, createArdoise, deleteArdoise, resolveArdoiseCoverUrl, resolveArdoiseCoverUrls } from './api';
import { displayableCoverUrl } from './hooks/use-ardoise';
import type { ArdoiseRow } from '@/types';

/**
 * Preuve comportementale WR-03 : `addArdoiseMembers` ne tait plus un échec
 * d'insertion, et n'envoie aucun `id` à `ardoise_members`.
 *
 * Fichier neuf et isolé volontairement : `ardoise-members-dialog.test.tsx`
 * couvre « ajoute puis retire un membre » et passe déjà en mode démo Dexie,
 * où l'`id` surnuméraire est inoffensif. C'est exactement pourquoi le défaut a
 * échappé à la CI — le mode local n'a ni colonne inconnue ni RLS, donc
 * l'insertion réussissait avec ou sans `id`.
 *
 * WR-08/WR-10 (phase 19) : la colonne `ardoises.cover_url` porte un CHEMIN, et
 * la ligne et son objet meurent ensemble. La résolution se prouve ici, sur le
 * point unique (`lib/storage`), parce que le défaut ne se reproduit qu'en mode
 * Supabase — la démo rend un aperçu local, donc non-chemin.
 */

const { mockCreate, mockList, mockRemove, storageMocks, supabaseState } = vi.hoisted(() => {
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  const storageMocks = {
    createSignedUrl: vi.fn(
      async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null }),
    ),
    remove: vi.fn(async () => ({ error: null })),
  };
  const supabaseState = { configured: false };
  return {
    mockCreate: vi.fn(),
    mockList: vi.fn(),
    mockRemove: vi.fn(),
    storageMocks,
    supabaseState,
  };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { create: mockCreate, list: mockList, remove: mockRemove } };
});

// `ardoise/api` importe le client pour ses chemins Edge : on neutralise le
// backend, seul le mode local (repli) est exercé ici. L'état est mutable pour
// la résolution de couverture, qui exige un Storage configuré.
vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured
      ? {
          storage: {
            from: (_bucket: string) => ({
              createSignedUrl: storageMocks.createSignedUrl,
              remove: storageMocks.remove,
            }),
          },
        }
      : null;
  },
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

// Seul le retrait d'objet est espionné : le reste de `lib/storage` (verdict de
// forme, résolution) est le vrai code, exercé contre le Storage simulé.
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, removeHouseholdFile: vi.fn(async () => {}) };
});

import { removeHouseholdFile } from '@/lib/storage';

const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
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

/**
 * D-01 : `ardoises.cover_url` porte un chemin ; l'URL signée naît à la lecture.
 * Le défaut d'origine rendait la valeur de colonne telle quelle : une URL signée
 * 30 jours, morte à J+31 avec son chemin perdu. La preuve se fait donc en mode
 * Supabase, où la signature existe — la démo, elle, ne peut pas mentir.
 */
describe('couverture d’ardoise — résolution (D-01)', () => {
  it('ne signe que les chemins : une couverture externe reste hors de la carte', async () => {
    supabaseState.configured = true;

    const resolved = await resolveArdoiseCoverUrls([
      { id: 'a', cover_url: 'foyer-1/ardoises/plage.webp' },
      { id: 'b', cover_url: 'https://externe.example/photo.jpg' },
      { id: 'c', cover_url: null },
      { id: 'd', cover_url: '   ' },
    ]);

    expect(resolved).toEqual({ a: 'https://signe.example/foyer-1/ardoises/plage.webp' });
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer-1/ardoises/plage.webp', 60 * 60 * 24 * 30);
  });

  it('échec fermé : un chemin non signable est absent de la carte, jamais rendu brut', async () => {
    supabaseState.configured = true;
    storageMocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'refusé' } });

    expect(await resolveArdoiseCoverUrls([{ id: 'a', cover_url: 'foyer-1/ardoises/plage.webp' }])).toEqual({});

    supabaseState.configured = false;
    expect(await resolveArdoiseCoverUrls([{ id: 'a', cover_url: 'foyer-1/ardoises/plage.webp' }])).toEqual({});
  });

  it('valeur unique : un chemin se signe, une forme non-chemin n’est pas un objet à signer', async () => {
    supabaseState.configured = true;
    expect(await resolveArdoiseCoverUrl('foyer-1/ardoises/plage.webp')).toBe(
      'https://signe.example/foyer-1/ardoises/plage.webp',
    );
    expect(await resolveArdoiseCoverUrl('https://externe.example/photo.jpg')).toBeNull();
    expect(await resolveArdoiseCoverUrl(null)).toBeNull();
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('coverUrlOf : URL résolue pour un chemin, brute pour une forme non-chemin, null si blanc ou non signé', () => {
    const row = (cover_url: string | null): ArdoiseRow => ({ id: 'ardoise-1', cover_url }) as ArdoiseRow;
    const resolved = { 'ardoise-1': 'https://signe.example/foyer-1/ardoises/plage.webp' };

    expect(displayableCoverUrl(row('foyer-1/ardoises/plage.webp'), resolved)).toBe(
      'https://signe.example/foyer-1/ardoises/plage.webp',
    );
    // Signature échouée (ou pas encore arrivée) : rien dans le DOM plutôt qu'un lien mort.
    expect(displayableCoverUrl(row('foyer-1/ardoises/plage.webp'), {})).toBeNull();
    expect(displayableCoverUrl(row('https://externe.example/photo.jpg'), {})).toBe('https://externe.example/photo.jpg');
    expect(displayableCoverUrl(row('data:image/png;base64,eG1s'), {})).toBe('data:image/png;base64,eG1s');
    expect(displayableCoverUrl(row(null), resolved)).toBeNull();
    expect(displayableCoverUrl(row('   '), resolved)).toBeNull();
  });
});

/**
 * D-03 : la ligne et son objet meurent ensemble. La ligne part d'abord, l'objet
 * ensuite — une ligne sans objet est réparable, un objet sans ligne ne l'est pas
 * — et l'échec du nettoyage ne transforme pas une suppression réussie en échec.
 */
describe('deleteArdoise — la ligne et son objet (D-03)', () => {
  it('supprime la ligne puis l’objet de sa couverture, dans cet ordre', async () => {
    mockList.mockImplementation(async (table: string) =>
      table === 'ardoises' ? [{ id: 'ardoise-1', cover_url: 'foyer-1/ardoises/plage.webp' }] : [],
    );

    await deleteArdoise('ardoise-1');

    expect(mockRemove).toHaveBeenCalledWith('ardoises', 'ardoise-1');
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/ardoises/plage.webp');
    expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(removeFileMock.mock.invocationCallOrder[0]);
  });

  it('un retrait d’objet en échec ne fait pas échouer la suppression', async () => {
    mockList.mockImplementation(async (table: string) =>
      table === 'ardoises' ? [{ id: 'ardoise-1', cover_url: 'foyer-1/ardoises/plage.webp' }] : [],
    );
    removeFileMock.mockRejectedValueOnce(new Error('Storage indisponible'));

    await expect(deleteArdoise('ardoise-1')).resolves.toBeUndefined();

    expect(mockRemove).toHaveBeenCalledWith('ardoises', 'ardoise-1');
  });

  it('une couverture non-chemin n’est jamais un objet de bucket', async () => {
    mockList.mockImplementation(async (table: string, filter: Record<string, unknown>) =>
      table === 'ardoises'
        ? [
            { id: 'ardoise-1', cover_url: 'https://signe.example/foyer-1/ardoises/plage.webp' },
            { id: 'ardoise-2', cover_url: null },
          ].filter((row) => row.id === filter.id)
        : [],
    );

    await deleteArdoise('ardoise-1');
    await deleteArdoise('ardoise-2');

    expect(removeFileMock).not.toHaveBeenCalled();
  });
});
