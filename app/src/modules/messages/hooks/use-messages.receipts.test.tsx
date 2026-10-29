import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { useReadReceipts } from './use-messages';

const { mockFetchReadReceipts } = vi.hoisted(() => ({
  mockFetchReadReceipts: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, fetchReadReceipts: mockFetchReadReceipts };
});

/**
 * D-02 côté données : la rangée ne montre que les co-membres qui ont lu —
 * l'appelante est exclue (le RPC l'est déjà côté serveur, la démo ici), et un
 * membre sans lecture est absent, jamais grisé (UI-SPEC).
 */

const receipt = (memberId: string, readAt: string | null, displayName = memberId) => ({
  memberId,
  displayName,
  colorTag: 'coral' as const,
  readAt,
});

beforeEach(() => {
  seedHouseholdStore();
  mockFetchReadReceipts.mockReset();
  mockFetchReadReceipts.mockImplementation(async () => []);
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

describe('useReadReceipts — filtrage des lecteurs', () => {
  it('exclut l’appelante et les membres sans lecture, tri par ordre de lecture', async () => {
    useHouseholdStore.setState({ currentMemberId: 'member-camille' });
    mockFetchReadReceipts.mockImplementation(async () => [
      receipt('member-camille', '2026-10-29T08:00:00'), // l'appelante elle-même
      receipt('member-theo', null), // pas encore lu
      receipt('member-bob', '2026-10-29T10:00:00'),
      receipt('member-ada', '2026-10-29T09:00:00'),
    ]);

    const { result } = renderHook(() => useReadReceipts('conv-1', true), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(2));

    expect(result.current.map((reader) => reader.id)).toEqual(['member-ada', 'member-bob']);
    expect(result.current.every((reader) => reader.readAt !== '')).toBe(true);
  });

  it('ne se lance qu’une fois un message envoyé, et jamais sans fil', () => {
    const noSent = renderHook(() => useReadReceipts('conv-1', false), { wrapper });
    expect(mockFetchReadReceipts).not.toHaveBeenCalled();
    noSent.unmount();

    const noConversation = renderHook(() => useReadReceipts(null, true), { wrapper });
    expect(mockFetchReadReceipts).not.toHaveBeenCalled();
    noConversation.unmount();

    renderHook(() => useReadReceipts('conv-1', true), { wrapper });
    expect(mockFetchReadReceipts).toHaveBeenCalledWith('conv-1', expect.anything());
  });
});
