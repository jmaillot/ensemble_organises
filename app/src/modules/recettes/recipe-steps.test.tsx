import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { RecipeSteps } from './components/recipe-steps';
import { reorderRecipeSteps } from './api';
import type { RecipeStep } from './types';

const STEPS: RecipeStep[] = [
  { id: 'step-1', content: 'Éplucher les pommes de terre.', position: 0, photoPath: null },
  { id: 'step-2', content: 'Les couper en rondelles.', position: 1, photoPath: null },
  { id: 'step-3', content: 'Enfourner 45 minutes.', position: 2, photoPath: null },
];

/** Étape 2 photographiée : sa référence de bucket est posée (D-11, D-13). */
const PHOTO_STEPS: RecipeStep[] = [
  { id: 'step-1', content: 'Éplucher les pommes de terre.', position: 0, photoPath: null },
  { id: 'step-2', content: 'Les couper en rondelles.', position: 1, photoPath: 'foyer-1/recipes/r-1/steps/step-2/file.jpg' },
  { id: 'step-3', content: 'Enfourner 45 minutes.', position: 2, photoPath: null },
];

function renderSteps(onReorder: (ids: string[]) => void = () => {}) {
  return renderWithProviders(
    <RecipeSteps
      steps={STEPS}
      onAdd={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={onReorder}
    />,
  );
}

describe('Étapes recettes (R7, D-11, D-12)', () => {
  it('affiche les bulles 1-2-3 avec poignees de drag', async () => {
    renderSteps();
    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).getByRole('button', { name: 'Réordonner : étape 1' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Réordonner : étape 2' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Réordonner : étape 3' })).toBeInTheDocument();
    expect(screen.getByText('Éplucher les pommes de terre.')).toBeInTheDocument();
  });

  it('descendre l etape 1 appelle le reorder avec 2-1-3', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderSteps(onReorder);

    await user.click(await screen.findByRole('button', { name: 'Descendre l’étape 1' }));
    expect(onReorder).toHaveBeenCalledWith(['step-2', 'step-1', 'step-3']);
  });

  it('monter l etape 3 appelle le reorder avec 3 en premier', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderSteps(onReorder);

    await user.click(await screen.findByRole('button', { name: 'Monter l’étape 3' }));
    expect(onReorder).toHaveBeenCalledWith(['step-1', 'step-3', 'step-2']);
  });

  it('les cases cuisson sont locales (aucune persistance appelee)', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    renderSteps(onReorder);

    await user.click(await screen.findByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    expect(screen.getByText('Éplucher les pommes de terre.')).toBeInTheDocument();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reorder persiste des positions denses (3 vers 1, sans trou)', async () => {
    const adapter = getLocalAdapter();
    for (const step of STEPS) {
      await adapter.create('recipe_steps', {
        id: step.id,
        recipe_id: 'recipe-1',
        household_id: DEMO_HOUSEHOLD_ID,
        content: step.content,
        position: step.position,
      });
    }

    await reorderRecipeSteps(['step-3', 'step-1', 'step-2']);

    const rows = await adapter.list<{ id: string; position: number }>('recipe_steps', { recipe_id: 'recipe-1' });
    const positions = new Map(rows.map((row) => [row.id, row.position]));
    expect(positions.get('step-3')).toBe(0);
    expect(positions.get('step-1')).toBe(1);
    expect(positions.get('step-2')).toBe(2);
  });

  it('rend l’image d’une étape photographiée, aucun média pour une étape nue', async () => {
    renderWithProviders(
      <RecipeSteps
        steps={STEPS}
        photoUrls={{ 'step-2': 'https://signe.example/etape-2.jpg' }}
        onAdd={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
        onReorder={() => {}}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    const images = within(list).getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://signe.example/etape-2.jpg');
    expect(images[0]).toHaveAttribute('alt', 'Photo de l’étape 2');
  });

  it('en lecture seule, l’image reste mais aucune commande de photo n’est rendue', async () => {
    renderWithProviders(
      <RecipeSteps
        steps={PHOTO_STEPS}
        readOnly
        photoUrls={{ 'step-2': 'https://signe.example/etape-2.jpg' }}
        onAdd={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
        onReorder={() => {}}
        onAddPhoto={() => {}}
        onReplacePhoto={() => {}}
        onRemovePhoto={() => {}}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).getAllByRole('img')).toHaveLength(1);
    expect(within(list).queryByRole('button', { name: 'Ajouter une photo' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'Modifier la photo' })).toBeNull();
    expect(within(list).queryByRole('button', { name: 'Retirer la photo de l’étape 2' })).toBeNull();
  });

  it('en écriture, l’invitation et la modification sont offertes, le retrait exige la confirmation inline', async () => {
    const user = userEvent.setup();
    const onRemovePhoto = vi.fn();
    renderWithProviders(
      <RecipeSteps
        steps={PHOTO_STEPS}
        photoUrls={{ 'step-2': 'https://signe.example/etape-2.jpg' }}
        onAdd={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
        onReorder={() => {}}
        onAddPhoto={() => {}}
        onReplacePhoto={() => {}}
        onRemovePhoto={onRemovePhoto}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    // Étapes nues 1 et 3 : invitation d’ajout ; étape photographiée 2 : modification.
    expect(within(list).getAllByRole('button', { name: 'Ajouter une photo' })).toHaveLength(2);
    expect(within(list).getAllByRole('button', { name: 'Modifier la photo' })).toHaveLength(1);

    // Le retrait n’agit qu’après la confirmation inline (D-13).
    await user.click(within(list).getByRole('button', { name: 'Retirer la photo de l’étape 2' }));
    expect(onRemovePhoto).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog', { name: 'Retirer cette photo ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    expect(onRemovePhoto).toHaveBeenCalledTimes(1);
    expect(onRemovePhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-2' }));
  });

  it('ne rend pas « Retirer la photo » pour une étape dont l’image n’est pas rendue (IN-01)', async () => {
    // `photoPath` est posé sur l’étape 2, mais aucune URL n’est rendue
    // (signature échouée ou aperçu démo mort) : la commande de retrait suit
    // l’image RENDUE, pas la seule référence stockée. Sinon la ligne montre à
    // la fois « Ajouter une photo » et « ✕ Retirer » pour une étape sans image.
    renderWithProviders(
      <RecipeSteps
        steps={PHOTO_STEPS}
        onAdd={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
        onReorder={() => {}}
        onAddPhoto={() => {}}
        onReplacePhoto={() => {}}
        onRemovePhoto={() => {}}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).queryByRole('button', { name: 'Retirer la photo de l’étape 2' })).toBeNull();
    // L’invitation d’ajout reste offerte sur les trois étapes : un remplacement
    // reste possible par cette affordance (elle nettoie l’ancien objet).
    expect(within(list).getAllByRole('button', { name: 'Ajouter une photo' })).toHaveLength(3);
  });
});
