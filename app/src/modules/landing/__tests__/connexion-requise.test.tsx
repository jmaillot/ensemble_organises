import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { renderWithProviders } from '@/test/render';
import SignInPage from '../sign-in-page';

/**
 * D-07 (plan 35-03) — deep link hors-ligne sans session : l'écran « connexion
 * requise pour cette vue » remplace le formulaire nu (jamais une erreur
 * technique générique). D-08 : aucun stockage au-delà de `state.from` —
 * l'état réseau est une lecture, pas une écriture.
 */

/** Rend SignInPage avec `state.from` (ce que RequireAuth écrit) et l'état réseau donné. */
function renderConnexion(from: unknown, online: boolean) {
  // Depuis MED-1, la page lit `useOnlineStatus` (source `onlineManager` de
  // TanStack Query, la même que le bootstrap) : c'est lui qu'on bascule, pas
  // `navigator.onLine` que jsdom ne sait pas faire varier.
  onlineManager.setOnline(online);
  return renderWithProviders(<SignInPage />, {
    route: { pathname: '/connexion', state: { from } },
    withHousehold: false,
  });
}

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('écran « connexion requise pour cette vue » (D-07)', () => {
  it('hors-ligne avec une vue demandée : titre explicite, vue visée nommée, aucun champ de formulaire', () => {
    renderConnexion('/taches/jour', false);

    expect(
      screen.getByRole('heading', { name: /connexion requise pour cette vue/i }),
    ).toBeInTheDocument();
    // La vue visée est dérivée de requestedPath (déjà filtré par internalPathOf).
    expect(screen.getByText(/\/taches\/jour/)).toBeInTheDocument();
    // Jamais le formulaire nu : aucun champ email ni mot de passe rendu.
    expect(screen.queryByLabelText(/adresse e-mail/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mot de passe/i)).not.toBeInTheDocument();
  });

  it('le bouton « Se reconnecter » révèle le formulaire de connexion', async () => {
    const user = userEvent.setup();
    renderConnexion('/taches/jour', false);

    await user.click(screen.getByRole('button', { name: /se reconnecter/i }));

    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
  });

  it('hors-ligne sans vue demandée : formulaire standard inchangé', () => {
    renderConnexion(null, false);

    expect(screen.queryByRole('heading', { name: /connexion requise pour cette vue/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
  });

  it('en ligne avec une vue demandée : formulaire standard (l’écran ne s’applique qu’hors-ligne)', () => {
    renderConnexion('/taches/jour', true);

    expect(screen.queryByRole('heading', { name: /connexion requise pour cette vue/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
  });

  it('aucun écrit localStorage/sessionStorage pendant le cycle (D-08)', async () => {
    const user = userEvent.setup();
    const setItem = vi.fn();
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(setItem);
    const sessionStorageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(setItem);

    try {
      renderConnexion('/taches/jour', false);
      await user.click(screen.getByRole('button', { name: /se reconnecter/i }));

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalled();
      expect(sessionStorageSpy).not.toHaveBeenCalled();
    } finally {
      localStorageSpy.mockRestore();
      sessionStorageSpy.mockRestore();
    }
  });
});
