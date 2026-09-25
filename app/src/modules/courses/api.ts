import { data } from '@/lib/data';
import type { ShoppingListItemRow, ShoppingListRow } from '@/types';
import { normalizeRayon, type ShoppingItemInput, type ShoppingListInput } from './types';

export const SHOPPING_LISTS_TABLE = 'shopping_lists';
export const SHOPPING_ITEMS_TABLE = 'shopping_list_items';

/**
 * Écritures du module. Les lectures passent par `useResource`
 * (`src/lib/data/useResource.ts`), qui filtre sur le foyer courant, gère le
 * cache et l'invalidation ; seules les écritures propres au domaine sont ici.
 * `household_id` est renseigné explicitement : la RLS reste la seule barrière
 * d'autorisation côté serveur.
 */

export async function createShoppingList(input: ShoppingListInput): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>(SHOPPING_LISTS_TABLE, {
    household_id: input.householdId,
    name: input.name.trim(),
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
  });
}

export async function renameShoppingList(id: string, name: string): Promise<ShoppingListRow> {
  return data.update<ShoppingListRow>(SHOPPING_LISTS_TABLE, id, { name: name.trim() });
}

/** Supprime une liste puis ses articles : les deux écritures sont liées. */
export async function deleteShoppingList(id: string, householdId: string): Promise<void> {
  const items = await data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: householdId,
    list_id: id,
  });
  await Promise.all(items.map((item) => data.remove(SHOPPING_ITEMS_TABLE, item.id)));
  await data.remove(SHOPPING_LISTS_TABLE, id);
}

export async function createShoppingItem(input: ShoppingItemInput): Promise<ShoppingListItemRow> {
  return data.create<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: input.householdId,
    list_id: input.listId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    category: normalizeRayon(input.rayon),
    checked: false,
    added_by: input.addedBy,
    created_at: new Date().toISOString(),
  });
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await data.remove(SHOPPING_ITEMS_TABLE, id);
}
