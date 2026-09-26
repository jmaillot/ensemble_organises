import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { catalogueModules } from '@/lib/modules';
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

  it('propose une navigation basse sur mobile', () => {
    renderShell('/accueil');
    const mobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    expect(within(mobile).getAllByRole('link').length).toBe(4);
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

  it('ouvre le catalogue en tuiles depuis la navigation mobile', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Espaces' }));

    const dialog = screen.getByRole('dialog');
    const grid = within(dialog).getByRole('list', { name: 'Tous les espaces' });
    expect(within(grid).getAllByRole('button')).toHaveLength(catalogueModules.length);
    expect(within(grid).getByRole('button', { name: 'Ouvrir Anniversaires' })).toBeInTheDocument();
  });

  it('ferme le catalogue après avoir choisi une catégorie', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Espaces' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ouvrir Courses' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
