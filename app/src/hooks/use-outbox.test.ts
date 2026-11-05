import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { buildQueryClient } from '@/lib/query-policy';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { outboxKeyFor, type OutboxEntry } from '@/lib/offline/outbox';
import { useOutbox } from './use-outbox';

/**
 * Preuves de la source unique D-03 : le hook lit la query outbox persistée
 * et en DÉRIVE les comptages (jamais d'état parallèle). La file est
 * ensemencée par setQueryData — exactement le canal par lequel elle est
 * écrite en production (enfilage D-02, rejeu plan 03).
 */

const SCOPE = { userId: 'user-a', householdId: 'h1' };

function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function entry(partial: Pick<OutboxEntry, 'key' | 'status'> & Partial<OutboxEntry>): OutboxEntry {
  return {
    table: 'tasks',
    operation: 'update',
    enqueuedAt: 1,
    ...partial,
  };
}

function seed(client: QueryClient, entries: OutboxEntry[]) {
  client.setQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId), entries);
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function establishSession() {
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: SCOPE.userId, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
  });
  useHouseholdStore.setState({ householdId: SCOPE.householdId });
}

afterEach(() => {
  useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  useHouseholdStore.getState().reset();
});

describe('useOutbox — comptages dérivés de la liste (D-03)', () => {
  it('dérive pendingCount et failedCount d’une file ensemencée (2 pending + 1 failed)', () => {
    establishSession();
    const client = makeClient();
    seed(client, [
      entry({ key: 'tasks:t1', status: 'pending' }),
      entry({ key: 'tasks:t2', status: 'pending' }),
      entry({ key: 'tasks:t3', status: 'failed', failure: { kind: 'terminal', code: '42501', message: 'refus RLS' } }),
    ]);

    const { result } = renderHook(() => useOutbox(), { wrapper: wrapper(client) });

    expect(result.current.entries).toHaveLength(3);
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.failedCount).toBe(1);
  });

  it('rend des comptages nuls sur une file vide — jamais de fetch', async () => {
    establishSession();
    const client = makeClient();

    const { result } = renderHook(() => useOutbox(), { wrapper: wrapper(client) });

    expect(result.current).toEqual({ entries: [], pendingCount: 0, failedCount: 0 });
    // La queryFn ne fetch RIEN : la query résout [] sans jamais passer par le réseau.
    await waitFor(() => {
      const state = client.getQueryState(outboxKeyFor(SCOPE.userId, SCOPE.householdId));
      expect(state?.data).toEqual([]);
      expect(state?.fetchStatus).not.toBe('fetching');
    });
  });

  it('est inactif sans utilisateur ou sans foyer (enabled false) — aucune query outbox créée', () => {
    // Aucune session établie : le hook ne doit ni créer ni peupler la query.
    const client = makeClient();

    const { result } = renderHook(() => useOutbox(), { wrapper: wrapper(client) });

    expect(result.current).toEqual({ entries: [], pendingCount: 0, failedCount: 0 });
    expect(client.getQueryCache().find({ queryKey: ['outbox'] })).toBeUndefined();
  });

  it('suit la portée (userId, householdId) : la file d’un autre couple n’est pas lue', () => {
    establishSession();
    const client = makeClient();
    client.setQueryData<OutboxEntry[]>(outboxKeyFor('user-b', SCOPE.householdId), [
      entry({ key: 'tasks:tx', status: 'pending' }),
    ]);

    const { result } = renderHook(() => useOutbox(), { wrapper: wrapper(client) });

    expect(result.current.entries).toHaveLength(0);
  });
});
