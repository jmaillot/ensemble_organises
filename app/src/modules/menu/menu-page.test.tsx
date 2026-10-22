import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import MenuPage from './menu-page';

/**
 * La page Menu en mode démo (jeu de semis) : la semaine affichée, les deux
 * contenus de repas (recette du foyer et texte libre), la planification via
 * le formulaire et le retrait confirmé.
 */

describe('MenuPage', () => {
  it('affiche les repas semés de la semaine', async () => {
    renderWithProviders(<MenuPage />, { route: '/menu' });

    // La recette du foyer (deux repas semés) et le texte libre du semis.
    expect((await screen.findAllByText('Tartiflette de saison')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Restes du frigo')).toBeInTheDocument();
    // Le panneau porte l'intitulé de semaine (lundi → dimanche).
    expect(screen.getByText(/^Semaine du /)).toBeInTheDocument();
  });

  it('planifie un repas texte libre via le formulaire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MenuPage />, { route: '/menu' });

    await screen.findAllByText('Tartiflette de saison');
    await user.click(screen.getAllByRole('button', { name: /^Planifier Midi du / })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Texte libre' }));
    await user.type(within(dialog).getByLabelText(/^Repas/), 'Pique-nique au parc');
    await user.click(within(dialog).getByRole('button', { name: 'Planifier' }));

    expect(await screen.findByText('Pique-nique au parc')).toBeInTheDocument();
  });

  it('le retrait d\'un repas passe par la confirmation, la recette reste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MenuPage />, { route: '/menu' });

    await screen.findByText('Restes du frigo');
    await user.click(screen.getByRole('button', { name: 'Retirer Restes du frigo du menu' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText(/Restes du frigo/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Retirer' }));

    // Le retrait passe par l'invalidation de la lecture : la ligne disparaît,
    // la recette du foyer reste dans le planning.
    await waitFor(() => expect(screen.queryByText('Restes du frigo')).not.toBeInTheDocument());
    expect(screen.getAllByText('Tartiflette de saison').length).toBeGreaterThanOrEqual(1);
  });
});
