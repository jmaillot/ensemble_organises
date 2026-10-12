import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import ArdoisePage from './ardoise-page';
import ArdoiseDetailPage from './ardoise-detail-page';

describe('ArdoisePage — liste', () => {
  it('affiche les ardoises du foyer de démonstration', async () => {
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    expect(await screen.findByText('Ardoise du foyer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer une ardoise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeInTheDocument();
  });

  it('crée une ardoise depuis le dialogue', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end ski');
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end ski')).toBeInTheDocument();
  });

  it('propose une photo de couverture optionnelle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Photo de couverture/)).toBeInTheDocument();
    // Optionnelle : la création reste possible sans photo.
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end sans photo');
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end sans photo')).toBeInTheDocument();
  });

  it('crée une ardoise avec une sélection de membres', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/ardoise" element={<ArdoisePage />} />
        <Route path="/ardoise/:id" element={<ArdoiseDetailPage />} />
      </Routes>,
      { route: '/ardoise' },
    );

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end restreint');
    // Thomas exclu : tout le monde est coché par défaut.
    await user.click(within(dialog).getByRole('checkbox', { name: /Thomas/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end restreint')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Inviter un membre' }));
    const membersDialog = await screen.findByRole('dialog', { name: /Membres de/ });
    expect(within(membersDialog).getByText('Dans l’ardoise (3)')).toBeInTheDocument();
    expect(within(membersDialog).getByText('Ajouter (1)')).toBeInTheDocument();
  });

  it('affiche la photo de couverture en fond dans la liste', async () => {
    const { updateArdoise } = await import('./api');
    await updateArdoise('ardoise-foyer', { cover_url: 'https://exemple.fr/cover.jpg' });
    try {
      const { container } = renderWithProviders(<ArdoisePage />, { route: '/ardoise' });
      await screen.findByText('Ardoise du foyer');
      const photo = container.querySelector('img[src="https://exemple.fr/cover.jpg"]');
      expect(photo).not.toBeNull();
    } finally {
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });

  it('ouvre le dialogue rejoindre avec un code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Rejoindre' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/code/i);
  });
});
