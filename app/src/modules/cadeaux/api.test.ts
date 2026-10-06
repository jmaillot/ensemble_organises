import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GiftItemRow } from '@/types';
import {
  deleteGiftList,
  fetchCadeauxSnapshot,
  fetchGuestGiftView,
  markGuestReservedItem,
  readGuestName,
  readGuestReservedIds,
  reserveGuestGiftItem,
  writeGuestName,
} from './api';

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

const { mockGetSession } = vi.hoisted(() => {
  const mockGetSession = vi.fn(
    async (): Promise<{ data: { session: { access_token: string } | null } }> => ({ data: { session: null } }),
  );
  return { mockGetSession };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: mockGetSession } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test');
  mockGetSession.mockResolvedValue({ data: { session: null } });
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

const GUEST_CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';

function stubGuestFetch(handler: (body: Record<string, unknown>) => unknown) {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const outcome = handler(body);
      if (outcome instanceof Error) return { ok: false, json: async () => ({ error: outcome.message }) };
      return { ok: true, json: async () => outcome };
    }),
  );
  return seen;
}

const guestHeaders = (seen: Array<{ init: RequestInit }>) =>
  (seen[0]?.init.headers ?? {}) as Record<string, string>;

describe('guest helpers (D-05/D-06/D-07)', () => {
  it('la vue invitée ne porte aucun champ auteur (assertion runtime sur les clés)', async () => {
    stubGuestFetch(() => ({
      listId: 'gift-list-1',
      listName: 'Noël Mamie',
      items: [
        {
          id: 'gift-item-1',
          name: 'Foulard',
          price: 29,
          comment: null,
          reserved: true,
          // Charge indésirable : un serveur futur qui en rendrait trop.
          reserved_by: 'member-thomas',
          reserved_by_name: 'Thomas',
          author: 'member-thomas',
        },
      ],
    }));

    const view = await fetchGuestGiftView(GUEST_CODE);

    expect(view.items).toHaveLength(1);
    for (const item of view.items) {
      // Jamais un test de texte source : on inspecte les clés réellement rendues.
      expect(Object.keys(item).sort()).toEqual(['comment', 'id', 'name', 'price', 'reserved']);
      expect('reserved_by' in item).toBe(false);
      expect('reserved_by_name' in item).toBe(false);
    }
  });

  it('forme publishable sans session : clé publiable seule, sans porteur', async () => {
    const seen = stubGuestFetch(() => ({ listId: 'gift-list-1', listName: 'Noël', items: [] }));

    await fetchGuestGiftView(GUEST_CODE);

    const headers = guestHeaders(seen);
    expect(headers.apikey).toBe('pk_test');
    expect(headers.authorization).toBeUndefined();
  });

  it('avec session : le porteur reste attaché au même appel publishable', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-test' } },
    });
    const seen = stubGuestFetch(() => ({ listId: 'gift-list-1', listName: 'Noël', items: [] }));

    await fetchGuestGiftView(GUEST_CODE);

    expect(guestHeaders(seen).authorization).toBe('Bearer jwt-test');
  });

  it('code incomplet : aucun appel réseau (garde cliente)', async () => {
    const seen = stubGuestFetch(() => ({}));

    await expect(fetchGuestGiftView('court')).rejects.toThrow('22 caractères');
    await expect(reserveGuestGiftItem('court', 'gift-item-1', 'Mamie')).rejects.toThrow('22 caractères');
    expect(seen).toHaveLength(0);
  });

  it('nom vide ou trop long : aucun appel réseau (garde cliente, miroir serveur)', async () => {
    const seen = stubGuestFetch(() => ({}));

    await expect(reserveGuestGiftItem(GUEST_CODE, 'gift-item-1', '   ')).rejects.toThrow('1 à 80');
    await expect(reserveGuestGiftItem(GUEST_CODE, 'gift-item-1', 'x'.repeat(81))).rejects.toThrow('1 à 80');
    expect(seen).toHaveLength(0);
  });

  it('le succès idempotent à nom égal reste un succès', async () => {
    stubGuestFetch(() => ({ itemId: 'gift-item-1', alreadyReserved: true }));

    const outcome = await reserveGuestGiftItem(GUEST_CODE, 'gift-item-1', 'Mamie');

    expect(outcome).toEqual({ itemId: 'gift-item-1', alreadyReserved: true });
  });

  it('oracle, conflit et nom invalide restent trois messages distincts', async () => {
    stubGuestFetch(() => new Error('Ce code est invalide.'));
    await expect(fetchGuestGiftView(GUEST_CODE)).rejects.toThrow('Ce code est invalide.');

    stubGuestFetch(() => new Error('Cet article est déjà réservé.'));
    await expect(reserveGuestGiftItem(GUEST_CODE, 'gift-item-1', 'Papi')).rejects.toThrow('déjà réservé');

    stubGuestFetch(() => new Error('Indiquez un nom (1 à 80 caractères).'));
    await expect(reserveGuestGiftItem(GUEST_CODE, 'gift-item-1', 'Papi')).rejects.toThrow('1 à 80');
  });

  it('la mémoire cosmétique du nom ne lève jamais et ne prouve rien', () => {
    expect(readGuestName(GUEST_CODE)).toBeNull();
    expect(() => writeGuestName(GUEST_CODE, 'Mamie')).not.toThrow();
    expect(() => markGuestReservedItem(GUEST_CODE, 'gift-item-1')).not.toThrow();
    // Environnement sans stockage persistant garanti : la lecture reste sûre.
    expect(readGuestReservedIds(GUEST_CODE)).toEqual(expect.any(Array));
  });
});
