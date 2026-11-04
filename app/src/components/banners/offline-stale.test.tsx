import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { OfflineStaleBanner } from './offline-stale';
import { useBannerStore } from './banner-store';
import { BannerSlot } from './banner-slot';
import { buildQueryClient } from '@/lib/query-policy';

/**
 * Tests du bandeau ambre « dernier état connu » (OFFR-02, UI-SPEC).
 * Ambre = information datée — JAMAIS corail (T-33-17). Non-dismissable
 * (D-13) : pas de bouton, il se retire seul au retour du réseau.
 */
function seedQuery(client: QueryClient, prefix: string, dataUpdatedAt: number) {
  client.setQueryData([prefix, 'foyer-1'], ['donnée']);
  client.getQueryCache().find({ queryKey: [prefix, 'foyer-1'] })?.setState({ dataUpdatedAt });
}

beforeEach(() => {
  onlineManager.setOnline(true);
  useBannerStore.setState({ entries: [], sorted: [] });
});

afterEach(() => {
  onlineManager.setOnline(true);
  useBannerStore.setState({ entries: [], sorted: [] });
});

describe('OfflineStaleBanner', () => {
  it('hors ligne rend « Dernier état connu le … » (role="status", ambre, jamais corail)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    const horodatage = Date.now() - 2 * 60 * 60 * 1000;
    seedQuery(client, 'tasks', horodatage);

    onlineManager.setOnline(false);
    const { container } = render(<OfflineStaleBanner />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    // Le hook a besoin du client — fournison le provider via le même arbre.
    const attendu = format(new Date(horodatage), "d MMM 'à' HH:mm", { locale: fr });
    await waitFor(() => {
      expect(container.textContent).toContain('Dernier état connu le');
    });
    expect(container.textContent).toContain(attendu);
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.className).toContain('bg-amber-soft');
    expect(status?.className).not.toContain('coral');
  });

  it('aucun bouton de dismiss rendu (le bandeau se retire seul, D-13)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    seedQuery(client, 'tasks', Date.now() - 60 * 1000);

    onlineManager.setOnline(false);
    const { container } = render(<OfflineStaleBanner />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Dernier état connu le');
    });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('backstop slot : offline-stale (3) se trie APRÈS sw-update (1) et install (2)', () => {
    const store = useBannerStore.getState();
    store.push({ kind: 'offline-stale', priority: 3 });
    store.push({ kind: 'install', priority: 2 });
    store.push({ kind: 'sw-update', priority: 1 });
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).toEqual([
      'sw-update',
      'install',
      'offline-stale',
    ]);
  });

  it('hors ligne sans donnée Tier 1 : ne rend rien', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    seedQuery(client, 'notes', Date.now() - 60 * 1000); // Tier 2, hors allowlist

    onlineManager.setOnline(false);
    const { container } = render(<OfflineStaleBanner />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).toBeNull();
    });
  });
});
