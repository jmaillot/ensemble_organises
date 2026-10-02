import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { ExpenseFormDialog } from './expense-form-dialog';
import type { MemberOption, NewExpenseInput } from '../types';

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
