import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import RecetteDetailPage from './recette-detail-page';

/**
 * Espion du nettoyage du Storage. La suppression d’une recette doit transmettre
 * les chemins de photo des étapes JUSQU’À `removeHouseholdFile` (R5) :
 * s’arrêter à la frontière `api` — déjà couverte par `recipe-step-photo.test.ts`
 * — ne prouverait rien du câblage de la page. Le reste de `@/lib/storage` reste
 * réel (résolution des formes non-chemin `blob:`/`data:`…).
 */
const { removeHouseholdFileMock } = vi.hoisted(() => ({
  removeHouseholdFileMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, removeHouseholdFile: removeHouseholdFileMock };
});

/**
 * Photo d’étape sur la fiche et dans le bloc d’impression (R3, D-06/D-09).
 * Aperçu démo `blob:` (forme non-chemin) : la résolution de la fiche le rend
 * tel quel (D-18), donc l’image apparaît sans backend. Une étape nue ne rend
 * aucun élément média, ni à l’écran ni sur le papier.
 */
const STEP_WITH_PHOTO = 'Éplucher les pommes de terre.';
const STEP_BARE = 'Enfourner 45 minutes.';
const STEP_PHOTO_URL = 'blob:apercu-etape-1';

async function seedFiche(title: string): Promise<string> {
  const adapter = getLocalAdapter();
  const created = await adapter.create('recipes', {
    household_id: DEMO_HOUSEHOLD_ID,
    title,
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    category_id: null,
    created_at: new Date().toISOString(),
  });
  const recipeId = String((created as unknown as { id: unknown }).id);
  await adapter.create('recipe_steps', {
    recipe_id: recipeId,
    household_id: DEMO_HOUSEHOLD_ID,
    content: STEP_WITH_PHOTO,
    position: 0,
    photo_path: STEP_PHOTO_URL,
  });
  await adapter.create('recipe_steps', {
    recipe_id: recipeId,
    household_id: DEMO_HOUSEHOLD_ID,
    content: STEP_BARE,
    position: 1,
    photo_path: null,
  });
  return recipeId;
}

/**
 * Graine d’une fiche dont UNE étape porte un CHEMIN DE BUCKET (et non un
 * aperçu démo `blob:`). `householdMediaPathOf` rend `null` pour une forme
 * non-chemin : un `blob:` ne déclencherait aucun nettoyage et l’assertion de
 * câblage serait vraie sans rien regarder. La forme est celle que
 * `storedValueOf` écrit réellement (`${householdId}/recipes/<recipeId>/steps/<stepId>/…`).
 * L’id de l’étape est généré par l’adaptateur : on crée l’étape nue, puis on
 * pose le chemin (il contient l’id).
 */
async function seedFicheAvecPhotoDeBucket(title: string): Promise<{ recipeId: string; stepPath: string }> {
  const adapter = getLocalAdapter();
  const created = await adapter.create('recipes', {
    household_id: DEMO_HOUSEHOLD_ID,
    title,
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    category_id: null,
    created_at: new Date().toISOString(),
  });
  const recipeId = String((created as unknown as { id: unknown }).id);
  const step = await adapter.create('recipe_steps', {
    recipe_id: recipeId,
    household_id: DEMO_HOUSEHOLD_ID,
    content: STEP_WITH_PHOTO,
    position: 0,
    photo_path: null,
  });
  const stepId = String((step as unknown as { id: unknown }).id);
  const stepPath = `${DEMO_HOUSEHOLD_ID}/recipes/${recipeId}/steps/${stepId}/photo.jpg`;
  await adapter.update('recipe_steps', stepId, { photo_path: stepPath });
  return { recipeId, stepPath };
}

function renderDetail(recipeId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/recettes/:id" element={<RecetteDetailPage />} />
    </Routes>,
    { route: `/recettes/${recipeId}` },
  );
}

describe('Fiche recette — photo d’étape (R3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('la fiche rend l’image de l’étape photographiée, aucun média pour l’étape nue', async () => {
    const recipeId = await seedFiche('Fiche photo');
    renderDetail(recipeId);

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    // La carte d’URLs est résolue par une `useQuery` séparée : on attend
    // l’image plutôt que de lire un rendu transitoire.
    const images = await within(list).findAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', STEP_PHOTO_URL);
    expect(images[0]).toHaveAttribute('alt', 'Photo de l’étape 1');

    const bareItem = screen.getByText(STEP_BARE).closest('li') as HTMLElement;
    expect(within(bareItem).queryByRole('img')).toBeNull();
  });

  it('le bloc d’impression porte une <img> sous sa ligne, et rien pour l’étape nue', async () => {
    const recipeId = await seedFiche('Fiche print');
    const { container } = renderDetail(recipeId);
    await screen.findByRole('heading', { name: 'Fiche print' });

    const print = container.querySelector('.recipe-print') as HTMLElement;
    expect(print).not.toBeNull();

    // Le bloc `.recipe-print` est `aria-hidden` : `byRole` ne le voit pas, on
    // interroge donc les images par sélecteur, en attendant la résolution.
    await waitFor(() => expect(print.querySelectorAll('img')).toHaveLength(1));
    const images = print.querySelectorAll('img');
    expect(images[0]).toHaveAttribute('src', STEP_PHOTO_URL);

    const photographed = within(print).getByText('1. Éplucher les pommes de terre.').closest('li') as HTMLElement;
    expect(photographed.querySelector('img')).not.toBeNull();
    const bare = within(print).getByText('2. Enfourner 45 minutes.').closest('li') as HTMLElement;
    expect(bare.querySelector('img')).toBeNull();
  });

  it('un enfant (lecture seule) voit l’image mais aucune commande de photo', async () => {
    const recipeId = await seedFiche('Fiche enfant');
    renderDetail(recipeId);
    act(() => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    });

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    expect(await within(list).findAllByRole('img')).toHaveLength(1);
    expect(within(list).queryByRole('button', { name: 'Ajouter une photo' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'Modifier la photo' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'Retirer la photo de l’étape 1' })).toBeNull();
  });

  it('supprimer la recette transmet le chemin de photo d’étape jusqu’au nettoyage (R5)', async () => {
    const user = userEvent.setup();
    const { recipeId, stepPath } = await seedFicheAvecPhotoDeBucket('Fiche suppression');
    renderDetail(recipeId);
    await screen.findByRole('heading', { name: 'Fiche suppression' });

    // Parcours réel de la page : « Supprimer la recette » ouvre la
    // confirmation, « Supprimer » exécute `removeRecipe(recipe, chemins)`.
    await user.click(screen.getByRole('button', { name: 'Supprimer la recette' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    // L’assertion vise le point le plus haut du trajet : le chemin de l’étape
    // a traversé la page → `use-recettes.ts` → `api.ts` → `removeStepPhotoObject`.
    await waitFor(() => expect(removeHouseholdFileMock).toHaveBeenCalledWith(stepPath));
  });
});
