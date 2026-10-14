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
  { id: 'step-1', content: 'Éplucher les pommes de terre.', position: 0 },
  { id: 'step-2', content: 'Les couper en rondelles.', position: 1 },
  { id: 'step-3', content: 'Enfourner 45 minutes.', position: 2 },
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
});
