import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import FidelitePage from './fidelite-page';

describe('Fidélité', () => {
  it('ouvre le code d’une carte en plein écran avec sa valeur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    const card = await screen.findByRole('button', { name: 'Afficher le code de Marché de proximité en plein écran' });
    await user.click(card);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Marché de proximité')).toBeInTheDocument();
    expect(within(dialog).getByText('628411903312')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /fermer/i }).length).toBeGreaterThan(0);
  });

  it('ajoute une carte depuis le dialogue et la retrouve dans la grille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une carte/i }));

    const dialog = await screen.findByRole('dialog', { name: /ajouter une carte/i });
    await user.type(within(dialog).getByLabelText(/nom de la carte/i), 'Pharmacie Verte');
    await user.type(within(dialog).getByLabelText(/^code/i), '99887766');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer la carte/i }));

    expect(await screen.findByRole('button', { name: 'Afficher le code de Pharmacie Verte en plein écran' })).toBeInTheDocument();
    expect(screen.getByText('99887766')).toBeInTheDocument();
  });

  it('explique l’absence de caméra et propose la saisie manuelle', async () => {
    const user = userEvent.setup();
    // jsdom n’expose ni `BarcodeDetector` ni `mediaDevices`.
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /scanner une carte/i }));
    const dialog = await screen.findByRole('dialog', { name: /scanner une carte/i });
    expect(within(dialog).getByText(/caméra non disponible/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/saisissez le code/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /saisir le code à la main/i }));
    expect(await screen.findByLabelText(/nom de la carte/i)).toBeInTheDocument();
  });

  it('supprime une carte après confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' }));
    await user.click(await screen.findByRole('button', { name: /^supprimer$/i }));

    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /supprimer la carte/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' })).toBeNull(),
    );
  });
});
