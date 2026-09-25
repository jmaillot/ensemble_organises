import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AnniversairesPage from './anniversaires-page';
import { formatMonthLabel } from '@/lib/utils';

const list = () => screen.findByRole('list', { name: 'Liste des anniversaires' });

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('AnniversairesPage', () => {
  it('filtre la liste par prénom et affiche un message si rien ne correspond', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    const rows = await list();
    expect(await within(rows).findByText('Maya Martin')).toBeInTheDocument();
    expect(within(rows).getByText('Paul Durand')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Rechercher un prénom' });
    await user.type(search, 'maya');

    const filtered = await list();
    expect(within(filtered).getByText('Maya Martin')).toBeInTheDocument();
    expect(within(filtered).queryByText('Paul Durand')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(await screen.findByText(/Aucun anniversaire ne correspond/)).toBeInTheDocument();
  });

  it('ajoute un anniversaire via le dialogue et l’affiche dans la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un anniversaire' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Zoé Bernard');
    const birthDate = within(dialog).getByLabelText(/^Date de naissance/);
    await user.type(birthDate, '1995-03-14');
    await user.selectOptions(within(dialog).getByLabelText(/Membre du foyer/), 'member-lina');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’anniversaire/ }));

    const rows = await list();
    const added = await within(rows).findByText('Zoé Bernard');
    // La ligne affiche le compte à rebours, l'âge fêté et la date du 14 mars.
    expect(added.closest('[role="listitem"]')).toHaveTextContent(/Dans \d+ jours · 32 ans/);
    expect(added.closest('[role="listitem"]')).toHaveTextContent('14 mars');
  });

  it('bascule entre la vue liste et la vue calendrier', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getByRole('tab', { name: 'Calendrier' }));

    expect(screen.getByRole('group', { name: 'Calendrier des anniversaires' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: new RegExp(escape(formatMonthLabel(new Date()))) }),
    ).toBeInTheDocument();

    // Maya annivire le 7 octobre : la pastille apparaît au mois suivant.
    const mayaDot = () => screen.queryByRole('button', { name: 'Modifier l’anniversaire de Maya Martin' });
    for (let attempt = 0; attempt < 2 && !mayaDot(); attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }
    await user.click(mayaDot() as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Nom/)).toHaveValue('Maya Martin');
  });
});
