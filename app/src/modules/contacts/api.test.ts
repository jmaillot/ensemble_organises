import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContact, moveContactToFamily, updateContact } from './api';
import type { ContactFormValues } from './types';

const { mockUpdate, mockCreate, mockCreateSignedUrl } = vi.hoisted(() => {
  const mockUpdate = vi.fn(async (_table: string, id: string, values: Record<string, unknown>) => ({
    id,
    ...values,
  }));
  const mockCreate = vi.fn(async (_table: string, values: Record<string, unknown>) => ({
    id: 'contact-new',
    ...values,
  }));
  // Si l'écriture signait, elle persisterait une URL éphémère (WR-08) : ce
  // témoin doit rester intact après une écriture.
  const mockCreateSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signe.example/x.jpg' }, error: null }));
  return { mockUpdate, mockCreate, mockCreateSignedUrl };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { update: mockUpdate, create: mockCreate } };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl, upload: vi.fn() }) } },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('moveContactToFamily (D-04)', () => {
  it('envoie la liste seule — ni foyer, ni nom, ni date dans la charge', async () => {
    await moveContactToFamily('contact-1', 'contact-list-famille');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('contacts', 'contact-1', { list_id: 'contact-list-famille' });
    const payload = mockUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['list_id']);
    expect('household_id' in payload).toBe(false);
  });

  it('identifiant ou liste vide : aucun appel réseau (garde cliente)', async () => {
    await expect(moveContactToFamily('   ', 'contact-list-famille')).rejects.toThrow('introuvable');
    await expect(moveContactToFamily('contact-1', '  ')).rejects.toThrow('introuvable');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

/**
 * D-01, WR-08 : la colonne `photo_url` reçoit le CHEMIN du bucket, jamais une
 * URL signée — et l'écriture ne signe rien (la signature n'existe qu'à la
 * lecture).
 */
describe('écriture des fiches (D-01, WR-08)', () => {
  const values = (overrides: Partial<ContactFormValues> = {}): ContactFormValues => ({
    name: 'Léa Moreau',
    birthDate: '14/03/1995',
    listId: 'contact-list-famille',
    linkedMemberId: '',
    photoUrl: 'h1/contacts/x.jpg',
    ...overrides,
  });

  it('createContact persiste le chemin, jamais l’URL signée, sans signer', async () => {
    await createContact(values(), 'h1');

    const payload = mockCreate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.photo_url).toBe('h1/contacts/x.jpg');
    expect(String(payload.photo_url)).not.toMatch(/^https?:/);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('updateContact porte la même valeur de colonne, sans signer', async () => {
    await updateContact('contact-1', values({ photoUrl: 'h1/contacts/y.jpg' }), 'h1');

    const payload = mockUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.photo_url).toBe('h1/contacts/y.jpg');
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('une photo vidée rend `null` en colonne', async () => {
    await createContact(values({ photoUrl: '   ' }), 'h1');

    const payload = mockCreate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.photo_url).toBeNull();
  });
});
