import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import type { RecipeRow } from '@/types';
import { toRecipe, type RecipeFormValues } from './types';
import { useRecettes } from './hooks/use-recettes';
import {
  deleteRecipe,
  deleteRecipeCover,
  recipeCoverPathOf,
  resolveRecipeCoverUrl,
  uploadRecipeCover,
} from './api';

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
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'blob:apercu-couverture',
      path: null,
      name: file.name,
      mime: 'image/jpeg',
      size: 21,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/client')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return supabaseState.configured;
    },
    get supabase() {
      return supabaseState.configured
        ? { storage: { from: (_bucket: string) => ({ createSignedUrl: storageMocks.createSignedUrl, remove: storageMocks.remove }) } }
        : null;
    },
  };
});

import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';

const depositMock = vi.mocked(depositHouseholdFile);
const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
});

describe('Couverture recettes (R9)', () => {
  it('rend les formes non-chemin telles quelles, null sans image', async () => {
    expect(await resolveRecipeCoverUrl(null)).toBeNull();
    expect(await resolveRecipeCoverUrl('blob:apercu-local')).toBe('blob:apercu-local');
    expect(await resolveRecipeCoverUrl('/assets/gratin.jpg')).toBe('/assets/gratin.jpg');
  });

  it('echec ferme sans backend : un chemin donne null, jamais de lien mort', async () => {
    expect(await resolveRecipeCoverUrl('foyer-1/recipes/r-1/file.jpg')).toBeNull();
  });

  it('forge une URL signee 1h quand le backend est la', async () => {
    supabaseState.configured = true;
    expect(await resolveRecipeCoverUrl('foyer-1/recipes/r-1/file.jpg')).toBe(
      'https://signe.example/foyer-1/recipes/r-1/file.jpg',
    );
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer-1/recipes/r-1/file.jpg', 3600);
  });

  it('distingue chemin bucket et URL (jamais d URL supprimee)', () => {
    expect(recipeCoverPathOf('foyer-1/recipes/r-1/file.jpg')).toBe('foyer-1/recipes/r-1/file.jpg');
    expect(recipeCoverPathOf('blob:apercu-local')).toBeNull();
    expect(recipeCoverPathOf('https://signe.example/fichier.jpg')).toBeNull();
    expect(recipeCoverPathOf(null)).toBeNull();
  });

  it('depose via le helper partage (compression native)', async () => {
    const file = new File(['pixels'], 'gratin.jpg', { type: 'image/jpeg' });
    const stored = await uploadRecipeCover(DEMO_HOUSEHOLD_ID, 'recipe-9', file);
    expect(depositMock).toHaveBeenCalledWith({ householdId: DEMO_HOUSEHOLD_ID, folder: 'recipes/recipe-9', file });
    expect(stored).toBe('blob:apercu-couverture');
  });

  it('supprimer la recette nettoie l objet Storage (aucun orphelin)', async () => {
    const adapter = getLocalAdapter();
    const saved = await adapter.create<RecipeRow>('recipes', {
      household_id: DEMO_HOUSEHOLD_ID,
      title: 'Gratin à supprimer',
      cover_photo: 'foyer-1/recipes/r-del/file.jpg',
      created_at: '2026-10-14T12:00:00.000Z',
    });

    await deleteRecipe(saved.id, 'foyer-1/recipes/r-del/file.jpg');

    expect(await adapter.list('recipes', { household_id: DEMO_HOUSEHOLD_ID })).not.toContainEqual(
      expect.objectContaining({ id: saved.id }),
    );
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/recipes/r-del/file.jpg');
  });

  it('supprimer sans couverture ne touche pas le Storage', async () => {
    await deleteRecipeCover(null);
    expect(removeFileMock).not.toHaveBeenCalled();
  });
});

/**
 * WR-09 — le dépôt de couverture en échec, à l'enregistrement d'une recette
 * NOUVELLE, doit supprimer la recette créée (D-08) : sans cela, une réédition
 * créait une seconde ligne. En édition, la recette préexistante est conservée.
 */
describe('useRecettes.saveRecipe — la couverture en échec emporte la ligne (WR-09)', () => {
  function renderRecettes() {
    const queryClient = createTestQueryClient();
    return renderHook(() => useRecettes(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    });
  }

  function formValues(file: File | null): RecipeFormValues {
    return {
      title: 'Gratin raté',
      categoryId: '',
      newCategoryName: '',
      servings: 4,
      prepHours: null,
      prepMins: null,
      cookHours: null,
      cookMins: null,
      tags: [],
      coverFile: file,
      existingCover: null,
    };
  }

  it('recette NOUVELLE : un dépôt en échec supprime la recette créée', async () => {
    seedHouseholdStore();
    const { result } = renderRecettes();
    const file = new File(['pixels'], 'gratin.jpg', { type: 'image/jpeg' });
    depositMock.mockRejectedValueOnce(new Error('stockage indisponible'));

    await expect(result.current.saveRecipe(null, formValues(file))).rejects.toThrow('stockage indisponible');

    const rows = await data.list<RecipeRow>('recipes', { household_id: DEMO_HOUSEHOLD_ID });
    expect(rows.some((row) => row.title === 'Gratin raté')).toBe(false);
  });

  it('recette EXISTANTE : un dépôt en échec ne la supprime pas', async () => {
    seedHouseholdStore();
    const adapter = getLocalAdapter();
    const saved = await adapter.create<RecipeRow>('recipes', {
      household_id: DEMO_HOUSEHOLD_ID,
      title: 'Gratin conservé',
      created_at: '2026-10-14T12:00:00.000Z',
    });
    const { result } = renderRecettes();
    const file = new File(['pixels'], 'gratin.jpg', { type: 'image/jpeg' });
    depositMock.mockRejectedValueOnce(new Error('stockage indisponible'));

    try {
      await expect(result.current.saveRecipe(toRecipe(saved, {}), formValues(file))).rejects.toThrow(
        'stockage indisponible',
      );

      const rows = await data.list<RecipeRow>('recipes', { household_id: DEMO_HOUSEHOLD_ID });
      expect(rows.some((row) => row.id === saved.id)).toBe(true);
    } finally {
      await adapter.remove('recipes', saved.id).catch(() => undefined);
    }
  });
});
