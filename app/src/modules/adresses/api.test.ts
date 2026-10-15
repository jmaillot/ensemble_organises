import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deletePlacePhoto,
  isPlacePhotoPath,
  placePhotoPathOf,
  resolvePlacePhotoUrl,
  shouldRemovePreviousPlacePhoto,
  toEditPlacePayload,
  toPlacePayload,
  uploadPlacePhoto,
} from './api';
import type { PlaceInput } from './types';

const { storageMocks, supabaseState } = vi.hoisted(() => {
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  const storageMocks = {
    createSignedUrl: vi.fn(async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const supabaseState = { configured: false };
  return { storageMocks, supabaseState };
});

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async () => ({
      url: 'https://signe.example/depot-initial',
      path: 'foyer-1/places/photo.webp',
      name: 'photo.jpg',
      mime: 'image/webp',
      size: 18,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured
      ? { storage: { from: (_bucket: string) => ({ createSignedUrl: storageMocks.createSignedUrl, remove: storageMocks.remove }) } }
      : null;
  },
}));

import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';

const depositMock = vi.mocked(depositHouseholdFile);
const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
});

const input: PlaceInput = {
  name: 'Le Café du Matin',
  type: 'cafe',
  rating: 4,
  street: '12 rue des Tilleuls',
  postalCode: '69006',
  city: 'Lyon',
  phone: null,
  note: null,
  photoUrl: '/assets/adresses.jpg',
};

describe('photos de lieux — hygiène des fichiers (D-04)', () => {
  it('création : visited faux, modification : visited omis (D-06)', () => {
    expect(toPlacePayload(input, 'foyer-1')).toMatchObject({ visited: false, name: 'Le Café du Matin' });

    const edit = toEditPlacePayload(input, 'foyer-1');
    expect(edit).not.toHaveProperty('visited');
    expect(edit).toMatchObject({ name: 'Le Café du Matin', city: 'Lyon' });
  });

  it('dépôt : téléverse au bucket et renvoie le chemin à stocker', async () => {
    const stored = await uploadPlacePhoto('foyer-1', new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(depositMock).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: 'foyer-1', folder: 'places' }),
    );
    expect(stored).toBe('foyer-1/places/photo.webp');
    expect(stored).not.toMatch(/^https?:\/\//);
  });

  it('lecture : les data: hérités rendent tels quels (aucun ré-upload forcé)', async () => {
    supabaseState.configured = true;
    const legacy = 'data:image/jpeg;base64,eG1s';
    expect(await resolvePlacePhotoUrl(legacy)).toBe(legacy);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('lecture : ressources applicatives, aperçus et URL passent tels quels', async () => {
    expect(await resolvePlacePhotoUrl(null)).toBeNull();
    expect(await resolvePlacePhotoUrl('/assets/adresses.jpg')).toBe('/assets/adresses.jpg');
    expect(await resolvePlacePhotoUrl('blob:apercu')).toBe('blob:apercu');
    expect(await resolvePlacePhotoUrl('https://cdn.example/photo.jpg')).toBe('https://cdn.example/photo.jpg');
    expect(isPlacePhotoPath('/assets/adresses.jpg')).toBe(false);
    expect(isPlacePhotoPath('data:image/png;base64,x')).toBe(false);
    expect(isPlacePhotoPath('foyer-1/places/photo.webp')).toBe(true);
    expect(placePhotoPathOf('foyer-1/places/photo.webp')).toBe('foyer-1/places/photo.webp');
    expect(placePhotoPathOf('blob:apercu')).toBeNull();
  });

  it('lecture : un chemin se forge en URL courte, échec fermé sinon', async () => {
    supabaseState.configured = true;
    expect(await resolvePlacePhotoUrl('foyer-1/places/photo.webp')).toBe(
      'https://signe.example/foyer-1/places/photo.webp',
    );
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer-1/places/photo.webp', 60 * 60);

    storageMocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'refusé' } });
    expect(await resolvePlacePhotoUrl('foyer-1/places/photo.webp')).toBeNull();

    supabaseState.configured = false;
    expect(await resolvePlacePhotoUrl('foyer-1/places/photo.webp')).toBeNull();
  });

  it('suppression : seul un chemin déclenche un nettoyage bucket', async () => {
    await deletePlacePhoto('foyer-1/places/photo.webp');
    expect(removeFileMock).toHaveBeenCalledTimes(1);

    await deletePlacePhoto('data:image/jpeg;base64,eG1s');
    await deletePlacePhoto('/assets/adresses.jpg');
    await deletePlacePhoto(null);
    expect(removeFileMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * WR-05 : la décision « retirer l'ancienne photo » est extraite en fonction
 * pure, parce que c'est son verdict — et non la comparaison en ligne du hook —
 * qui détruit (ou épargne) un objet du bucket. Le défaut ne se reproduit qu'en
 * mode Supabase (en démo, la valeur stockée est un aperçu, donc non-chemin) :
 * la preuve est donc unitaire, ici.
 */
describe('shouldRemovePreviousPlacePhoto — décision de retrait (WR-05)', () => {
  const stored = 'foyer-1/places/photo.webp';
  const signed = 'https://signe.example/foyer-1/places/photo.webp';

  it('(a) même chemin stocké des deux côtés : rien à retirer (le cas du défaut)', () => {
    expect(shouldRemovePreviousPlacePhoto(stored, stored)).toBe(false);
  });

  it('(b) chemin remplacé par un autre chemin : retrait', () => {
    expect(shouldRemovePreviousPlacePhoto(stored, 'foyer-1/places/autre.webp')).toBe(true);
  });

  it('(c) retrait explicite : chemin suivi de rien (nul ou vide) : retrait', () => {
    expect(shouldRemovePreviousPlacePhoto(stored, null)).toBe(true);
    expect(shouldRemovePreviousPlacePhoto(stored, '')).toBe(true);
    expect(shouldRemovePreviousPlacePhoto(stored, '   ')).toBe(true);
  });

  it('(d) aucune valeur précédente : rien à retirer', () => {
    expect(shouldRemovePreviousPlacePhoto(null, null)).toBe(false);
    expect(shouldRemovePreviousPlacePhoto(null, stored)).toBe(false);
    expect(shouldRemovePreviousPlacePhoto('  ', stored)).toBe(false);
  });

  it('(e) URL signée : une valeur non-chemin n’est jamais un objet de bucket', () => {
    expect(shouldRemovePreviousPlacePhoto(signed, signed)).toBe(false);
    expect(shouldRemovePreviousPlacePhoto(signed, stored)).toBe(false);
    expect(shouldRemovePreviousPlacePhoto(signed, null)).toBe(false);
  });

  it('intégration : une URL signée ne déclenche aucun nettoyage bucket', async () => {
    await deletePlacePhoto(signed);
    expect(removeFileMock).not.toHaveBeenCalled();
  });
});
