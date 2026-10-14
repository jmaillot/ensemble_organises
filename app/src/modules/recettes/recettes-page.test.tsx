import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { RecipeCategoryRow } from '@/types';
import RecettesPage from './recettes-page';
import RecetteDetailPage from './recette-detail-page';

function Shell() {
  return (
    <Routes>
      <Route path="/recettes" element={<RecettesPage />} />
      <Route path="/recettes/:id" element={<RecetteDetailPage />} />
    </Routes>
  );
}

async function seedGrid() {
  const adapter = getLocalAdapter();
  const desserts = await adapter.create<RecipeCategoryRow>('recipe_categories', {
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Desserts',
  });
  await adapter.create('recipes', {
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Gratin dauphinois',
    servings: 4,
    prep_minutes: 30,
    cook_minutes: 45,
    category_id: null,
    created_at: '2026-10-14T10:00:00.000Z',
  });
  await adapter.create('recipes', {
    household_id: DEMO_HOUSEHOLD_ID,
    title: 'Fondant au chocolat',
    servings: 6,
    prep_minutes: 20,
    cook_minutes: 12,
    category_id: desserts.id,
    created_at: '2026-10-14T11:00:00.000Z',
  });
}

describe('Recettes — grille vers fiche (tracer)', () => {
  it('affiche 3 cartes groupees sous 2 en-tetes, Recettes du foyer en premier', async () => {
    await seedGrid();
    renderWithProviders(<Shell />, { route: '/recettes' });

    const foyer = await screen.findByRole('heading', { name: 'Recettes du foyer' });
    const desserts = await screen.findByRole('heading', { name: 'Desserts' });
    expect(foyer.compareDocumentPosition(desserts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Tartiflette (demo) + Gratin sous le foyer, Fondant sous Desserts.
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche Gratin dauphinois' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche Tartiflette de saison' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche Fondant au chocolat' })).toBeInTheDocument();
    expect(screen.getByText('1h15')).toBeInTheDocument();
  });

  it('cliquer une carte ouvre sa fiche avec ingredients et etapes', async () => {
    await seedGrid();
    const user = userEvent.setup();
    renderWithProviders(<Shell />, { route: '/recettes' });

    await user.click(await screen.findByRole('link', { name: 'Ouvrir la fiche Gratin dauphinois' }));

    expect(await screen.findByRole('heading', { name: 'Gratin dauphinois' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ingrédients' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Étapes' })).toBeInTheDocument();
  });

  it('creer Gratin pour 4 (30 + 45) affiche 1h15 sur sa carte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />, { route: '/recettes' });

    await screen.findByRole('heading', { name: 'Recettes du foyer' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle recette' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom/), 'Gratin dauphinois');
    await user.clear(within(dialog).getByLabelText(/Personnes/));
    await user.type(within(dialog).getByLabelText(/Personnes/), '4');
    await user.type(within(dialog).getByLabelText('Minutes de préparation'), '30');
    await user.type(within(dialog).getByLabelText('Minutes de cuisson'), '45');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la recette' }));

    expect(await screen.findByRole('link', { name: 'Ouvrir la fiche Gratin dauphinois' })).toBeInTheDocument();
    expect(screen.getByText('1h15')).toBeInTheDocument();
  });
});
