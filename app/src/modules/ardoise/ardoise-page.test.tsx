import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { formatEuro } from '@/lib/utils';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import ArdoisePage from './ardoise-page';

/** Total des quatre dépenses du foyer de démonstration. */
const seedTotal = 84.5 + 62.3 + 8.5 + 34;
/** Thomas : (essence 62,30 − sa part 31,15) + cinéma 34,00 entièrement pour lui − part des courses. */
const seedThomas = 62.3 - 31.15 + 34 - 34 - 28.17;
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

  it('modifier une dépense pré-remplit le dialogue et recalcule les soldes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Modifier la dépense Café du marché' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Modifier la dépense')).toBeInTheDocument();
    // Pré-remplissage : le libellé et le montant de la dépense visée.
    expect(within(dialog).getByLabelText(/Libellé/)).toHaveValue('Café du marché');
    expect(within(dialog).getByLabelText(/Montant/)).toHaveValue(8.5);

    await user.clear(within(dialog).getByLabelText(/Montant/));
    await user.type(within(dialog).getByLabelText(/Montant/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expectAmount('balance-total', seedTotal - 8.5 + 10));
    expect(screen.getByText('Café du marché')).toBeInTheDocument();
  });

  it('le payeur par défaut est le membre courant', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une dépense' })[0]);
    const dialog = await screen.findByRole('dialog');
    // Sans session en test : repli sur le profil courant (Camille).
    expect(within(dialog).getByLabelText(/Payé par/)).toHaveValue(DEMO_MEMBERS.camille);
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

  it('affiche le refus des montants personnalisés négatifs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une dépense' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Libellé/), 'Repas');
    await user.type(within(dialog).getByLabelText(/Montant/), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Options avancées' }));
    await user.selectOptions(within(dialog).getByLabelText(/Type de partage/), 'personnalise');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Camille Martin' }), '-5');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await within(dialog).findByText('Les montants personnalisés doivent être positifs.')).toBeInTheDocument();
    expect(screen.queryByText('Repas')).not.toBeInTheDocument();
  });

  it('refuse une date invalide', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une dépense' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Libellé/), 'Repas');
    await user.type(within(dialog).getByLabelText(/Montant/), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Options avancées' }));
    await user.clear(within(dialog).getByLabelText(/Date/));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await within(dialog).findByText('Indiquez une date valide (AAAA-MM-JJ).')).toBeInTheDocument();
  });
});
