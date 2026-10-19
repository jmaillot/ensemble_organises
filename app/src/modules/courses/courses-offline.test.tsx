import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
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
});
