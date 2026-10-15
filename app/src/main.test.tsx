import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Régression WR-04 : `Root` ne connaissait que deux états — prêt, ou en cours.
 * Un échec d'amorçage laissait donc « Chargement de votre foyer… » à l'écran
 * pour toujours, sans message ni reprise. Ce fichier verrouille les trois états
 * du contrat et, surtout, que le détail de l'erreur ne franchit jamais le DOM
 * (T-18-11) : le message rendu est fixe, l'objet reste dans l'état React.
 */

const mocks = vi.hoisted(() => ({
  useAuthBootstrap: vi.fn(),
  registerSW: vi.fn(),
}));

vi.mock('virtual:pwa-register', () => ({ registerSW: mocks.registerSW }));
vi.mock('@/hooks/use-auth', () => ({ useAuthBootstrap: mocks.useAuthBootstrap }));
vi.mock('@/app/router', async () => {
  const { jsx } = await import('react/jsx-runtime');
  return { AppRouter: () => jsx('div', { 'data-testid': 'app-router' }) };
});

// `main.tsx` monte l'application dès son import : le conteneur doit exister,
// sinon le module lève « Élément racine introuvable ». L'arbre monté à
// l'import rend le chargement dans `#root` ; les assertions passent donc par le
// conteneur du rendu de test, jamais par `screen`, pour ne pas l'y confondre.
document.body.innerHTML = '<div id="root"></div>';
mocks.useAuthBootstrap.mockReturnValue({ ready: false, error: null, retry: () => {} });
const { Root } = await import('./main');

const routerStub = (container: HTMLElement) => container.querySelector('[data-testid="app-router"]');

describe("écran d'amorçage", () => {
  beforeEach(() => {
    mocks.useAuthBootstrap.mockReturnValue({ ready: false, error: null, retry: () => {} });
  });

  it("affiche le chargement tant que l'amorçage n'est pas terminé", () => {
    const { container } = render(<Root />);

    expect(within(container).getByRole('status')).toHaveTextContent('Chargement de votre foyer');
    expect(routerStub(container)).toBeNull();
  });

  it("rend un message générique et une reprise quand l'amorçage échoue", async () => {
    const retry = vi.fn();
    // Message reconnaissable, et réaliste : un échec réseau peut transporter
    // l'URL appelée et la clé de la requête.
    const failure = new Error('GET https://api.exemple.fr/auth/v1/token?apikey=sb_publishable_secret → 503');
    mocks.useAuthBootstrap.mockReturnValue({ ready: true, error: failure, retry });

    const { container } = render(<Root />);

    expect(within(container).getByText('Votre foyer n’a pas pu être chargé.')).toBeInTheDocument();
    // Aucun détail : ni le message d'origine, ni son URL, ni sa clé.
    expect(container.textContent).not.toContain('sb_publishable_secret');
    expect(container.textContent).not.toContain(failure.message);
    // L'application n'est pas rendue à la place de l'erreur : la garde de route
    // renverrait vers `/connexion` un utilisateur dont la session est absente.
    expect(routerStub(container)).toBeNull();

    await userEvent.click(within(container).getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("affiche l'application quand l'amorçage a abouti", () => {
    mocks.useAuthBootstrap.mockReturnValue({ ready: true, error: null, retry: vi.fn() });

    const { container } = render(<Root />);

    expect(routerStub(container)).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
