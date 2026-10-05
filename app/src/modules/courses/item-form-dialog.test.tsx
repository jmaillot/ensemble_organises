import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { ItemFormDialog } from './components/item-form-dialog';
import { offHandlers } from '@/test/mocks/off-handlers';
import type { ShoppingListView } from './types';

const server = setupServer(...offHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const list: ShoppingListView = {
  id: 'list-fresque',
  householdId: 'household-demo',
  name: 'Fresque',
  createdBy: null,
  createdAt: new Date().toISOString(),
  items: [],
  checkedCount: 0,
  pendingCount: 0,
};

function renderDialog() {
  return renderWithProviders(
    <ItemFormDialog
      open
      onOpenChange={() => undefined}
      lists={[list]}
      currentMemberName="Camille"
      onSubmit={() => undefined}
    />,
  );
}

describe('ItemFormDialog — recherche Open Food Facts', () => {
  it('remplit le rayon et montre la photo depuis un résultat', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Article/), 'Comté');
    await user.click(within(dialog).getByRole('button', { name: 'Rechercher photo et rayon' }));

    const hit = await within(dialog).findByRole('button', { name: /Comté affiné/ });
    await user.click(hit);

    expect((within(dialog).getByLabelText(/Rayon/) as HTMLSelectElement).value).not.toBe('Divers');
    expect(await within(dialog).findByText(/non enregistrée/)).toBeInTheDocument();
  });

  it('sans résultat : invite à créer manuellement', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Article/), 'Xyzintrouvable');
    await user.click(within(dialog).getByRole('button', { name: 'Rechercher photo et rayon' }));

    expect(await within(dialog).findByText(/Aucun résultat/)).toBeInTheDocument();
  });
});
