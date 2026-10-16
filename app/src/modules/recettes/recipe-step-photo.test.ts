import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';

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

import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { RecipeRow, RecipeStepRow } from '@/types';
import { StepPhoto } from './components/step-photo';
import {
  clearRecipeStepPhoto,
  deleteRecipe,
  deleteRecipeStep,
  replaceRecipeStepPhoto,
  resolveRecipeStepPhotoUrl,
  resolveRecipeStepPhotoUrls,
  uploadRecipeStepPhoto,
} from './api';

const depositMock = vi.mocked(depositHouseholdFile);
const removeFileMock = vi.mocked(removeHouseholdFile);

const OLD = 'foyer-1/recipes/r-1/steps/s-1/ancien.jpg';
const NEW = 'foyer-1/recipes/r-1/steps/s-1/neuf.jpg';

function deposited(path: string | null) {
  return { url: 'https://signe.example/file.jpg', path, name: 'etape.jpg', mime: 'image/jpeg', size: 21 };
}

async function seedStep(photoPath: string | null): Promise<RecipeStepRow> {
  const adapter = getLocalAdapter();
  return adapter.create<RecipeStepRow>('recipe_steps', {
    recipe_id: 'recipe-x',
    household_id: DEMO_HOUSEHOLD_ID,
    content: 'Éplucher les pommes de terre.',
    position: 0,
    photo_path: photoPath,
  });
}

