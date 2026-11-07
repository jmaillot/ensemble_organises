import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { MESSAGE_HORS_LIGNE_SANS_DONNEES } from '@/lib/data/useResource';
import { persistNow, restoreOfflineCache, stopPersisting } from '@/lib/offline/query-persistence';
import RoutinesPage from './routines-page';

/**
 * G-35-6 — la classe, pas seulement l'instance Tâches : use-routines.ts
 * compose `error ?? annexe` au-dessus des annexes hors persistance
 * (routine_assignees / routine_reminders, aucune des deux dans
 * OFFLINE_FAMILIES). Au cold-start déconnecté, le cache routines est présent
 * mais les annexes n'ont RIEN : leur refetch échoue et l'erreur BRUTE gagne
 * via la chaîne `??`. Même garde honnête que use-taches.ts.
 */
afterEach(() => {
  // `onlineManager` est un singleton partagé : ne jamais laisser la suite
  // déclarée hors ligne après ce fichier.
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

/** Identifiant d'utilisateur de test : isole les clés IndexedDB entre tests. */
const UTILISATEUR_TEST = 'u-test-g35-6-routines';

/**
 * Cold-start par le chemin RÉEL de persistance (cf. taches-offline.test.tsx) :
 * persistNow applique l'allowlist D-07, restoreOfflineCache réinjecte
 * exactement ce que l'application restaure — les annexes non persistées
 * restent absentes, sans aucune injection manuelle.
 */
async function demarrageFroidDepuis(source: QueryClient, userId: string): Promise<QueryClient> {
  await persistNow(source, userId, DEMO_HOUSEHOLD_ID, { throttleTime: 0 });
  stopPersisting();
  const restored = createTestQueryClient();
  await restoreOfflineCache(restored, userId, DEMO_HOUSEHOLD_ID);
  return restored;
}

describe('Routines hors ligne (G-35-6)', () => {
  it('cold-start déconnecté, cache routines présent : les lignes rendent sans message réseau brut', async () => {
    const premier = renderWithProviders(<RoutinesPage />, { route: '/routines' });
    expect(await screen.findByText('Sortie canine')).toBeInTheDocument();
    premier.unmount();

    const clientFroid = await demarrageFroidDepuis(premier.queryClient, `${UTILISATEUR_TEST}-a`);
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));

    renderWithProviders(<RoutinesPage />, { route: '/routines', queryClient: clientFroid });

    // Les DEUX annexes sont hors allowlist : toutes deux doivent atteindre
    // l'état d'erreur pour que le test prouve le cas qu'il reproduit.
    await waitForQueryStatus(clientFroid, ['all', 'routine_assignees'], 'error');
    await waitForQueryStatus(clientFroid, ['all', 'routine_reminders'], 'error');
    await waitForQueryStatus(clientFroid, ['routines'], 'error');

    expect(screen.getByText('Sortie canine')).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NetworkError/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('cold-start déconnecté, cache routines ABSENT : le message honnête 35-09, jamais le réseau', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new TypeError('failed to fetch'));
    const client = createTestQueryClient();

    renderWithProviders(<RoutinesPage />, { route: '/routines', queryClient: client });
    await waitForQueryStatus(client, ['routines'], 'error');

    expect(screen.getByText(MESSAGE_HORS_LIGNE_SANS_DONNEES)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
