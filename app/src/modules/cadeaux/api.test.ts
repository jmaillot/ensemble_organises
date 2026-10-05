import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GiftItemRow } from '@/types';
import { deleteGiftList, fetchCadeauxSnapshot } from './api';

const { calls, mockList, mockRemove, viewRows } = vi.hoisted(() => {
  const calls: Array<{ table: string; filter: Record<string, unknown> }> = [];
  // Ce que la vue `gift_items_for_list` (0080) rendrait côté serveur :
  // `reserved_by` déjà NULL pour la liste possédée, intact sinon.
  const viewRows = [
    {
      id: 'gift-view-1',
      list_id: 'list-owned',
      household_id: 'hh-1',
      name: 'Casque vélo',
      price: 89,
      comment: null,
      photo_url: null,
      url: null,
      reserved_by: null,
      purchased: false,
      idea_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'gift-view-2',
      list_id: 'list-shared',
      household_id: 'hh-1',
      name: 'Livre jardins',
      price: 24,
      comment: null,
      photo_url: null,
      url: null,
      reserved_by: 'member-thomas',
      purchased: false,
      idea_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  const mockList = vi.fn(async (table: string, filter: Record<string, unknown> = {}) => {
    calls.push({ table, filter });
    if (table !== 'gift_items_for_list') return [];
    return viewRows.filter((row) =>
      Object.entries(filter).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
    );
  });
  const mockRemove = vi.fn(async () => {});
  return { calls, mockList, mockRemove, viewRows };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { list: mockList, remove: mockRemove } };
});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('fetchCadeauxSnapshot (WR-03)', () => {
  it('lit les articles via la vue masquée gift_items_for_list, jamais la table brute', async () => {
    const snapshot = await fetchCadeauxSnapshot('hh-1');

    expect(mockList).toHaveBeenCalledWith('gift_items_for_list', { household_id: 'hh-1' });
    expect(calls.some((call) => call.table === 'gift_items')).toBe(false);
    expect(snapshot.items).toHaveLength(viewRows.length);
  });

  it('le propriétaire voit reserved_by null au niveau API, pas seulement en JSX', async () => {
    const snapshot = await fetchCadeauxSnapshot('hh-1');

    const owned = snapshot.items.find((item: GiftItemRow) => item.list_id === 'list-owned');
    expect(owned?.reserved_by).toBeNull();
  });

  it('la réservation reste visible hors liste possédée (pas de régression)', async () => {
    const snapshot = await fetchCadeauxSnapshot('hh-1');

    const shared = snapshot.items.find((item: GiftItemRow) => item.list_id === 'list-shared');
    expect(shared?.reserved_by).toBe('member-thomas');
  });
});

describe('deleteGiftList (WR-03)', () => {
  it('énumère via la vue mais supprime sur la table brute', async () => {
    await deleteGiftList('list-owned');

    expect(mockList).toHaveBeenCalledWith('gift_items_for_list', { list_id: 'list-owned' });
    expect(mockRemove).toHaveBeenCalledWith('gift_items', 'gift-view-1');
    expect(mockRemove).not.toHaveBeenCalledWith('gift_items', 'gift-view-2');
    expect(mockRemove).toHaveBeenCalledWith('gift_lists', 'list-owned');
  });
});
