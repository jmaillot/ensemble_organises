import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('ItemFormDialog — rayon suggéré', () => {
  it('devine le rayon depuis le nom tant que non touché', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const rayon = within(dialog).getByLabelText(/Rayon/) as HTMLSelectElement;

    expect(rayon.value).toBe('Divers');
    await user.type(within(dialog).getByLabelText(/Article/), 'Lait demi-écrémé');
    expect(rayon.value).toBe('Crèmerie & Produits laitiers');
  });

  it('le choix manuel n’est plus écrasé par la frappe', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Article/), 'Lait');
    await user.selectOptions(within(dialog).getByLabelText(/Rayon/), 'Boissons');
    await user.type(within(dialog).getByLabelText(/Article/), ' en poudre');
    expect((within(dialog).getByLabelText(/Rayon/) as HTMLSelectElement).value).toBe('Boissons');
  });
});

describe('ItemFormDialog — édition', () => {
  it('pré-remplit, masque la liste et enregistre', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <ItemFormDialog
        open
        onOpenChange={() => undefined}
        lists={[list]}
        currentMemberName="Camille"
        onSubmit={onSubmit}
        initialItem={{
          id: 'item-1',
          listId: 'list-fresque',
          householdId: 'household-demo',
          name: 'Savon',
          quantity: null,
          unit: null,
          rayon: 'Divers',
          checked: false,
          addedBy: null,
          createdAt: new Date().toISOString(),
        }}
      />,
    );
    const dialog = await screen.findByRole('dialog');

    expect(screen.getByRole('heading', { name: 'Modifier l’article' })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Liste/)).not.toBeInTheDocument();
    expect((within(dialog).getByLabelText(/Article/) as HTMLInputElement).value).toBe('Savon');

    await user.selectOptions(within(dialog).getByLabelText(/Rayon/), 'Hygiène & Beauté');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Savon', rayon: 'Hygiène & Beauté' });
  });
});

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

  it('joint la référence OFF au submit pour la fiche catalogue', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <ItemFormDialog open onOpenChange={() => undefined} lists={[list]} currentMemberName="Camille" onSubmit={onSubmit} />,
    );
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Article/), 'Comté');
    await user.click(within(dialog).getByRole('button', { name: 'Rechercher photo et rayon' }));
    await user.click(await within(dialog).findByRole('button', { name: /Comté affiné/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Comté', off: { ean: '2487332034183' } });
  });

  it('retoucher le nom après le choix rompt le lien catalogue', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <ItemFormDialog open onOpenChange={() => undefined} lists={[list]} currentMemberName="Camille" onSubmit={onSubmit} />,
    );
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Article/), 'Comté');
    await user.click(within(dialog).getByRole('button', { name: 'Rechercher photo et rayon' }));
    await user.click(await within(dialog).findByRole('button', { name: /Comté affiné/ }));
    await user.type(within(dialog).getByLabelText(/Article/), ' râpé');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Comté râpé', off: null });
  });
});
