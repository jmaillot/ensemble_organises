import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { data } from '@/lib/data';
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

  it('réaffiche le dernier token actif sans en générer un nouveau', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<ParametresPage />);

    await user.click(screen.getByRole('tab', { name: 'Invitations' }));
    await user.click(screen.getByRole('button', { name: 'Générer un nouveau token' }));
    const token = await screen.findByText(/^[A-Za-z0-9_-]{22}$/);
    const value = token.textContent ?? '';
    expect(value).toHaveLength(22);

    // Rechargement du panneau : le même token revient, sans régénération.
    first.unmount();
    renderWithProviders(<ParametresPage />);
    await user.click(screen.getByRole('tab', { name: 'Invitations' }));
    expect(await screen.findByText(value)).toBeInTheDocument();
  });

  it('n’ouvre aucune action d’invitation pour un membre non administrateur', async () => {    const user = userEvent.setup();
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

  it('renomme un membre depuis le panneau du foyer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParametresPage />);

    await user.click(screen.getByRole('tab', { name: 'Foyer' }));
    await user.click(await screen.findByRole('button', { name: 'Renommer Lina Martin' }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/Prénom et nom/);
    expect(nameInput).toHaveValue('Lina Martin');
    await user.clear(nameInput);
    await user.type(nameInput, 'Lina Dupont');
    await user.click(within(dialog).getByRole('button', { name: 'Renommer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Lina Dupont')).toBeInTheDocument();
  });

  it('change le rôle d’un membre depuis le panneau du foyer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParametresPage />);

    await user.click(screen.getByRole('tab', { name: 'Foyer' }));
    await user.click(await screen.findByRole('button', { name: 'Changer le rôle de Lina Martin' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Rôle/), 'admin');
    await user.click(within(dialog).getByRole('button', { name: 'Changer le rôle' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Deux administrateurs désormais : Camille et Lina.
    expect(screen.getAllByText('Administrateur').length).toBeGreaterThanOrEqual(2);
  });

  it('la sauvegarde du profil propage le nom à la ligne membre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParametresPage />, { route: '/parametres' });

    const nameInput = await screen.findByLabelText(/Prénom et nom/);
    expect(nameInput).toHaveValue('Camille Martin');
    await user.clear(nameInput);
    await user.type(nameInput, 'Camille Dupont');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));

    await waitFor(() => expect(screen.getByText(/Profil enregistré/)).toBeInTheDocument());
    // Le store suit pour les avatars et la barre supérieure…
    expect(useHouseholdStore.getState().members.find((member) => member.id === DEMO_MEMBERS.camille)?.display_name).toBe(
      'Camille Dupont',
    );
    // …et la ligne membre est écrite, pas seulement le profil.
    const rows = await data.list('household_members', { id: DEMO_MEMBERS.camille });
    expect(rows[0]?.display_name).toBe('Camille Dupont');
  });
});
