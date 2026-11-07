import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { Route, Routes } from 'react-router';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import { MESSAGE_HORS_LIGNE_SANS_DONNEES } from '@/lib/data/useResource';
import VoyagesPage from './voyages-page';
import TripDetailPage from './trip-detail-page';

/**
 * G-35-6 — audit de classe, sites Voyages (liste) et détail d'un voyage : les
 * deux hooks composent des erreurs brutes au-dessus de useQuery directs et
 * leurs pages les rendent via `error?.message`. Hors ligne sans cache, le
 * TypeError transport traverse — le garde honnête s'y applique désormais,
 * prouvé ici par site.
 */
afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('Voyages hors ligne (G-35-6)', () => {
  it('liste : hors ligne sans cache, le message honnête, jamais le TypeError réseau', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    renderWithProviders(<VoyagesPage />, { route: '/voyages', queryClient: client });
    await waitForQueryStatus(client, ['voyages', 'trips'], 'error');

    expect(screen.getByText(MESSAGE_HORS_LIGNE_SANS_DONNEES)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('détail : hors ligne sans cache, le message honnête, jamais le TypeError réseau', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    // La page lit `useParams` : sans déclaration de route, tripId resterait
    // null — la route est déclarée ici, comme le fait le routeur de l'app.
    renderWithProviders(
      <Routes>
        <Route path="/voyages/:tripId" element={<TripDetailPage />} />
      </Routes>,
      { route: '/voyages/voyage-1', queryClient: client },
    );
    // Le détail ne monte PAS la requête de liste : l'attente porte sur la
    // requête du voyage lui-même.
    await waitForQueryStatus(client, ['voyages', 'detail', 'voyage-1'], 'error');

    expect(screen.getByText(MESSAGE_HORS_LIGNE_SANS_DONNEES)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
