import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { buildQueryClient } from '@/lib/query-policy';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { outboxKeyFor, type OutboxEntry } from '@/lib/offline/outbox';
import { useOutboxGate } from './use-outbox-gate';

/**
 * Test du BRANCHEMENT de la gate (phase 34, D-03) — l'ancien test du stub
 * 32-D10 devient la preuve que la signature `{ isEmpty: boolean }` est
 * inchangée et que la gate lit la vraie file via la source unique `useOutbox`.
 * AUCUN consommateur de la phase 32 (update-banner, offline-panel) n'a été
 * modifié : le contrat de frontière 32-D10 est tenu.
 */

const SCOPE = { userId: 'user-a', householdId: 'h1' };

function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

afterEach(() => {
  useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  useHouseholdStore.getState().reset();
});

describe('useOutboxGate — branchée sur la vraie file (contrat 32-D10 inchangé)', () => {
  it('expose toujours la signature { isEmpty: boolean }', () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: SCOPE.userId, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
    });
    useHouseholdStore.setState({ householdId: SCOPE.householdId });
    const client = makeClient();

    const { result } = renderHook(() => useOutboxGate(), { wrapper: wrapper(client) });

    expect(Object.keys(result.current)).toEqual(['isEmpty']);
    expect(typeof result.current.isEmpty).toBe('boolean');
  });

  it('passe à isEmpty false dès qu’une écriture pending existe', () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: SCOPE.userId, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
    });
    useHouseholdStore.setState({ householdId: SCOPE.householdId });
    const client = makeClient();
    client.setQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId), [
      { key: 'tasks:t1', table: 'tasks', operation: 'update', enqueuedAt: 1, status: 'pending' },
    ]);

    const { result } = renderHook(() => useOutboxGate(), { wrapper: wrapper(client) });

    expect(result.current).toEqual({ isEmpty: false });
  });

  it('reste vide sans session — le stub de la phase 32 rendait true, le branchement rend true aussi', () => {
    const client = makeClient();

    const { result } = renderHook(() => useOutboxGate(), { wrapper: wrapper(client) });

    expect(result.current).toEqual({ isEmpty: true });
  });
});
