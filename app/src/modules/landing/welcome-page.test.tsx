import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import WelcomePage from './welcome-page';

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock('@/hooks/use-sign-out', () => ({
  useSignOutWithConfirm: (onDone?: () => void) => {
    signOutMock.mockImplementation(async () => {
      onDone?.();
    });
    return {
      signOut: signOutMock,
      // Dialog réel du hook D-17 : le montage unique est contractuel (Pitfall 4).
      dialog: <p role="status">Écritures en attente</p>,
      busy: false,
    };
  },
}));

/**
 * Sonde de ROUTE : `renderWithProviders` monte un MemoryRouter, donc la
 * navigation ne passe JAMAIS par `window.location` — seul `useLocation`
 * à l'intérieur du routeur observe le déplacement.
 */
function RouteProbe() {
  const { pathname } = useLocation();
  return <span data-testid="route-probe" data-pathname={pathname} />;
}

describe('WelcomePage — déconnexion réelle (G-37-2, D-07)', () => {
  beforeEach(() => {
    localStorage.clear();
    signOutMock.mockReset();
  });

  it('rend un bouton « Se déconnecter », pas un lien vers /connexion', () => {
    renderWithProviders(
      <>
        <WelcomePage />
        <RouteProbe />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Se déconnecter' });
    expect(button).toBeInTheDocument();
    // Le faux « Changer de compte » était un Link vers /connexion : un lien
    // ne purge rien. La page doit porter un vrai bouton piloté par le hook.
    expect(screen.queryByRole('link', { name: 'Changer de compte' })).not.toBeInTheDocument();
    // Le lien de secours reste tel quel (plan).
    expect(screen.getByRole('link', { name: /Retour au tableau de bord/ })).toBeInTheDocument();
  });

  it('au clic, appelle signOut du hook puis navigue vers /connexion via onDone', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <WelcomePage />
        <RouteProbe />
      </>,
    );
    expect(screen.getByTestId('route-probe').getAttribute('data-pathname')).toBe('/');
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('route-probe').getAttribute('data-pathname')).toBe('/connexion');
  });

  it('monte le dialog D-17 du hook une seule fois (Pitfall 4)', () => {
    renderWithProviders(
      <>
        <WelcomePage />
        <RouteProbe />
      </>,
    );
    // Le dialog est rendu par createElement dans le hook `.ts` : il DOIT être
    // monté par l'appelant, une fois par composant.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Écritures en attente');
  });
});
