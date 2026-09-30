import { describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { catalogueModules } from '@/lib/modules';
import { MOBILE_DRAWER_GROUPS } from '@/components/shared/mobile-drawer';
import { AppShell } from './app-shell';

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="*" element={<h1>Contenu de test</h1>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('AppShell', () => {
  it('affiche la navigation principale et le nom du foyer', () => {
    renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Maison/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /À faire/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Calendrier/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Cercle/ })).toBeInTheDocument();
    expect(screen.getAllByText('Foyer Martin').length).toBeGreaterThan(0);
  });

  it('propose un fil d’Ariane cohérent avec la route courante', () => {
    renderShell('/taches');
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    // Libellé de navigation de l'export : « À faire » pour le module tâches.
    expect(within(breadcrumb).getByText('À faire')).toBeInTheDocument();
  });

  it('propose un hamburger qui ouvre le tiroir des espaces', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    // L'en-tête porte le nom de l'application, pas un « Menu » générique.
    expect(within(dialog).getByText('Ensemble & Organisés')).toBeInTheDocument();
    // Maison + seize modules, chacun joignable en un tap.
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(17);
    expect(within(dialog).getByRole('link', { name: 'Ouvrir Courses' })).toBeInTheDocument();
  });

  it('marque la page active dans la navigation', () => {
    renderShell('/calendrier');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { current: 'page', name: /Calendrier/ })).toBeInTheDocument();
  });

  it('propose un lien d’évitement vers le contenu principal', () => {
    renderShell('/accueil');
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute('href', '#contenu-principal');
  });

  it('teinte le badge du foyer de sa couleur', () => {
    renderShell('/accueil');
    act(() => {
      useHouseholdStore.setState({ householdColor: 'coral' });
    });
    try {
      const badge = screen.getAllByText('FM')[0].closest('span');
      expect(badge?.className).toContain('bg-coral');
    } finally {
      useHouseholdStore.setState({ householdColor: 'accent' });
    }
  });
});

/**
 * Régression : la barre latérale n'épinglait que quatre entrées, et les douze
 * autres catégories n'avaient aucun bouton de navigation. Le catalogue est la
 * garantie qu'aucun espace du foyer ne devienne inatteignable.
 */
describe('AppShell — catalogue des espaces', () => {
  it('expose un bouton pour chacune des seize catégories', () => {
    renderShell('/accueil');
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    const links = within(grid).getAllByRole('link');
    expect(links).toHaveLength(catalogueModules.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(catalogueModules.map((entry) => `/${entry.key}`));
  });

  it('départage les catégories qui n’ont pas d’accès rapide épinglé', () => {
    renderShell('/accueil');
    const quick = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    // Accueil n'appartient pas au catalogue : il reste le premier accès rapide.
    expect(quick.getByRole('link', { name: /Maison/ })).toBeInTheDocument();
    for (const key of ['courses', 'anniversaires', 'animaux', 'fidelite', 'messages'] as const) {
      const entry = catalogueModules.find((module) => module.key === key)!;
      expect(quick.queryByRole('link', { name: entry.label })).not.toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: entry.label }).length).toBeGreaterThan(0);
    }
  });

  it('replie et déplie la section du catalogue', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    const toggle = screen.getByRole('button', { name: /Tous les espaces/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Repliée, la section ne doit plus exposer un seul lien à l'axe de
    // tabulation ni au lecteur d'écran.
    expect(screen.queryByRole('list', { name: 'Espaces du foyer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Courses' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();
  });

  it('ouvre le tiroir en tuiles depuis le hamburger', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(17);
    expect(within(dialog).getByRole('link', { name: 'Ouvrir Anniversaires' })).toBeInTheDocument();
  });

  it('ferme le tiroir après avoir choisi un espace', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Ouvrir Courses' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('le tiroir couvre chaque espace du catalogue, plus la maison', () => {
    const keys = MOBILE_DRAWER_GROUPS.flatMap((group) => group.keys);
    expect(keys).toContain('accueil');
    for (const entry of catalogueModules) {
      expect(keys, `${entry.key} injoignable sur mobile`).toContain(entry.key);
    }
  });

  it('filtre les espaces depuis la recherche du tiroir', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: 'Rechercher un espace' }), 'courses');
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(1);
  });

  it('retrouve un espace sans taper ses accents', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: 'Rechercher un espace' }), 'a faire');
    expect(within(dialog).getByRole('link', { name: 'Ouvrir À faire' })).toBeInTheDocument();
  });

  it('affiche une popup quand le service worker relaie un push (app ouverte)', async () => {
    const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          const set = listeners.get(type) ?? new Set<(event: MessageEvent) => void>();
          set.add(listener);
          listeners.set(type, set);
        }),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    try {
      renderShell('/accueil');
      const handler = [...(listeners.get('message') ?? [])][0];
      expect(handler, 'le shell écoute le service worker').toBeDefined();
      act(() => {
        handler!({ data: { type: 'EO_PUSH', title: 'Rappel', body: 'Dentiste à 18h' } } as MessageEvent);
      });
      expect(await screen.findByText('Rappel — Dentiste à 18h')).toBeInTheDocument();
    } finally {
      // @ts-expect-error restauration de l'environnement jsdom
      delete window.navigator.serviceWorker;
    }
  });
});
