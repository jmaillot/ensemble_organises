import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { renderWithProviders, createTestQueryClient, waitForQueryStatus } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { queryKeys } from '@/lib/data/useResource';
import CoursesPage from './courses-page';

/**
 * Non-régression de bout en bout du constat #15 (`docs/TODO.md`).
 *
 * La preuve doit monter la page avec un cache VIDE et le navigateur DÉCLARÉ
 * hors ligne **avant** le montage : c'est la subtilité mesurée en usage réel —
 * une application déjà chargée sert son cache mémoire et n'exhibe pas le
 * défaut, seule une ouverture à froid le montre. `renderWithProviders` fabrique
 * un client neuf à chaque appel, donc aucune donnée n'est en cache.
 *
 * Sur le code d'avant la politique réseau, la requête ne part pas
 * (`fetchStatus: 'paused'`), `isLoading` et `isError` valent tous deux `false`,
 * et la page rend l'état vide ordinaire « Aucune liste pour ce foyer » : le
 * `findByRole` ci-dessous expire, c'est le rouge exigé. Après la politique,
 * la requête part, échoue, et l'`ErrorState` déjà prévu par la page s'affiche.
 */
afterEach(() => {
  // `onlineManager` est un singleton partagé : ne jamais laisser la suite
  // déclarée hors ligne après ce fichier.
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('Courses hors ligne (#15)', () => {
  it('cache vide : dit qu’elle n’a pas pu lire, jamais « aucune liste »', async () => {
    onlineManager.setOnline(false);
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new Error('Réseau indisponible.'));

    renderWithProviders(<CoursesPage />);

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Aucune liste pour ce foyer')).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  /**
   * Cas exact du G-33-3 : quelques navigations en mode avion, puis la vue
   * allowlistée affiche « Ce contenu n'a pas pu être chargé » alors que des
   * données sont en cache. La donnée doit être pré-pourvie AVANT le render
   * hors ligne : TanStack v5 pose `status: "error"` même quand `state.data`
   * existe après un refetch échoué (diagnostic G-33-3), donc une pré-pourrie
   * pendant le render hors ligne ne prouverait rien — c'est le cache qui doit
   * préexister, comme après quelques navigations.
   */
  it('refetch échoué avec données en cache : les lignes restent rendues, jamais d’ErrorState', async () => {
    const queryClient = createTestQueryClient();
    const listeEnCache = [
      {
        id: 'list-cache-1',
        household_id: DEMO_HOUSEHOLD_ID,
        trip_id: null,
        name: 'Courses de la semaine',
        created_by: null,
        created_at: '2026-11-05T08:00:00Z',
      },
    ];
    queryClient.setQueryData(
      queryKeys.table('shopping_lists', DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID }, null),
      listeEnCache,
    );
    // `use-courses` compose l'isError des listes ET des items : une cache
    // d'items ABSENT (undefined) resterait une erreur honnête sans données
    // (D-09/D-10) et masquerait les lignes — la liste vide définie dit au
    // contraire « donnée connue, rien à afficher ».
    queryClient.setQueryData(
      queryKeys.table('shopping_list_items', DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID }, null),
      [],
    );

    onlineManager.setOnline(false);
    const listSpy = vi
      .spyOn(data, 'list')
      .mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    renderWithProviders(<CoursesPage />, { route: '/courses', queryClient });

    // Le refetch (donnée stale) part et échoue réellement : sans cet échec,
    // l'absence d'ErrorState ne prouverait rien.
    await waitForQueryStatus(queryClient, ['shopping_lists'], 'error');

    expect(await screen.findByText('Courses de la semaine')).toBeInTheDocument();
    expect(screen.queryByText('Ce contenu n’a pas pu être chargé')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });
});
