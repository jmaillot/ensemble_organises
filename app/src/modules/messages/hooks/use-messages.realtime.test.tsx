import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { messageKeys, useMessagesRealtime } from './use-messages';

/**
 * D-08 : l'événement Realtime rafraîchit le fil ouvert ET la liste (badges
 * compris) — jamais les accusés de lecture : aucune souscription aux
 * watermarks, la surface de preuve reste réduite (décision D-08).
 */

const dispatchChange = (table: string) => {
  window.dispatchEvent(new CustomEvent('eo:data-change', { detail: { table } }));
};

let queryClient: ReturnType<typeof createTestQueryClient>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  seedHouseholdStore();
  queryClient = createTestQueryClient();
});

/** Amorce le cache avec un fil et une liste, comme après une navigation. */
const seedCaches = () => {
  queryClient.setQueryData(messageKeys.thread('household-martin', 'conversation-1', 30), {
    rows: [],
    hasMore: false,
    total: 0,
  });
  queryClient.setQueryData(messageKeys.conversations('household-martin'), []);
  queryClient.setQueryData(messageKeys.receipts('conversation-1'), []);
};

const cachedKeys = () => queryClient.getQueryCache().getAll();

describe('useMessagesRealtime — invalidation D-08', () => {
  it('un INSERT sur messages invalide le fil ouvert ET la liste', () => {
    seedCaches();
    renderHook(() => useMessagesRealtime(), { wrapper });

    dispatchChange('messages');

    for (const entry of cachedKeys()) {
      expect(entry.state.isInvalidated).toBe(true);
    }
  });

  it('un événement sur conversations (nouvelle directe créée par l’autre membre) rafraîchit la liste', () => {
    seedCaches();
    renderHook(() => useMessagesRealtime(), { wrapper });

    dispatchChange('conversations');

    const list = queryClient.getQueryCache().find({ queryKey: messageKeys.conversations('household-martin') });
    expect(list?.state.isInvalidated).toBe(true);
  });

  it('un changement d’appartenance (conversation_members) rafraîchit aussi le fil et la liste', () => {
    seedCaches();
    renderHook(() => useMessagesRealtime(), { wrapper });

    dispatchChange('conversation_members');

    for (const entry of cachedKeys()) {
      expect(entry.state.isInvalidated).toBe(true);
    }
  });

  it('ne souscrit JAMAIS aux watermarks (notification_reads) — D-08', () => {
    // Un événement notification_reads ne doit rien invalider : l'accusé de
    // lecture est hors temps réel (D-08), la surface de preuve reste réduite.
    seedCaches();
    renderHook(() => useMessagesRealtime(), { wrapper });
    dispatchChange('notification_reads');
    for (const entry of cachedKeys()) {
      expect(entry.state.isInvalidated).toBe(false);
    }
  });

  it('le démontage retire l’invalidation (aucune fuite de listener)', () => {
    seedCaches();
    const { unmount } = renderHook(() => useMessagesRealtime(), { wrapper });
    unmount();
    dispatchChange('messages');
    for (const entry of cachedKeys()) {
      expect(entry.state.isInvalidated).toBe(false);
    }
  });
});
