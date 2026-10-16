import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RecipeCuisineView } from './components/recipe-cuisine-view';
import type { RecipeStep } from './types';

/**
 * Photo d’étape en mode cuisine (R3, D-06/D-07/D-08/D-10). La vue cuisine ne
 * reçoit que la carte d’URLs déjà résolue par la fiche (`21-01`) : aucune
 * résolution ici, aucun appel réseau. La vue isolée est rendue sans la page
 * entière (même piège Pitfall 7 que `recette-cuisine.test.tsx` : les requêtes
 * TanStack de la fiche fausseraient la preuve « zéro réseau »).
 */
const VIEW_STEPS: RecipeStep[] = [
  { id: 'v-1', content: 'Éplucher les pommes de terre.', position: 0, photoPath: null },
  { id: 'v-2', content: 'Les couper en rondelles.', position: 1, photoPath: null },
  { id: 'v-3', content: 'Enfourner 45 minutes.', position: 2, photoPath: null },
];

const PHOTO_URLS = { 'v-2': 'https://signe.example/etape-2.jpg' };

function renderCuisine(photoUrls: Record<string, string | null> = {}) {
  return renderWithProviders(
    <RecipeCuisineView steps={VIEW_STEPS} recipeId="r-photo-vue" wakeLockSupported photoUrls={photoUrls} />,
  );
}

describe('Mode cuisine — photo d’étape (R3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('une étape dont la carte porte une URL rend une <img> au src exact, sous son texte', () => {
    renderCuisine(PHOTO_URLS);

    const stepText = screen.getByText('Les couper en rondelles.');
    const item = stepText.closest('li');
    expect(item).not.toBeNull();

    const image = within(item as HTMLElement).getByRole('img');
    expect(image).toHaveAttribute('src', 'https://signe.example/etape-2.jpg');
    expect(image).toHaveAttribute('alt', 'Photo de l’étape 2');
  });

  it('une étape absente de la carte ne rend aucun média, compté exactement', () => {
    renderCuisine(PHOTO_URLS);

    const list = screen.getByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    // Une seule image dans toute la liste : celle de l’étape 2.
    expect(within(list).getAllByRole('img')).toHaveLength(1);

    for (const content of ['Éplucher les pommes de terre.', 'Enfourner 45 minutes.']) {
      const item = screen.getByText(content).closest('li') as HTMLElement;
      expect(within(item).queryByRole('img')).toBeNull();
      expect(within(item).queryByRole('button', { name: /Agrandir/ })).toBeNull();
    }
  });

  it('cocher l’étape réduit la hauteur de l’image sans la retirer du DOM', async () => {
    const user = userEvent.setup();
    renderCuisine(PHOTO_URLS);

    const list = screen.getByRole('list', { name: 'Étapes de la recette' });
    // On capture la chaîne, pas le nœud : React réutilise l’élément et met à
    // jour sa `className` en place, donc une référence au nœud est vivante.
    const beforeClass = within(list).getByRole('img').className;
    expect(beforeClass).toContain('max-h-[320px]');

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' }));

    const after = within(list).getByRole('img');
    expect(after).toBeInTheDocument();
    expect(after).toHaveAttribute('src', 'https://signe.example/etape-2.jpg');
    expect(after.className).toContain('max-h-[120px]');
    expect(after.className).not.toBe(beforeClass);
  });

  it('taper l’image ouvre le plein écran, puis se referme', async () => {
    const user = userEvent.setup();
    renderCuisine(PHOTO_URLS);

    await user.click(screen.getByRole('button', { name: 'Agrandir : Photo de l’étape 2' }));

    const dialog = await screen.findByRole('dialog', { name: 'Photo de l’étape 2' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://signe.example/etape-2.jpg');

    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la vue cuisine photographiée ne fait aucun appel réseau', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        calls.push(url);
        throw new Error('réseau interdit en mode cuisine');
      }),
    );
    const user = userEvent.setup();
    renderCuisine(PHOTO_URLS);

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' }));
    await user.click(screen.getByRole('button', { name: 'Agrandir : Photo de l’étape 2' }));

    expect(calls).toEqual([]);
  });
});
