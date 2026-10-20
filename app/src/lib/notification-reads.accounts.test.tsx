import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/render';
import { demoUser } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import type { SessionUser } from '@/types';
import { useSyncedReads } from './notification-reads';

/**
 * Deux personnes, un navigateur : la marque de lecture locale était rangée
 * sous une clé unique, sans le compte. La seconde héritait donc des lignes
 * soldées par la première — la cloche masquait ce qu'elle n'avait pas lu.
 * Ces gardes tiennent la clé par compte et sa relecture au changement.
 */

const KEY = 'lecture-test';

const neighbour: SessionUser = {
  ...demoUser,
  id: 'profile-voisin',
  email: 'voisin@example.fr',
  displayName: 'Voisin',
};

let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ status: 'authenticated', user: demoUser, householdLoaded: true });
  queryClient = createTestQueryClient();
});

describe('marques de lecture par compte', () => {
  it('range la marque sous la clé du compte, jamais sous la clé nue', async () => {
    const { result } = renderHook(() => useSyncedReads('conversation', KEY), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.markRead('fil-1'));

    expect(result.current.readMap['fil-1']).toBeTruthy();
    expect(localStorage.getItem(`${KEY}:${demoUser.id}`)).toContain('fil-1');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ne prête pas au compte suivant les lignes soldées par le précédent', async () => {
    const { result, rerender } = renderHook(() => useSyncedReads('conversation', KEY), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.markRead('fil-1'));
    expect(result.current.readMap['fil-1']).toBeTruthy();

    act(() => useSessionStore.setState({ user: neighbour }));
    rerender();

    await waitFor(() => expect(result.current.readMap['fil-1']).toBeUndefined());
  });

  it('relit la marque déjà posée par le compte qui prend la session', async () => {
    localStorage.setItem(
      `${KEY}:${neighbour.id}`,
      JSON.stringify({ 'fil-2': '2026-10-19T10:00:00.000Z' }),
    );

    const { result, rerender } = renderHook(() => useSyncedReads('conversation', KEY), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.readMap['fil-2']).toBeUndefined();

    act(() => useSessionStore.setState({ user: neighbour }));
    rerender();

    await waitFor(() =>
      expect(result.current.readMap['fil-2']).toBe('2026-10-19T10:00:00.000Z'),
    );
  });
});
