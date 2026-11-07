import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { buildQueryClient } from '@/lib/query-policy';
import { BannerSlot } from '@/components/banners/banner-slot';
import { useBannerStore } from '@/components/banners/banner-store';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { outboxKeyFor, type OutboxEntry } from '@/lib/offline/outbox';
import { OUTBOX_BANNER_KIND, OutboxBadgeWatcher } from './use-outbox-replay-badge';

/**
 * Preuves du badge « N en attente » / « N bloquées » (WRQ-05). La file est
 * ensemencée par setQueryData — le canal réel d'enfilage/rejeu ; le badge est
 * observé dans le banner-store et dans le rendu du slot. Le toast D-12 a été
 * retiré (phase 36, D-03) : le badge est l'unique signal actif.
 */

const SCOPE = { userId: 'user-a', householdId: 'h1' };

const navigateSpy = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigateSpy,
}));

function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function entry(status: OutboxEntry['status'], key = 'tasks:t1'): OutboxEntry {
  return {
    key,
    table: 'tasks',
    operation: 'update',
    enqueuedAt: 1,
    status,
    ...(status === 'failed' ? { failure: { kind: 'terminal' as const, code: '42501', message: 'refus RLS' } } : {}),
  };
}

function seed(client: QueryClient, entries: OutboxEntry[]) {
  act(() => {
    client.setQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId), entries);
    // notifyManager diffuse les notifications d'observateurs via setTimeout :
    // sous vi.useFakeTimers, un micro-tick doit être consommé pour qu'elles
    // atteignent l'observateur déjà monté.
    vi.advanceTimersByTime(0);
  });
}

function App({ client }: { client: QueryClient }) {
  return createElement(
    QueryClientProvider,
    { client },
    createElement(OutboxBadgeWatcher),
    createElement(BannerSlot),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  navigateSpy.mockReset();
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: SCOPE.userId, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
  });
  useHouseholdStore.setState({ householdId: SCOPE.householdId });
  useBannerStore.getState().dismiss(OUTBOX_BANNER_KIND);
});

afterEach(() => {
  onlineManager.setOnline(true);
  useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  useHouseholdStore.getState().reset();
  useBannerStore.getState().dismiss(OUTBOX_BANNER_KIND);
  vi.useRealTimers();
});

describe('badge outbox — visibilité (D-13)', () => {
  it('est poussé à l’enfilage et porté par le slot (« 2 écritures en attente »)', () => {
    const client = makeClient();
    render(createElement(App, { client }));

    seed(client, [entry('pending', 'tasks:t1'), entry('pending', 'tasks:t2')]);

    const pushed = useBannerStore.getState().entries.find((e) => e.kind === OUTBOX_BANNER_KIND);
    expect(pushed).toBeDefined();
    expect(pushed?.payload).toEqual({ pending: 2, failed: 0 });
    expect(screen.getByText(/2 écritures en attente/)).toBeTruthy();
  });

  it('reste visible HORS LIGNE — même visibilité online/offline (D-13)', () => {
    const client = makeClient();
    render(createElement(App, { client }));

    act(() => onlineManager.setOnline(false));
    seed(client, [entry('pending', 'tasks:t1')]);

    expect(useBannerStore.getState().entries.find((e) => e.kind === OUTBOX_BANNER_KIND)).toBeDefined();
    expect(screen.getByText(/1 écriture en attente/)).toBeTruthy();
  });

  it('est dismissé quand la file retombe à zéro', () => {
    const client = makeClient();
    render(createElement(App, { client }));

    seed(client, [entry('pending', 'tasks:t1')]);
    seed(client, []); // rejeu complet

    expect(useBannerStore.getState().entries.find((e) => e.kind === OUTBOX_BANNER_KIND)).toBeUndefined();
    expect(screen.queryByText('1 écriture en attente')).toBeNull();
  });
});

describe('badge outbox — écritures bloquées (D-11)', () => {
  it('devient « N bloquées » cliquable vers Paramètres quand un échec terminal existe', () => {
    const client = makeClient();
    render(createElement(App, { client }));

    seed(client, [entry('failed', 'tasks:t1')]);

    expect(screen.getByText('1 écriture bloquée')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les détails' }));
    expect(navigateSpy).toHaveBeenCalledWith('/parametres');
  });
});
