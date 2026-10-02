import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import ArdoiseDetailPage from './ardoise-detail-page';

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/ardoise/:id" element={<ArdoiseDetailPage />} />
    </Routes>,
    { route: '/ardoise/ardoise-foyer' },
  );
}

describe('ArdoiseDetailPage — membres', () => {
  it('ajoute puis retire un membre de l’ardoise', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText('Courses du samedi');

    await user.click(screen.getByRole('button', { name: 'Inviter un membre' }));
    const dialog = await screen.findByRole('dialog', { name: /Membres de/ });
    expect(within(dialog).getByText('Dans l’ardoise (3)')).toBeInTheDocument();
    expect(within(dialog).getByText('Ajouter (1)')).toBeInTheDocument();

    // Maya n'est pas inscrite : ajout.
    const mayaRow = within(dialog).getByText('Maya Martin').closest('li') as HTMLElement;
    await user.click(within(mayaRow).getByRole('button', { name: 'Ajouter' }));
    expect(await within(dialog).findByText('Dans l’ardoise (4)')).toBeInTheDocument();

    // Retrait avec confirmation, historique conservé.
    const mayaRowAfter = within(dialog).getByText('Maya Martin').closest('li') as HTMLElement;
    await user.click(within(mayaRowAfter).getByRole('button', { name: 'Retirer' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText('Retirer « Maya Martin » ?')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Retirer' }));
    expect(await within(dialog).findByText('Dans l’ardoise (3)')).toBeInTheDocument();
    expect(within(dialog).getByText('Ajouter (1)')).toBeInTheDocument();
  });
});
