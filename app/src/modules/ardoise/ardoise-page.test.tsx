import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { formatEuro } from '@/lib/utils';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import ArdoisePage from './ardoise-page';

/** Total des quatre dépenses du foyer de démonstration. */
const seedTotal = 84.5 + 62.3 + 8.5 + 34;
/** Thomas : (essence 62,30 − sa part 31,15) + (cinéma 34,00 − sa part 17,00) − part des courses. */
const seedThomas = 62.3 - 31.15 + 34 - 17 - 28.17;
/** Camille : courses 84,50 − sa part 28,17 − part de l'essence. */
const seedCamille = 84.5 - 28.17 - 31.15;


/** `formatEuro` insère une espace insécable : on la normalise avant de comparer. */
const plain = (value: string) => value.replace(/ /g, ' ');

const expectAmount = (testId: string, amount: number) =>
  expect(plain(screen.getByTestId(testId).textContent ?? '')).toContain(plain(formatEuro(amount)));
const balanceOf = (memberId: string) => `balance-row-membre:${memberId}`;

describe('ArdoisePage', () => {
  it('ajouter une dépense met à jour le total et la ligne « Qui doit quoi ? »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    expect(await screen.findByText('Courses du samedi')).toBeInTheDocument();
    expectAmount('balance-total', seedTotal);
    expectAmount(balanceOf(DEMO_MEMBERS.thomas), seedThomas);

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une dépense' })[0]);
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Pizza du soir');
    await user.type(within(dialog).getByLabelText(/Montant/), '20');
    // Partage limité à Camille et Thomas pour rendre le résultat déterministe.
    await user.click(within(dialog).getByRole('checkbox', { name: /Lina/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Maya/ }));

    expect(plain(within(dialog).getByText(/par personne/).textContent ?? '')).toContain('10,00');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await screen.findByText('Pizza du soir')).toBeInTheDocument();
    await waitFor(() => expectAmount('balance-total', seedTotal + 20));
    // Camille avance 20 €, Thomas n'en reprend que 10 €.
    expectAmount(balanceOf(DEMO_MEMBERS.thomas), seedThomas - 10);
    expectAmount(balanceOf(DEMO_MEMBERS.camille), seedCamille + 20 - 10);
  });

  it('supprimer une dépense demande confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Supprimer la dépense Café du marché' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText('Supprimer « Café du marché »')).toBeInTheDocument();

    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Café du marché')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer la dépense Café du marché' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(screen.queryByText('Café du marché')).not.toBeInTheDocument());
    await waitFor(() => expectAmount('balance-total', seedTotal - 8.5));
  });
});
