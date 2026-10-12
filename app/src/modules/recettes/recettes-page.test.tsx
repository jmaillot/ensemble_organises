import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RecettesPage from './recettes-page';

describe('Module Recettes', () => {
  it('affiche l’état vide « bientôt disponible »', async () => {
    renderWithProviders(<RecettesPage />);

    expect(await screen.findByText('Les recettes arrivent bientôt.')).toBeInTheDocument();
    expect(
      screen.getByText(/enregistrer vos recettes, les ingrédients et les préférences de chaque membre/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Ce que le module apportera')).toBeInTheDocument();
  });

  it('liste les recettes déjà enregistrées avec leur état', async () => {
    renderWithProviders(<RecettesPage />);

    expect(await screen.findByText('Tartiflette de saison')).toBeInTheDocument();
    expect(screen.getAllByText('Déjà enregistrée').length).toBeGreaterThan(0);
  });

  it('déclenche un toast depuis l’action « Me tenir informée »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecettesPage />);

    const boutons = await screen.findAllByRole('button', { name: 'Me tenir informée' });
    await user.click(boutons[0]!);

    await waitFor(() => {
      expect(
        screen.getByText('C’est noté, nous vous préviendrons dès l’ouverture des recettes.'),
      ).toBeInTheDocument();
    });
  });
});
