import { describe, expect, it } from 'vitest';
import { toShoppingPrintModel, type ShoppingItem, type ShoppingListView } from './types';

const item = (over: Partial<ShoppingItem> & { name: string }): ShoppingItem => ({
  id: over.name,
  listId: 'list-1',
  householdId: 'house-1',
  quantity: null,
  unit: null,
  rayon: 'Divers',
  checked: false,
  addedBy: null,
  createdAt: '2026-10-21T09:00:00.000Z',
  ...over,
});

const list = (items: ShoppingItem[]): ShoppingListView => ({
  id: 'list-1',
  householdId: 'house-1',
  name: 'Courses du samedi',
  createdBy: null,
  createdAt: '2026-10-21T09:00:00.000Z',
  items,
  checkedCount: items.filter((entry) => entry.checked).length,
  pendingCount: items.filter((entry) => !entry.checked).length,
});

describe('toShoppingPrintModel', () => {
  it('range toujours par rayon, dans l’ordre du magasin, et compte ce qui reste', () => {
    const model = toShoppingPrintModel(
      list([
        item({ name: 'Savon', rayon: 'Hygiène & Beauté' }),
        item({ name: 'Pommes', rayon: 'Fruits & légumes', quantity: 6, unit: 'pièces' }),
        item({ name: 'Yaourts', rayon: 'Crèmerie & Produits laitiers', checked: true }),
      ]),
      'Foyer Martin',
    );

    expect(model.title).toBe('Courses du samedi');
    expect(model.meta).toBe('Foyer Martin · 2 à acheter sur 3');
    // Fruits avant Crèmerie, Crèmerie avant Hygiène : l'ordre de RAYONS, pas
    // celui de la saisie.
    expect(model.sections.map((section) => section.title)).toEqual([
      'Crèmerie & Produits laitiers',
      'Fruits & légumes',
      'Hygiène & Beauté',
    ]);
    expect(model.sections[1].items[0]).toEqual({ name: 'Pommes', quantity: '6 pièces', checked: false });
    expect(model.sections[0].items[0]).toEqual({ name: 'Yaourts', quantity: '', checked: true });
  });

  it('garde un article sans quantité comme une ligne sans nombre', () => {
    const model = toShoppingPrintModel(list([item({ name: 'Sel', rayon: 'Épicerie salée' })]), 'Foyer Martin');
    expect(model.sections[0].items[0].quantity).toBe('');
  });

  it('rend une feuille vide pour une liste vide', () => {
    const model = toShoppingPrintModel(list([]), 'Foyer Martin');
    expect(model.sections).toEqual([]);
    expect(model.meta).toBe('Foyer Martin · 0 à acheter sur 0');
  });
});
