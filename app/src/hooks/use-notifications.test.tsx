import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { useMessagesFeed } from '@/modules/messages/hooks/use-messages';
import { useNotifications } from './use-notifications';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('centre de notifications', () => {
  it('agrège non lus et restes à faire, puis solde les marquables', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    // Un commentaire posté après l'ouverture du fil devient non lu.
    await data.create('post_comments', {
      post_id: 'post-1',
      household_id: DEMO_HOUSEHOLD_ID,
      author_id: DEMO_MEMBERS.thomas,
      content: 'On y va ?',
      created_at: new Date().toISOString(),
    });
    const stored = (await data.list('post_comments', { post_id: 'post-1' })) as Array<{ content: string }>;
    expect(stored.some((row) => row.content === 'On y va ?')).toBe(true);
    await waitFor(() => expect(new Set(result.current.items.map((item) => item.kind)).has('cercle')).toBe(true));

    const kinds = new Set(result.current.items.map((item) => item.kind));
    expect(kinds.has('message')).toBe(true);
    expect(kinds.has('cercle')).toBe(true);
    expect(kinds.has('tache')).toBe(true);
    // L'Ardoise n'y figure jamais (décision produit).
    expect(kinds.has('ardoise' as never)).toBe(false);

    const before = result.current.total;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      result.current.markAllRead();
    });
    const marks = JSON.parse(localStorage.getItem('ensemble-organises-messages-read') ?? '{}') as Record<string, string>;
    expect(Object.keys(marks).sort()).toEqual(['conversation-1', 'conversation-2', 'conversation-3']);
    // Seule la conversation-3 peut rester marquable : son message seed est
    // daté de 18h10, après le marquage (il se soldera à 18h10).
    await waitFor(() => {
      const remaining = result.current.items.filter((item) => item.markable).map((item) => item.id);
      expect(remaining.every((id) => id === 'message:conversation-3')).toBe(true);
    });
    // Les calculés restent (tâches dues), seuls les marquables se soldent.
    expect(result.current.total).toBeLessThan(before);
  });

  it('expose lus récents, masquage et effacement sans suppression', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    // Tout marquer comme lu fait basculer conversations et publications en lus récents.
    await act(async () => {
      result.current.markAllRead();
    });
    await waitFor(() => expect(result.current.recentRead.length).toBeGreaterThan(0));
    expect(result.current.recentRead.every((item) => item.unread === false)).toBe(true);

    // Retirer un rappel calculé le masque (sursis local), sans toucher la donnée.
    const computed = result.current.items.find((item) => !item.markable);
    expect(computed).toBeDefined();
    await act(async () => {
      result.current.dismissItem(computed!);
    });
    const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
    expect(Object.keys(masked)).toContain(computed!.id);
    await waitFor(() => expect(result.current.items.some((item) => item.id === computed!.id)).toBe(false));

    // Tout effacer solde les marquables et masque les rappels restants.
    await act(async () => {
      result.current.clearAll();
    });
    await waitFor(() =>
      expect(result.current.items.every((item) => item.markable && item.id === 'message:conversation-3')).toBe(true),
    );
    expect(result.current.items.some((item) => !item.markable)).toBe(false);
  });

  it('isole le feed messages : marquage direct de conversation-1', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    seedHouseholdStore();
    const { result } = renderHook(() => useMessagesFeed(), { wrapper });

    await waitFor(() => expect(result.current.conversations.length).toBeGreaterThan(0));
    const before = result.current.conversations.find((c) => c.id === 'conversation-1')?.unread ?? -1;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      result.current.markRead('conversation-1');
    });
    await waitFor(() => {
      expect(result.current.conversations.find((c) => c.id === 'conversation-1')?.unread).toBe(0);
    });
  });
});
