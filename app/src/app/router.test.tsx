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
import { AppRoutes } from './router';

function renderAt(path: string) {
  // `BrowserRouter` lit l'URL du document : c'est elle qui décide de la route.
  window.history.pushState({}, '', path);
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
