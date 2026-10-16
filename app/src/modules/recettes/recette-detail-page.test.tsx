import { act, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import RecetteDetailPage from './recette-detail-page';

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
});
