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

  it('propose le déplacement vers Famille sur ses propres contacts personnels, jamais sur Famille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    // Liste Famille par défaut : aucun bouton de déplacement.
    await within(await list()).findByText('Maya Martin');
    expect(screen.queryByRole('button', { name: /Déplacer la fiche/ })).not.toBeInTheDocument();

    // Liste personnelle du membre connecté : le bouton est proposé.
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    const rows = await list();
    expect(await within(rows).findByText('Camille Martin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }),
    ).toBeInTheDocument();
  });

  it('la modale annonce le partage au foyer, l’annulation ne déplace rien', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    await within(await list()).findByText('Camille Martin');
    await user.click(screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }));

    // Copie de confirmation (D-04) : l'issue est dite avant de confirmer.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Déplacer « Camille Martin » vers Famille ?')).toBeInTheDocument();
    expect(within(dialog).getByText(/visible par tout le foyer/)).toBeInTheDocument();
    expect(within(dialog).getByText(/anniversaire sera partagé/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Annulation sans effet : la fiche reste personnelle, absente de Famille.
    await user.click(within(chips).getByRole('button', { name: /Famille/ }));
    expect(screen.queryByText('Camille Martin')).not.toBeInTheDocument();
  });

  it('confirmer déplace la fiche vers Famille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    await within(await list()).findByText('Camille Martin');
    await user.click(screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer vers Famille' }));

    // La fiche rejoint la liste partagée…
    await user.click(within(chips).getByRole('button', { name: /Famille/ }));
    expect(await within(await list()).findByText('Camille Martin')).toBeInTheDocument();
    // …et le bouton de déplacement disparaît avec elle.
    expect(screen.queryByRole('button', { name: /Déplacer la fiche/ })).not.toBeInTheDocument();
  });
});
