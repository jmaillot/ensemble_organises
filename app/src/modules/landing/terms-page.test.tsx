import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import TermsPage from './terms-page';

describe('TermsPage', () => {
  it('affiche les articles, l’ardoise indicative et le contact', () => {
    renderWithProviders(
      <Routes>
        <Route path="/conditions-utilisation" element={<TermsPage />} />
      </Routes>,
      { route: '/conditions-utilisation', withHousehold: false },
    );

    expect(screen.getByRole('heading', { name: 'Conditions Générales d’Utilisation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Article 8/ })).toBeInTheDocument();
    expect(screen.getByText(/répartition indicative/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Article 12/ })).toBeInTheDocument();
    const privacyLinks = screen.getAllByRole('link', { name: /politique de confidentialité/i });
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
    expect(privacyLinks[0]).toHaveAttribute('href', '/confidentialite');
  });
});
