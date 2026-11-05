import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { queryKeys, useResource } from './useResource';

/**
 * G-33-3, unitaire : après un refetch échoué hors ligne, TanStack v5 pose
 * `status: "error"` même quand `state.data` existe. L'erreur n'est honnête
 * que SANS données en cache (D-09/D-10) : avec des données, les lignes du
 * cache restent rendues et `isError` reste faux.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useResource — cloisonnement erreur/données', () => {
  const CACHED_ROWS = [{ id: 'a', household_id: DEMO_HOUSEHOLD_ID, name: 'ligne en cache' }];
  const key = queryKeys.table('exemples', DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID }, null);

  function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it('refetch échoué avec données en cache : isError faux, lignes du cache rendues', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(key, CACHED_ROWS);
    vi.spyOn(data, 'list').mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const { result } = renderHook(() => useResource('exemples'), { wrapper: wrapperFor(queryClient) });

    // L'échec du refetch est réel avant d'asserter le cloisonnement : sans
    // lui, un isError faux ne prouverait rien.
    await waitFor(() => {
      expect(queryClient.getQueryCache().find({ queryKey: key })?.state.status).toBe('error');
    });
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(CACHED_ROWS);
  });

  it('échec sans aucune donnée en cache : isError vrai, erreur d’origine exposée (D-10)', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    vi.spyOn(data, 'list').mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const { result } = renderHook(() => useResource('exemples'), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error?.message).toContain('NetworkError');
  });
});
