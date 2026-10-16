import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      url: 'blob:apercu-etape',
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

import { depositHouseholdFile } from '@/lib/storage';
import { resolveRecipeStepPhotoUrl, resolveRecipeStepPhotoUrls, uploadRecipeStepPhoto } from './api';

const depositMock = vi.mocked(depositHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
});

describe('Photo d’étape (R1, D-02/D-03)', () => {
  it('rend les formes non-chemin telles quelles, null sans photo', async () => {
    expect(await resolveRecipeStepPhotoUrl(null)).toBeNull();
    expect(await resolveRecipeStepPhotoUrl('blob:apercu-etape')).toBe('blob:apercu-etape');
  });

  it('échec fermé sans backend : un chemin donne null, jamais de lien mort', async () => {
    expect(await resolveRecipeStepPhotoUrl('foyer-1/recipes/r-1/steps/s-1/file.jpg')).toBeNull();
  });

  it('forge une URL signée 1h quand le backend est là', async () => {
    supabaseState.configured = true;
    expect(await resolveRecipeStepPhotoUrl('foyer-1/recipes/r-1/steps/s-1/file.jpg')).toBe(
      'https://signe.example/foyer-1/recipes/r-1/steps/s-1/file.jpg',
    );
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer-1/recipes/r-1/steps/s-1/file.jpg', 3600);
  });

  it('forge chaque photo en une passe, seules les entrées non nulles', async () => {
    supabaseState.configured = true;
    const urls = await resolveRecipeStepPhotoUrls([
      { id: 's-1', photoPath: 'foyer-1/recipes/r-1/steps/s-1/file.jpg' },
      { id: 's-2', photoPath: null },
    ]);
    expect(urls).toEqual({ 's-1': 'https://signe.example/foyer-1/recipes/r-1/steps/s-1/file.jpg' });
    expect(urls['s-2']).toBeUndefined();
  });

  it('dépose via le helper partagé, dossier recipes/<recipeId>/steps/<stepId>', async () => {
    const file = new File(['pixels'], 'etape.jpg', { type: 'image/jpeg' });
    const stored = await uploadRecipeStepPhoto('foyer-1', 'recipe-9', 'step-3', file);
    expect(depositMock).toHaveBeenCalledWith({ householdId: 'foyer-1', folder: 'recipes/recipe-9/steps/step-3', file });
    expect(stored).toBe('blob:apercu-etape');
  });
});
