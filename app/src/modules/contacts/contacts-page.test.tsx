import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ContactsPage from './contacts-page';

const list = () => screen.findByRole('list', { name: 'Liste des contacts' });

describe('ContactsPage', () => {
  it('affiche les chips de listes et les fiches avec date au format JJ/MM/AAAA', async () => {
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const rows = await list();
    expect(await within(rows).findByText('Maya Martin')).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    expect(within(chips).getByRole('button', { name: /Famille/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /Camille/ })).toBeInTheDocument();

    // La date de naissance s'affiche en JJ/MM/AAAA (D-02).
    expect(within(rows).getByText(/Né\(e\) le 07\/10\/1992/)).toBeInTheDocument();
  });

  it('avertit d’un doublon probable sans bloquer la soumission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un contact' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Maya Martin');
    await user.type(within(dialog).getByLabelText(/Date de naissance/), '07/10/1992');

    // L'alerte D-04 est non bloquante : elle s'affiche, la soumission reste permise.
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/Doublon probable/);
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    const rows = await list();
    expect(await within(rows).findAllByText('Maya Martin')).toHaveLength(2);
  });
});
