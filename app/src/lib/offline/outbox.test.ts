import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useMutation } from '@tanstack/react-query';
import { buildQueryClient } from '@/lib/query-policy';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import {
  type OutboxEntry,
  outboxKeyFor,
  setOutboxScopeProvider,
} from './outbox';

/**
 * Preuves de la file d'écriture hors-ligne (phase 34, WRQ-02/WRQ-03).
 *
 * La chaîne exercée est celle de la production : useResource → useMutation
 * marquée `meta { table, operation }` → échec réseau simulé →
 * MutationCache.onError (query-policy.ts) → entrée dans la query
 * `['outbox', userId, householdId]`. Les méthodes de l'adaptateur sont
 * remplacées par des doubles : ce qui est prouvé ici est le chemin CLIENT de
 * l'enfilage, pas le comportement PostgREST (couvert par les suites SQL).
 */

vi.mock('@/lib/data', () => ({
  data: {
    list: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
  },
}));

const SCOPE = { userId: 'user-a', householdId: 'h1' };

/** Client de test : la fabrique réelle (jamais un QueryClient écrit à la main — Test E). */
function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

function outboxEntries(client: QueryClient): OutboxEntry[] {
  return client.getQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId)) ?? [];
}

beforeEach(() => {
  setOutboxScopeProvider(() => SCOPE);
  useHouseholdStore.setState({ householdId: SCOPE.householdId });
});

afterEach(() => {
  onlineManager.setOnline(true);
  setOutboxScopeProvider(null);
  vi.clearAllMocks();
});

describe('enfilage hors-ligne (tracer WRQ-02, D-02)', () => {
  it('enfile un create hors-ligne dans la query outbox, avec id ET client_key distincts', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('shopping_list_items'), { wrapper: wrapperFor(client) });
    await expect(result.current.create({ name: 'Pain', household_id: 'h1' })).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries, 'l’échec réseau doit laisser UNE entrée en file').toHaveLength(1);
    expect(entries[0].table).toBe('shopping_list_items');
    expect(entries[0].operation).toBe('create');
    expect(entries[0].id, 'l’id texte est généré côté client (Pitfall 7)').toBeTruthy();
    expect(entries[0].clientKey, 'la client_key uuid est générée côté client (D-05)').toBeTruthy();
    expect(entries[0].id).not.toBe(entries[0].clientKey);
    expect(entries[0].status).toBe('pending');
    expect(entries[0].values?.name).toBe('Pain');
    expect(entries[0].values?.client_key).toBe(entries[0].clientKey);
  });

  it('le create hors-ligne PEINT la ligne avec l’identité client (overlay optimiste, Pitfall 7)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    // Hors ligne, la lecture aussi échoue (networkMode 'always') : le refetch
    // ne vient pas écraser l'overlay avec un état vide mensonger.
    vi.mocked(data.list).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('shopping_list_items'), { wrapper: wrapperFor(client) });
    await expect(result.current.create({ name: 'Beurre', household_id: 'h1' })).rejects.toThrow('fetch failed');

    const painted = client
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[0] === 'shopping_list_items')?.state.data as Array<Record<string, unknown>>;
    expect(painted, 'la ligne reste peinte pendant la coupure — elle est en file, pas perdue').toHaveLength(1);
    const entries = outboxEntries(client);
    expect(painted[0].id).toBe(entries[0].id);
    expect(painted[0].client_key).toBe(entries[0].clientKey);
  });

  it('une mutation NON marquée ne part jamais en file', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new TypeError('fetch failed');
          },
        }),
      { wrapper: wrapperFor(client) },
    );
    await expect(result.current.mutateAsync(undefined)).rejects.toThrow('fetch failed');

    expect(outboxEntries(client), 'sans meta { table, operation }, l’enfilage ne décide rien').toHaveLength(0);
  });
});
