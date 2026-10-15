import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { useSessionStore } from '@/stores/session-store';
import { demoUser } from '@/hooks/use-auth';
import { catalogueModules, modulePath } from '@/lib/modules';
import { internalPathOf } from '@/modules/landing/sign-in-page';
import { AppRoutes } from './router';

function renderAt(path: string, state: unknown = {}) {
  // `BrowserRouter` lit l'URL du document : c'est elle qui décide de la route.
  // `state.usr` est ce que `useLocation()` rend comme `state` (react-router le
  // range sous `usr`), donc c'est par là qu'on simule un `state.from` posé par
  // `RequireAuth` ou forgé par un tiers.
  window.history.pushState(state, '', path);
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Un bouton de navigation ne vaut que s'il mène à une page. Sans ce test, le
 * catalogue peut afficher une catégorie dont la route n'existe pas : chaque
 * entrée est donc rattachée à son écran, pas seulement à un lien.
 */
describe('Routes du foyer', () => {
  it.each(catalogueModules)('affiche la page $key à la route /$key', async (entry) => {
    seedHouseholdStore();
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt(modulePath(entry.key));

    // Le premier amorçage du cache local d'un module peut dépasser le délai
    // par défaut de `waitFor`.
    const page = await waitFor(
      () => {
        const found = document.querySelector(`[data-module="${entry.key}"]`);
        expect(found, `la route ${modulePath(entry.key)} ne rend aucun espace`).not.toBeNull();
        return found!;
      },
      { timeout: 5000 },
    );

    // Un module se reconnaît à son en-tête : « Cette page n'existe pas »
    // porterait un autre titre et aucun attribut `data-module`.
    expect(page.querySelector('h1')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cette page n’existe pas' })).not.toBeInTheDocument();
    expect(page.getAttribute('data-module')).toBe(entry.key);
  });
});

/**
 * Garde « réservé aux grands » (phase 14, D-06) : l'accès direct à l'URL
 * d'un des 5 modules hors périmètre rend la page « non autorisé » sobre —
 * jamais une 404 mensongère, jamais une redirection silencieuse.
 */
describe('Garde enfant — 5 modules hors périmètre', () => {
  const hiddenPaths = ['/ardoise', '/ardoise/quelconque', '/cadeaux', '/animaux', '/prestataires', '/fidelite'];

  it.each(hiddenPaths)('rend « non autorisé » à un enfant sur %s', async (path) => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt(path);

    expect(await screen.findByRole('heading', { name: 'Un espace réservé aux grands' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cette page n’existe pas' })).not.toBeInTheDocument();
    // L'espace existe : aucun attribut `data-module` ne doit fuir le contenu.
    expect(document.querySelector('[data-module]')).toBeNull();
  });

  it('ramène l’enfant au tableau de bord depuis la page non autorisé', async () => {
    const user = userEvent.setup();
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt('/cadeaux');

    await user.click(await screen.findByRole('link', { name: 'Retour au tableau de bord' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour/ })).toBeInTheDocument();
  });

  it('laisse les autres espaces intacts pour un enfant', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt('/taches');

    const page = await waitFor(
      () => {
        const found = document.querySelector('[data-module="taches"]');
        expect(found, 'la route /taches devrait rester accessible à un enfant').not.toBeNull();
        return found!;
      },
      { timeout: 5000 },
    );
    expect(page.querySelector('h1')).not.toBeNull();
  });
});
/**
 * `/foyer` affirme « Vous n'avez pas encore de foyer » : un utilisateur qui a
 * un foyer ne doit jamais la voir, sinon il crée des foyers en double en
 * croyant le sien perdu.
 */
describe('Garde /foyer', () => {
  it('redirige vers /accueil quand un foyer est chargé', async () => {
    seedHouseholdStore();
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt('/foyer');

    const page = await waitFor(
      () => {
        const found = document.querySelector('[data-module="accueil"]');
        expect(found, '/foyer avec un foyer devrait mener au tableau de bord').not.toBeNull();
        return found!;
      },
      { timeout: 5000 },
    );
    expect(page.querySelector('h1')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: /pas encore de foyer/i })).not.toBeInTheDocument();
  });

  it('affiche le choix créer/rejoindre quand aucun foyer n’est chargé', async () => {
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt('/foyer');

    expect(await screen.findByRole('heading', { name: /pas encore de foyer/i })).toBeInTheDocument();
  });
});

/**
 * Ces deux écrans ÉCRIVENT (créer un foyer, en consommer un jeton) : ils
 * doivent exiger une session comme `/foyer`, sans quoi l'écriture part d'un
 * visiteur anonyme. La RLS reste la frontière serveur ; la garde de route
 * évite d'y arriver.
 */
describe('Garde des écrans de foyer en écriture', () => {
  it.each(['/foyer/nouveau', '/foyer/rejoindre'])(
    'redirige un visiteur anonyme de %s vers /connexion',
    async (path) => {
      useHouseholdStore.getState().reset();
      useSessionStore.setState({ status: 'guest', user: null });
      renderAt(path);

      // La redirection est synchrone : sans garde, l'URL reste celle de l'écran
      // d'écriture et l'assertion échoue avant même de charger un morceau.
      await waitFor(() => expect(window.location.pathname).toBe('/connexion'));
      expect(await screen.findByRole('heading', { name: 'Ravi de vous revoir' }, { timeout: 5000 })).toBeInTheDocument();
      // La redirection porte l'origine, exactement comme `/foyer` : après
      // connexion, l'utilisateur retrouve l'écran qu'il visait.
      expect(window.history.state?.usr).toEqual({ from: path });
    },
    15_000,
  );

  /**
   * Le défaut mesuré : la chaîne de requête EST la route visée. Un lien
   * d'invitation (`/foyer/rejoindre?token=…`, émis par les paramètres du foyer)
   * porte son jeton dans l'URL ; ne garder que `pathname` le perd à la
   * connexion, et le jeton est le contrôle d'accès (AGENTS.md §4).
   */
  it('conserve la chaîne de requête dans `from`', async () => {
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
    const target = '/foyer/rejoindre?token=abcdefghijklmnopqrstuv';
    renderAt(target);

    await waitFor(() => expect(window.location.pathname).toBe('/connexion'));
    expect(window.history.state?.usr).toEqual({ from: target });
  });

  it('ramène le visiteur sur la route visée après connexion, jeton compris', async () => {
    const user = userEvent.setup();
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
    const target = '/foyer/rejoindre?token=abcdefghijklmnopqrstuv';
    renderAt(target);

    await waitFor(() => expect(window.location.pathname).toBe('/connexion'));
    // Seul chemin de connexion exerçable sans backend : la session de démo.
    await user.click(await screen.findByRole('button', { name: 'Entrer dans la démonstration' }, { timeout: 5000 }));

    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(target),
    );
  });

  /**
   * T-19-43 : `state.from` est une donnée du navigateur. L'honorer sans
   * contrôle ferait de la connexion une redirection ouverte. La garde est
   * vérifiée ICI directement (`internalPathOf`) : le test d'intégration
   * ci-dessus rougit bien quand on la retire, mais il rougirait pour une autre
   * raison — jsdom refuse lui-même une poussée hors origine — et une preuve qui
   * ne distingue pas la garde du filet du navigateur ne prouve pas la garde.
   */
  it.each([
    ['un chemin interne', '/foyer/rejoindre?token=abc', '/foyer/rejoindre?token=abc'],
    ['la racine', '/', '/'],
    ['une URL absolue', 'https://externe.example/pwned', null],
    ['une forme protocole-relative', '//externe.example/pwned', null],
    ['une barre oblique inversée', '/\\externe.example/pwned', null],
    ['un schéma javascript', 'javascript:alert(1)', null],
    ['une valeur non textuelle', 42, null],
    ['une valeur vide', '', null],
  ])('`from` : %s', (_label, input, expected) => {
    expect(internalPathOf(input)).toBe(expected);
  });

  it('refuse une origine externe dans `from` (pas de redirection ouverte)', async () => {
    const user = userEvent.setup();
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
    renderAt('/connexion', { usr: { from: 'https://externe.example/pwned' } });

    await user.click(await screen.findByRole('button', { name: 'Entrer dans la démonstration' }, { timeout: 5000 }));

    await waitFor(() => expect(window.location.pathname).toBe('/accueil'));
    expect(window.location.href).not.toContain('externe.example');
  });

  /**
   * L'invariant d'amorçage reste maître : honorer `from` ne déplace pas la
   * destination par défaut, et un utilisateur sans foyer est toujours ramené au
   * choix « créer / rejoindre » par `RequireHousehold` — c'est la garde, pas la
   * page de connexion, qui décide.
   */
  it('ouvrir la page d’accueil déconnecté mène toujours à /accueil après connexion', async () => {
    const user = userEvent.setup();
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
    renderAt('/');

    await user.click(await screen.findByRole('link', { name: 'Continuer avec un email' }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: 'Entrer dans la démonstration' }, { timeout: 5000 }));

    await waitFor(() => expect(window.location.pathname).toBe('/accueil'));
  });

  it('sans foyer, /accueil mène toujours au choix créer/rejoindre', async () => {
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'authenticated', user: demoUser });
    renderAt('/accueil');

    expect(await screen.findByRole('heading', { name: /pas encore de foyer/i })).toBeInTheDocument();
  });
});
