import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { MESSAGE_HORS_LIGNE_SANS_DONNEES } from '@/lib/data/useResource';
import { persistNow, restoreOfflineCache, stopPersisting } from '@/lib/offline/query-persistence';
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

/**
 * G-35-6 : le TypeError d'annexe réapparaît quand la requête principale A des
 * données en cache (cold-start : le cache persisté ramène `tasks` mais PAS
 * `task_reminders`, hors allowlist 33-03). La chaîne `error ?? annexe` de
 * use-taches.ts laisse alors l'erreur BRUTE de l'annexe gagner — le TypeError
 * traverse alors que les lignes rendent. Le garde honnête s'applique AUX
 * ANNEXES, exactement comme la substitution 35-09 s'applique au principal.
 */

/** Identifiant d'utilisateur de test : isole les clés IndexedDB entre tests. */
const UTILISATEUR_TEST = 'u-test-g35-6';

/**
 * Reproduit un cold-start déconnecté par le chemin RÉEL de persistance :
 * premier passage en ligne → persistNow (allowlist D-07 appliquée) → restore
 * sur un client neuf. Aucune injection manuelle de setQueryData : ce qui
 * revient au cache est exactement ce que l'application restaure elle-même,
 * annexes non persistées comprises dans leur absence.
 */
async function demarrageFroidDepuis(source: QueryClient, userId: string): Promise<QueryClient> {
  await persistNow(source, userId, DEMO_HOUSEHOLD_ID, { throttleTime: 0 });
  // Désabonner la souscription de sauvegarde : le client source est jeté,
  // sa traîne throttlée ne doit plus rien réécrire.
  stopPersisting();
  const restored = createTestQueryClient();
  await restoreOfflineCache(restored, userId, DEMO_HOUSEHOLD_ID);
  return restored;
}

describe('Tâches hors ligne (G-35-6)', () => {
  it('cold-start déconnecté, cache tâches présent : les lignes rendent sans message réseau brut', async () => {
    const premier = renderWithProviders(<TachesPage />, { route: '/taches' });
    expect(await screen.findByText('Choisir le menu du week-end')).toBeInTheDocument();
    premier.unmount();

    const clientFroid = await demarrageFroidDepuis(premier.queryClient, `${UTILISATEUR_TEST}-taches-a`);
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));

    renderWithProviders(<TachesPage />, { route: '/taches', queryClient: clientFroid });

    // L'échec de l'annexe hors persistance (task_reminders) est réel avant
    // toute assertion d'absence ; le principal atteint aussi l'état d'erreur
    // (refetch échoué, données gardées).
    await waitForQueryStatus(clientFroid, ['all', 'task_reminders'], 'error');
    await waitForQueryStatus(clientFroid, ['tasks'], 'error');

    expect(screen.getByText('Choisir le menu du week-end')).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NetworkError/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('cold-start déconnecté, cache tâches ABSENT : le message honnête 35-09, jamais le réseau', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    renderWithProviders(<TachesPage />, { route: '/taches', queryClient: client });
    await waitForQueryStatus(client, ['tasks'], 'error');

    expect(screen.getByText(MESSAGE_HORS_LIGNE_SANS_DONNEES)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('EN LIGNE, échec sans cache : l’erreur brute reste rendue (D-11 n’édulcore rien en ligne)', async () => {
    onlineManager.setOnline(true);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    renderWithProviders(<TachesPage />, { route: '/taches', queryClient: client });
    await waitForQueryStatus(client, ['tasks'], 'error');

    expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
