import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OFFLINE_WRITE_REFUSED_MESSAGE } from '@/lib/data/write-policy';
import { DataError } from '@/lib/data';
import type { ShoppingListItemRow } from '@/types';

/**
 * WR-04 : `deleteShoppingList` doit tenter la suppression de la LISTE
 * D'ABORD. Hors ligne, la liste est refusée par la garde D-07
 * (`shopping_lists` hors liste blanche) : si les articles partaient avant,
 * ils s'enfileraient dans l'outbox pendant que la liste reste — une moitié
 * de suppression qui s'applique en silence au rejeu, sans que l'écran le
 * confirme (liste fantôme vide).
 *
 * Le harnais `courses-offline-writes.test.tsx` ne peut pas porter cette
 * preuve : son faux client ne simule pas les DELETE (op ignoré). Ici
 * l'adaptateur est mocké, seul l'ORDRE compte.
 */

const HOISTED = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/data', () => ({
  data: { list: HOISTED.list, remove: HOISTED.remove },
  DataError: class DataError extends Error {},
}));

const { deleteShoppingList } = await import('./api');

const ITEMS: ShoppingListItemRow[] = [
  { id: 'item-1', list_id: 'l1', name: 'Beurre' },
  { id: 'item-2', list_id: 'l1', name: 'Pain' },
] as unknown as ShoppingListItemRow[];

beforeEach(() => {
  HOISTED.list.mockReset();
  HOISTED.remove.mockReset();
});

describe('deleteShoppingList — ordre liste d’abord (WR-04)', () => {
  it('hors ligne : le refus D-07 de la liste précède tout enfilage d’articles', async () => {
    HOISTED.list.mockResolvedValue(ITEMS);
    HOISTED.remove.mockImplementation((table: string) => {
      if (table === 'shopping_lists') {
        return Promise.reject(new DataError(OFFLINE_WRITE_REFUSED_MESSAGE));
      }
      return Promise.resolve();
    });
    const removeItem = vi.fn().mockResolvedValue(undefined);

    await expect(deleteShoppingList('l1', 'h1', removeItem)).rejects.toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);

    // LE point du correctif : aucun article n'a été touché — rien n'est
    // parti en file derrière un refus de liste.
    expect(removeItem).not.toHaveBeenCalled();
    expect(HOISTED.remove.mock.calls.map((call) => call[0])).toEqual(['shopping_lists']);
  });

  it('en ligne : la liste part, puis les articles via le mutateur Tier 1', async () => {
    HOISTED.list.mockResolvedValue(ITEMS);
    HOISTED.remove.mockResolvedValue(undefined);
    const removeItem = vi.fn().mockResolvedValue(undefined);

    await expect(deleteShoppingList('l1', 'h1', removeItem)).resolves.toBeUndefined();

    expect(removeItem).toHaveBeenCalledTimes(2);
    expect(HOISTED.remove).toHaveBeenCalledWith('shopping_lists', 'l1');
  });
});
