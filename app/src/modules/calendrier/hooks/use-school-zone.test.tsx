import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { HouseholdRow } from '@/types';
import { useSchoolZone } from './use-school-zone';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe('useSchoolZone (D-16)', () => {
  it('lit la zone du foyer et persiste la modification admin', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useSchoolZone(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.zone).toBeNull();

    await act(async () => {
      await result.current.saveZone('B');
    });
    await waitFor(() => expect(result.current.zone).toBe('B'));

    const rows = await data.list<HouseholdRow>('households', { id: DEMO_HOUSEHOLD_ID });
    expect(rows[0]?.school_zone).toBe('B');

    await act(async () => {
      await result.current.saveZone(null);
    });
    await waitFor(() => expect(result.current.zone).toBeNull());
  });
});
