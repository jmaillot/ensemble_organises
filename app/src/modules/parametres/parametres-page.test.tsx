import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import ParametresPage from './parametres-page';

describe('Paramètres du foyer', () => {
  it('réserve les invitations à l’administrateur du foyer de démonstration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParametresPage />);

    await user.click(screen.getByRole('tab', { name: 'Invitations' }));
    expect(screen.getByRole('button', { name: 'Générer un nouveau token' })).toBeInTheDocument();
    expect(screen.getByText(/Générer un nouveau token invalide le précédent/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Générer un nouveau token' }));

    const token = await screen.findByText(/^[A-Za-z0-9_-]{22}$/);
    expect(token.textContent).toHaveLength(22);
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'QR' }));
    expect(await screen.findByRole('img', { name: 'QR code du token d’invitation' })).toBeInTheDocument();
  });

  it('n’ouvre aucune action d’invitation pour un membre non administrateur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParametresPage />, { withHousehold: false });
    useHouseholdStore.setState({
      currentMemberId: DEMO_MEMBERS.lina,
      members: [
        { id: DEMO_MEMBERS.camille, household_id: 'household-martin', user_id: null, display_name: 'Camille Martin', avatar_url: null, color_tag: 'accent', role: 'admin', created_at: new Date().toISOString() },
        { id: DEMO_MEMBERS.lina, household_id: 'household-martin', user_id: null, display_name: 'Lina Martin', avatar_url: null, color_tag: 'coral', role: 'membre', created_at: new Date().toISOString() },
      ],
    });

    await user.click(screen.getByRole('tab', { name: 'Invitations' }));
    expect(screen.queryByRole('button', { name: 'Générer un nouveau token' })).not.toBeInTheDocument();
    expect(screen.getByText(/Seul un administrateur/)).toBeInTheDocument();
  });
});
