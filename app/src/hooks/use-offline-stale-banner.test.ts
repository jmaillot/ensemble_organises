import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useOfflineStaleBanner } from './use-offline-stale-banner';
import { useBannerStore } from '@/components/banners/banner-store';
import { buildQueryClient } from '@/lib/query-policy';
import type { QueryClient } from '@tanstack/react-query';

type TestClient = QueryClient;

/**
 * Client de test avec gcTime par défaut (politique réelle) : `gcTime: 0` du
 * harnais collecterait les queries semées pendant le test et ferait
 * disparaître le bandeau (le MIN tomberait à 0 après la GC).
 */
function createClient(): TestClient {
  return buildQueryClient({ queries: { retry: false } });
}

/**
 * Tests du hook useOfflineStaleBanner (OFFR-02, D-12, D-13).
 *
 * Le MIN doit être le PLUS PRUDENT : MIN des dataUpdatedAt de toutes les
 * queries Tier 1 rendues, annexes household_members/profiles COMPRISES
 * (D-12 lettre, D-10). Hors ligne uniquement (D-13). Un seul bandeau,
 * dédupliqué par kind dans banner-store.
 */

function wrapperFor(client: TestClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Pose une query Tier 1 dans le cache avec un dataUpdatedAt imposé. */
function seedQuery(
  client: TestClient,
  prefix: string,
  dataUpdatedAt: number,
) {
  client.setQueryData([prefix, 'foyer-1'], ['donnée']);
  const entry = client.getQueryCache().find({ queryKey: [prefix, 'foyer-1'] });
  entry?.setState({ dataUpdatedAt });
}

beforeEach(() => {
  onlineManager.setOnline(true);
  useBannerStore.setState({ entries: [], sorted: [] });
});

afterEach(() => {
  onlineManager.setOnline(true);
  useBannerStore.setState({ entries: [], sorted: [] });
});

describe('useOfflineStaleBanner', () => {
  it('hors ligne, pousse le bandeau avec le MIN des dataUpdatedAt (jamais la moyenne ni le max)', async () => {
    const client = createClient();
    const ancien = Date.now() - 3 * 60 * 60 * 1000;
    const tresAncien = Date.now() - 5 * 60 * 60 * 1000;
    seedQuery(client, 'tasks', ancien);
    seedQuery(client, 'shopping_list_items', tresAncien);

    onlineManager.setOnline(false);
    renderHook(() => useOfflineStaleBanner(), { wrapper: wrapperFor(client) });

    await waitFor(() => {
      const entry = useBannerStore.getState().entries.find((e) => e.kind === 'offline-stale');
      expect(entry).toBeDefined();
    });
    const entry = useBannerStore.getState().entries.find((e) => e.kind === 'offline-stale');
    expect(entry?.priority).toBe(3);
    const attendu = format(new Date(tresAncien), "d MMM 'à' HH:mm", { locale: fr });
    expect((entry?.payload as { lastKnownAt: string }).lastKnownAt).toBe(attendu);
  });

  it('une annexe profiles très ancienne PARTICIPE au MIN (D-12 lettre, D-10) — horodatage prudent, jamais flatteur', async () => {
    const client = createClient();
    const recent = Date.now() - 10 * 60 * 1000;
    const annexeAncienne = Date.now() - 4 * 24 * 60 * 60 * 1000;
    seedQuery(client, 'tasks', recent);
    seedQuery(client, 'profiles', annexeAncienne);

    onlineManager.setOnline(false);
    renderHook(() => useOfflineStaleBanner(), { wrapper: wrapperFor(client) });

    await waitFor(() => {
      expect(useBannerStore.getState().entries.some((e) => e.kind === 'offline-stale')).toBe(true);
    });
    const entry = useBannerStore.getState().entries.find((e) => e.kind === 'offline-stale');
    const attendu = format(new Date(annexeAncienne), "d MMM 'à' HH:mm", { locale: fr });
    expect((entry?.payload as { lastKnownAt: string }).lastKnownAt).toBe(attendu);
  });

  it('en ligne : jamais de push (D-13)', async () => {
    const client = createClient();
    seedQuery(client, 'tasks', Date.now() - 60 * 1000);
    // En ligne (état par défaut du beforeEach) — aucun bandeau ne doit apparaître.
    renderHook(() => useOfflineStaleBanner(), { wrapper: wrapperFor(client) });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(useBannerStore.getState().entries.some((e) => e.kind === 'offline-stale')).toBe(false);
  });

  it('retour en ligne pendant l’affichage : dismiss effecté (D-13)', async () => {
    const client = createClient();
    seedQuery(client, 'tasks', Date.now() - 60 * 1000);

    onlineManager.setOnline(false);
    renderHook(() => useOfflineStaleBanner(), { wrapper: wrapperFor(client) });
    await waitFor(() => {
      expect(useBannerStore.getState().entries.some((e) => e.kind === 'offline-stale')).toBe(true);
    });

    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(useBannerStore.getState().entries.some((e) => e.kind === 'offline-stale')).toBe(false);
    });
  });

  it('hors ligne sans aucune donnée Tier 1 rendue (dataUpdatedAt = 0 partout) : pas de bandeau', async () => {
    const client = createClient();
    // Une query Tier 2 (hors allowlist) avec dataUpdatedAt ne compte pas.
    seedQuery(client, 'notes', Date.now() - 60 * 1000);

    onlineManager.setOnline(false);
    renderHook(() => useOfflineStaleBanner(), { wrapper: wrapperFor(client) });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(useBannerStore.getState().entries.some((e) => e.kind === 'offline-stale')).toBe(false);
  });
});
