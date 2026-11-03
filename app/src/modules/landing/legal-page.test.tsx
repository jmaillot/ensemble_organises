import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import LegalPage from './legal-page';

describe('LegalPage', () => {
  it('rend sans session avec le titre, l’eyebrow et les sections D-13', () => {
    renderWithProviders(
      <Routes>
        <Route path="/mentions-legales" element={<LegalPage />} />
      </Routes>,
      { route: '/mentions-legales', withHousehold: false },
    );

    expect(screen.getByRole('heading', { name: 'Mentions légales' })).toBeInTheDocument();
    expect(screen.getByText(/Informations/)).toBeInTheDocument();
    expect(screen.getByText(/Jeremy Maillot, entrepreneur individuel/)).toBeInTheDocument();
    expect(screen.getByText(/Directeur de publication/)).toBeInTheDocument();
    expect(screen.getByText(/hébergé par l’éditeur lui-même sur son propre serveur/)).toBeInTheDocument();
    // Contact D-13 : l'adresse dédiée contact@, jamais la boîte personnelle brute.
    expect(screen.getByText(/contact@jeremymaillot\.fr/)).toBeInTheDocument();
    // Politique de purge en langue claire : suppression ≤ 30 jours, sauvegardes chiffrées nocturnes.
    expect(screen.getByText(/30 jours/)).toBeInTheDocument();
    expect(screen.getByText(/sauvegardes sont chiffrées/i)).toBeInTheDocument();
  });

  it('T-31-13 : l’adresse Gmail brute n’apparaît NULLE part sur la page', () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/mentions-legales" element={<LegalPage />} />
      </Routes>,
      { route: '/mentions-legales', withHousehold: false },
    );

    expect(container.textContent).not.toContain('jeremymaillot@gmail.com');
  });

  it('relie la politique de confidentialité depuis la section purge', () => {
    renderWithProviders(
      <Routes>
        <Route path="/mentions-legales" element={<LegalPage />} />
      </Routes>,
      { route: '/mentions-legales', withHousehold: false },
    );

    const links = screen.getAllByRole('link', { name: /politique de confidentialité/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/confidentialite');
  });
});
