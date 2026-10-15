import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { ExpenseFormDialog } from './expense-form-dialog';
import { memberKey, type MemberOption, type NewExpenseInput } from '../types';

const members: MemberOption[] = [
  { id: DEMO_MEMBERS.camille, name: 'Camille Martin', colorTag: 'accent', role: 'admin' },
  { id: DEMO_MEMBERS.thomas, name: 'Thomas Martin', colorTag: 'ink', role: 'membre' },
];

function renderDialog(onSubmit: (values: NewExpenseInput) => void) {
  return renderWithProviders(
    <ExpenseFormDialog
      open
      onOpenChange={vi.fn()}
      members={members}
      defaultPayerId={DEMO_MEMBERS.camille}
      onSubmit={onSubmit}
    />,
  );
}

describe('ExpenseFormDialog — payeur libre', () => {
  it('exige un nom pour « Autre personne… »', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Fleurs');
    await user.type(within(dialog).getByLabelText(/Montant/), '15');
    await user.selectOptions(within(dialog).getByLabelText(/Payé par/), 'autre');
    expect(await within(dialog).findByLabelText(/Nom de la personne/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));
    expect(await within(dialog).findByText('Indiquez le nom de la personne.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('transmet le nom libre à résoudre en invité', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Fleurs');
    await user.type(within(dialog).getByLabelText(/Montant/), '15');
    await user.selectOptions(within(dialog).getByLabelText(/Payé par/), 'autre');
    await user.type(await within(dialog).findByLabelText(/Nom de la personne/), 'Mamie');
    expect(within(dialog).getByRole('checkbox', { name: /partage aussi/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ paidByKind: 'guest', payerName: 'Mamie', includePayer: true });
  });

  it('exclut le payeur du partage quand la case est décochée', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Fleurs');
    await user.type(within(dialog).getByLabelText(/Montant/), '15');
    await user.selectOptions(within(dialog).getByLabelText(/Payé par/), 'autre');
    await user.type(await within(dialog).findByLabelText(/Nom de la personne/), 'Mamie');
    await user.click(within(dialog).getByRole('checkbox', { name: /partage aussi/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ payerName: 'Mamie', includePayer: false });
  });
});

/** Ouvre les options avancées et bascule sur « Montants personnalisés ». */
async function openCustomSplit(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'Options avancées' }));
  await user.selectOptions(await within(dialog).findByLabelText(/Type de partage/), 'personnalise');
}

/**
 * WR-06 : le formulaire ne doit plus accepter un partage dont la somme se
 * trompe — l'écart était silencieusement absorbé par le dernier participant,
 * au prix d'une part négative persistée.
 */
describe('ExpenseFormDialog — le partage personnalisé borne sa somme (WR-06)', () => {
  it('refuse une somme supérieure au montant, avec l’écart chiffré', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Courses');
    await user.type(within(dialog).getByLabelText(/Montant/), '10');
    await openCustomSplit(user, dialog);
    await user.type(within(dialog).getByLabelText(/Camille Martin/), '10');
    await user.type(within(dialog).getByLabelText(/Thomas Martin/), '10');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await within(dialog).findByText(/les parts le dépassent de/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('signale le restant à répartir quand la somme est incomplète', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Courses');
    await user.type(within(dialog).getByLabelText(/Montant/), '20');
    await openCustomSplit(user, dialog);
    await user.type(within(dialog).getByLabelText(/Camille Martin/), '12');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await within(dialog).findByText(/il reste/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepte une somme exacte et transmet les parts attendues', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Courses');
    await user.type(within(dialog).getByLabelText(/Montant/), '20');
    await openCustomSplit(user, dialog);
    await user.type(within(dialog).getByLabelText(/Camille Martin/), '12');
    await user.type(within(dialog).getByLabelText(/Thomas Martin/), '8');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: 20,
      splitType: 'personnalise',
      customShares: {
        [memberKey(DEMO_MEMBERS.camille)]: 12,
        [memberKey(DEMO_MEMBERS.thomas)]: 8,
      },
    });
  });

  it('refuse une part négative', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Libellé/), 'Courses');
    await user.type(within(dialog).getByLabelText(/Montant/), '10');
    await openCustomSplit(user, dialog);
    // `fireEvent` : la saisie d'un « − » dans un `input[type=number]` est
    // filtrée par `user-event`, ce qui masquerait le cas testé.
    fireEvent.change(within(dialog).getByLabelText(/Camille Martin/), { target: { value: '-5' } });
    await user.type(within(dialog).getByLabelText(/Thomas Martin/), '15');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));

    expect(await within(dialog).findByText(/doivent être positifs/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
