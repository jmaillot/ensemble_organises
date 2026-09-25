import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
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
