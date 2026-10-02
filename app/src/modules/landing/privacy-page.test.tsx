import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import PrivacyPage from './privacy-page';

describe('PrivacyPage', () => {
  it('affiche la politique avec contact, droits et CNIL', () => {
    renderWithProviders(
      <Routes>
        <Route path="/confidentialite" element={<PrivacyPage />} />
      </Routes>,
      { route: '/confidentialite', withHousehold: false },
    );

    expect(screen.getByRole('heading', { name: 'Politique de confidentialité' })).toBeInTheDocument();
    const contacts = screen.getAllByRole('link', { name: 'jeremymaillot@gmail.com' });
    expect(contacts.length).toBeGreaterThanOrEqual(1);
    for (const contact of contacts) {
      expect(contact).toHaveAttribute('href', 'mailto:jeremymaillot@gmail.com');
    }
    expect(screen.getByRole('heading', { name: /Combien de temps/ })).toBeInTheDocument();
    expect(screen.getByText(/sous 30 jours/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cnil\.fr/i })).toHaveAttribute('href', 'https://www.cnil.fr');
  });
});
