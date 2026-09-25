import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CadeauxPage from './cadeaux-page';

describe('CadeauxPage', () => {
  it('signale la liste privée et partage une idée, qui passe en « Gérer »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille.
    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    expect(screen.getByText('Liste privée')).toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Le partage porte sur toute la liste/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /Lina Martin/ }));
    await user.selectOptions(within(dialog).getByLabelText('Permission pour Lina Martin'), 'reservation');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    // Le partage porte sur la liste : les deux idées passent en « Gérer ».
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Gérer' })).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });

  it('cache les réservations des autres pour le propriétaire de la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(await screen.findByRole('button', { name: 'Anniversaire de Noé' }));

    // « Casque pour le vélo » est réservé par Thomas : le propriétaire ne le voit pas.
    expect(screen.getByText('Casque pour le vélo')).toBeInTheDocument();
    expect(screen.queryByText(/Réservé par/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Acheté')).not.toBeInTheDocument();
  });
});
