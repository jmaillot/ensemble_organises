import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ArdoisePage from './ardoise-page';

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

  it('ouvre le dialogue rejoindre avec un code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Rejoindre' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/code/i);
  });
});
