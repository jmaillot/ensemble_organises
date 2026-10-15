import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RouteChunkLoader } from '@/app/route-preload';
import { LazyRoute } from './route-error';

/** Page qui jette au rendu : le cas « la page s'est chargée, puis a échoué ». */
function ThrowingPage(): never {
  throw new Error('Erreur de rendu de la page');
}

/**
 * `LazyRoute` confond aujourd'hui deux causes que l'utilisateur ne peut pas
 * traiter de la même façon :
 *  - l'import paresseux rejeté (réseau) — « Réessayer » relance vraiment
 *    l'import, donc le bouton est utile ;
 *  - l'erreur de rendu de la page — rejouer la même page fautive boucle sans
 *    fin, et l'attribuer à la connexion est faux.
 * Les deux chemins doivent produire deux messages distincts, et seul le
 * premier offre le réessai.
 */
describe('LazyRoute — une erreur de chargement n’est pas une erreur de rendu', () => {
  it('un import paresseux rejeté propose le réessai qui relance l’import', async () => {
    const user = userEvent.setup();
    const load = vi.fn<RouteChunkLoader>(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );

    render(<LazyRoute load={load} />);

    expect(await screen.findByText(/vérifiez votre connexion puis réessayez/)).toBeInTheDocument();
    expect(screen.queryByText(/Cette page a rencontré une erreur/)).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    // Le réessai relance réellement l'import : React met en cache la promesse
    // rejetée d'un `lazy()` existant, donc un nouvel objet est recréé.
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('une erreur de rendu n’est pas imputée à la connexion et ne rejoue pas la page', async () => {
    const user = userEvent.setup();
    const load = vi.fn<RouteChunkLoader>(async () => ({ default: ThrowingPage }));
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      render(<LazyRoute load={load} />);

      expect(await screen.findByText(/Cette page a rencontré une erreur/)).toBeInTheDocument();
      expect(screen.queryByText(/vérifiez votre connexion/)).not.toBeInTheDocument();
      // Rejouer la même page fautive boucle sans fin : pas de « Réessayer ».
      expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);

      // L'action offerte est un rechargement réel de l'application.
      await user.click(screen.getByRole('button', { name: 'Recharger l’application' }));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});