async function stepPhotoPath(id: string): Promise<string | null | undefined> {
  const rows = await getLocalAdapter().list<RecipeStepRow>('recipe_steps', { recipe_id: 'recipe-x' });
  return rows.find((row) => row.id === id)?.photo_path;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
  depositMock.mockImplementation(async ({ file }: { file: File }) => ({
    url: 'blob:apercu-etape',
    path: null,
    name: file.name,
    mime: 'image/jpeg',
    size: 21,
  }));
  removeFileMock.mockImplementation(async () => {});
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

describe('Photo d’étape — ajouter, remplacer, retirer (R1, R2, R5, D-04/D-05)', () => {
  it('remplacer dépose un chemin neuf, met à jour la ligne et retire l’ancien objet une fois', async () => {
    const step = await seedStep(OLD);
    depositMock.mockResolvedValueOnce(deposited(NEW));

    await replaceRecipeStepPhoto({
      householdId: DEMO_HOUSEHOLD_ID,
      recipeId: 'r-1',
      stepId: step.id,
      previous: OLD,
      file: new File(['p'], 'neuf.jpg', { type: 'image/jpeg' }),
    });

    expect(await stepPhotoPath(step.id)).toBe(NEW);
    expect(removeFileMock).toHaveBeenCalledTimes(1);
    expect(removeFileMock).toHaveBeenCalledWith(OLD);
  });

  it('un retrait en échec est journalisé sans annuler la nouvelle photo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const step = await seedStep(OLD);
    depositMock.mockResolvedValueOnce(deposited(NEW));
    removeFileMock.mockRejectedValueOnce(new Error('bucket indisponible'));

    await replaceRecipeStepPhoto({
      householdId: DEMO_HOUSEHOLD_ID,
      recipeId: 'r-1',
      stepId: step.id,
      previous: OLD,
      file: new File(['p'], 'neuf.jpg', { type: 'image/jpeg' }),
    });

    expect(await stepPhotoPath(step.id)).toBe(NEW);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Objet de média non retiré du bucket'), expect.any(Error));
    warn.mockRestore();
  });

  it('remplacer par le même chemin ne retire rien (l’objet neuf est protégé)', async () => {
    const step = await seedStep(NEW);
    depositMock.mockResolvedValueOnce(deposited(NEW));

    await replaceRecipeStepPhoto({
      householdId: DEMO_HOUSEHOLD_ID,
      recipeId: 'r-1',
      stepId: step.id,
      previous: NEW,
      file: new File(['p'], 'neuf.jpg', { type: 'image/jpeg' }),
    });

    expect(removeFileMock).not.toHaveBeenCalled();
  });

  it('retirer une photo absente est un no-op sans toucher au Storage', async () => {
    const step = await seedStep(null);

    await clearRecipeStepPhoto(step.id, null);

    expect(await stepPhotoPath(step.id)).toBeNull();
    expect(removeFileMock).not.toHaveBeenCalled();
  });

  it('retirer une photo efface la référence et retire l’objet', async () => {
    const step = await seedStep(OLD);

    await clearRecipeStepPhoto(step.id, OLD);

    expect(await stepPhotoPath(step.id)).toBeNull();
    expect(removeFileMock).toHaveBeenCalledTimes(1);
    expect(removeFileMock).toHaveBeenCalledWith(OLD);
  });

  it('supprimer une étape sans photo ne touche pas au Storage', async () => {
    const step = await seedStep(null);

    await deleteRecipeStep(step.id, null);

    const rows = await getLocalAdapter().list<RecipeStepRow>('recipe_steps', { recipe_id: 'recipe-x' });
    expect(rows.some((row) => row.id === step.id)).toBe(false);
    expect(removeFileMock).not.toHaveBeenCalled();
  });

  it('supprimer une étape photographiée retire son objet', async () => {
    const step = await seedStep(OLD);

    await deleteRecipeStep(step.id, OLD);

    expect(removeFileMock).toHaveBeenCalledWith(OLD);
  });

  it('supprimer la recette tente tous les objets d’étape même si l’un échoue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = getLocalAdapter();
    const saved = await adapter.create<RecipeRow>('recipes', {
      household_id: DEMO_HOUSEHOLD_ID,
      title: 'Recette à supprimer',
      cover_photo: 'foyer-1/recipes/r-del/cover.jpg',
      created_at: '2026-10-16T12:00:00.000Z',
    });
    const stepA = 'foyer-1/recipes/r-del/steps/s-1/a.jpg';
    const stepB = 'foyer-1/recipes/r-del/steps/s-2/b.jpg';
    // La couverture réussit ; le premier objet d’étape échoue ; le second doit
    // tout de même être tenté.
    removeFileMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('objet indisponible'));

    await deleteRecipe(saved.id, 'foyer-1/recipes/r-del/cover.jpg', [stepA, stepB]);

    expect(removeFileMock).toHaveBeenCalledTimes(3);
    expect(removeFileMock).toHaveBeenCalledWith(stepB);
    expect(await adapter.list('recipes', { household_id: DEMO_HOUSEHOLD_ID })).not.toContainEqual(
      expect.objectContaining({ id: saved.id }),
    );
    warn.mockRestore();
  });

  it('deux remplacements concurrents : le dernier écrit gagne, une seule référence subsiste', async () => {
    const step = await seedStep(OLD);
    depositMock
      .mockResolvedValueOnce(deposited('foyer-1/recipes/r-1/steps/s-1/un.jpg'))
      .mockResolvedValueOnce(deposited('foyer-1/recipes/r-1/steps/s-1/deux.jpg'));

    await Promise.all([
      replaceRecipeStepPhoto({ householdId: DEMO_HOUSEHOLD_ID, recipeId: 'r-1', stepId: step.id, previous: OLD, file: new File(['p'], 'un.jpg', { type: 'image/jpeg' }) }),
      replaceRecipeStepPhoto({ householdId: DEMO_HOUSEHOLD_ID, recipeId: 'r-1', stepId: step.id, previous: OLD, file: new File(['p'], 'deux.jpg', { type: 'image/jpeg' }) }),
    ]);

    const rows = await getLocalAdapter().list<RecipeStepRow>('recipe_steps', { recipe_id: 'recipe-x' });
    const matching = rows.filter((row) => row.id === step.id);
    expect(matching).toHaveLength(1);
    expect(['foyer-1/recipes/r-1/steps/s-1/un.jpg', 'foyer-1/recipes/r-1/steps/s-1/deux.jpg']).toContain(matching[0]?.photo_path);
  });

  it('un dépôt qui se résout après la disparition de l’étape ne lève pas et avertit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // L’étape n’existe pas (supprimée par cascade ou par une autre session) :
    // l’écriture de la référence est abandonnée, jamais levée.
    depositMock.mockResolvedValueOnce(deposited('foyer-1/recipes/r-1/steps/step-disparu/orphelin.jpg'));

    await expect(
      replaceRecipeStepPhoto({
        householdId: DEMO_HOUSEHOLD_ID,
        recipeId: 'r-1',
        stepId: 'step-disparu',
        previous: null,
        file: new File(['p'], 'orphelin.jpg', { type: 'image/jpeg' }),
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Photo d’étape non écrite'), expect.any(Error));
    expect(warn.mock.calls.some(([message]) => String(message).includes('step-disparu'))).toBe(true);
    warn.mockRestore();
  });

  it('une écriture non atterrie ne retire PAS l’ancien objet et nettoie le neuf (CR-01)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // L’écriture n’atterrit pas (ligne absente) : `previous` peut encore être
    // référencé par la ligne réelle, donc le retirer serait destructeur. Seul
    // l’objet neuf, que personne ne référence, est retiré.
    depositMock.mockResolvedValueOnce(deposited(NEW));

    await replaceRecipeStepPhoto({
      householdId: DEMO_HOUSEHOLD_ID,
      recipeId: 'r-1',
      stepId: 'step-disparu',
      previous: OLD,
      file: new File(['p'], 'neuf.jpg', { type: 'image/jpeg' }),
    });

    expect(removeFileMock).not.toHaveBeenCalledWith(OLD);
    expect(removeFileMock).toHaveBeenCalledWith(NEW);
    warn.mockRestore();
  });

  it('un retrait dont l’écriture n’atterrit pas ne retire PAS l’ancien objet (CR-01)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await clearRecipeStepPhoto('step-disparu', OLD);

    expect(removeFileMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Photo d’étape — rendu et aperçu mort (R6, D-18)', () => {
  it('un aperçu blob: vivant est rendu', () => {
    const { queryByRole } = renderWithProviders(
      createElement(StepPhoto, { url: 'blob:apercu-vivant', alt: 'Photo de l’étape 1' }),
    );
    expect(queryByRole('img')).toHaveAttribute('src', 'blob:apercu-vivant');
  });

  it('un aperçu mort (onError) ne laisse aucun élément média et rouvre l’invitation', () => {
    const { container, queryByRole, getByRole } = renderWithProviders(
      createElement(StepPhoto, {
        url: 'blob:apercu-mort',
        alt: 'Photo de l’étape 1',
        onSelectPhoto: () => {},
      }),
    );
    const image = queryByRole('img');
    expect(image).not.toBeNull();

    fireEvent.error(image as Element);

    // Ni image cassée, ni cadre vide : l’étape se rend comme sans photo.
    expect(container.querySelector('img')).toBeNull();
    expect(queryByRole('img')).toBeNull();
    // Un membre qui écrit retrouve l’invitation d’ajout (il peut redéposer).
    expect(getByRole('button', { name: 'Ajouter une photo' })).toBeInTheDocument();
  });

  it('en démo, le dépôt rend un blob: que la résolution laisse intact (D-18)', async () => {
    const file = new File(['pixels'], 'etape.jpg', { type: 'image/jpeg' });
    const stored = await uploadRecipeStepPhoto('foyer-1', 'r-1', 's-1', file);
    expect(stored).toBe('blob:apercu-etape');
    expect(await resolveRecipeStepPhotoUrl(stored)).toBe('blob:apercu-etape');
  });

  it('le plein écran ne se rouvre pas après la mort de l’aperçu (IN-02)', async () => {
    const user = userEvent.setup();
    const { queryByRole, getByRole, rerender } = renderWithProviders(
      createElement(StepPhoto, { url: 'blob:apercu-mort', alt: 'Photo de l’étape 1', onSelectPhoto: () => {} }),
    );

    // Le plein écran s’ouvre sur un geste explicite.
    const thumbnail = getByRole('img');
    await user.click(getByRole('button', { name: 'Agrandir : Photo de l’étape 1' }));
    expect(await queryByRole('dialog')).not.toBeNull();

    // L’aperçu meurt : le dialogue est démonté et l’état doit retomber.
    fireEvent.error(thumbnail);
    expect(queryByRole('dialog')).toBeNull();

    // Une URL neuve arrive : le dialogue ne doit PAS se rouvrir sans geste.
    rerender(createElement(StepPhoto, { url: 'blob:apercu-neuf', alt: 'Photo de l’étape 1', onSelectPhoto: () => {} }));
    expect(queryByRole('dialog')).toBeNull();
  });
});
