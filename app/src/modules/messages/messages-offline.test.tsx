import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import { MESSAGE_HORS_LIGNE_SANS_DONNEES } from '@/lib/data/useResource';
import MessagesPage from './messages-page';

/**
 * G-35-6 — audit de classe, site Messages : use-messages.ts composait une
 * erreur brute (ternaire sur les trois useQuery) et messages-page.tsx la
 * rendait telle quelle via `feed.error?.message`. Hors ligne sans cache, le
 * TypeError transport traverse — le garde honnête s'y applique désormais,
 * prouvé ici.
 */
afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('Messages hors ligne (G-35-6)', () => {
  it('hors ligne sans cache : le message honnête, jamais le TypeError réseau', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    renderWithProviders(<MessagesPage />, { route: '/messages', queryClient: client });
    await waitForQueryStatus(client, ['messages'], 'error');

    expect(screen.getByText(MESSAGE_HORS_LIGNE_SANS_DONNEES)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
