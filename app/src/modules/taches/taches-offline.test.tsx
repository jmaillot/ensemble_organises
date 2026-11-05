import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import TachesPage from './taches-page';

/**
 * Reproduction du défaut G-33-3 côté Tâches : les requêtes d'annexe
 * (assignataires, rappels) sont des `useQuery` directs hors `useResource`
 * (use-taches.ts, clés `queryKeys.tableAll(...)`), donc elles n'héritent pas
 * du garde erreur/données de la couche de lecture. Hors ligne, leur refetch
 * échoue et l'isError composé masque les lignes de tâches pourtant en cache.
 */
afterEach(() => {
  // `onlineManager` est un singleton partagé : ne jamais laisser la suite
  // déclarée hors ligne après ce fichier.
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('Tâches hors ligne (G-33-3)', () => {
  it('refetch d’annexe échoué : les lignes de tâches en cache restent rendues', async () => {
    const queryClient = createTestQueryClient();

    // Premier passage EN LIGNE : les requêtes réussissent et remplissent le
    // cache mémoire (tâches, assignataires, rappels). Le scénario UAT est
    // « quelques navigations puis coupure » : le cache existe avant la panne,
    // une donnée pré-pourvie pendant le render hors ligne ne prouverait rien.
    const premier = renderWithProviders(<TachesPage />, { route: '/taches', queryClient });
    expect(await screen.findByText('Choisir le menu du week-end')).toBeInTheDocument();
    premier.unmount();

    onlineManager.setOnline(false);
    const listSpy = vi
      .spyOn(data, 'list')
      .mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    // Second montage avec le MÊME client : les données sont stale (staleTime
    // dérivé de la politique réelle), le refetch part hors ligne et échoue —
    // TanStack v5 garde `data` et pose `status: "error"`.
    renderWithProviders(<TachesPage />, { route: '/taches', queryClient });

    // L'échec est réel avant toute assertion d'absence : sans lui, « pas
    // d'ErrorState » ne prouverait rien.
    await waitForQueryStatus(queryClient, ['all', 'task_assignees'], 'error');
    await waitForQueryStatus(queryClient, ['tasks'], 'error');

    expect(screen.getByText('Choisir le menu du week-end')).toBeInTheDocument();
    expect(screen.queryByText('Ce contenu n’a pas pu être chargé')).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
