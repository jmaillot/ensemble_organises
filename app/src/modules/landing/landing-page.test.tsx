import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LandingPage from './landing-page';
import SignInPage from './sign-in-page';
import WelcomePage from './welcome-page';

describe('LandingPage', () => {
  it('présente les trois chemins de connexion de l’onboarding (AGENTS.md §4)', () => {
    renderWithProviders(<LandingPage />, { withHousehold: false });
    expect(screen.getByRole('link', { name: 'Commencer avec Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuer avec Facebook' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuer avec un email' })).toBeInTheDocument();
  });

  it('déplie une réponse de la FAQ au clic', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />, { withHousehold: false });
    const question = screen.getByRole('button', { name: /Qui peut voir les données du foyer/ });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    await user.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Uniquement les membres du foyer concerné/)).toBeInTheDocument();
  });
});

describe('SignInPage', () => {
  it('valide le format de l’e-mail avant tout appel réseau', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignInPage />, { withHousehold: false });
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Adresse e-mail invalide.')).toBeInTheDocument();
  });

  it('propose la session de démonstration quand aucun backend n’est configuré', () => {
    renderWithProviders(<SignInPage />, { withHousehold: false });
    expect(screen.getByRole('heading', { name: 'Mode démonstration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrer dans la démonstration' })).toBeInTheDocument();
  });
});

describe('WelcomePage', () => {
  it('propose exactement deux options : créer ou rejoindre un foyer', () => {
    renderWithProviders(<WelcomePage />);
    expect(screen.getByRole('link', { name: /Créer mon foyer/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rejoindre un foyer/ })).toBeInTheDocument();
  });
});
