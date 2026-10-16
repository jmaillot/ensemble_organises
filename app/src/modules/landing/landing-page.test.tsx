import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LandingPage from './landing-page';
import { modules } from '@/lib/modules';
import SignInPage from './sign-in-page';
import WelcomePage from './welcome-page';

describe('LandingPage', () => {
  it('présente les deux chemins de connexion de l’onboarding (AGENTS.md §4)', () => {
    renderWithProviders(<LandingPage />, { withHousehold: false });
    expect(screen.getByRole('link', { name: 'Commencer avec Google' })).toBeInTheDocument();
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

  it('ne promet plus aucun fonctionnement hors ligne (D-07)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LandingPage />, { withHousehold: false });

    expect(screen.getByText('En ligne d’abord')).toBeInTheDocument();
    expect(screen.queryByText('Utilisable hors ligne')).not.toBeInTheDocument();
    expect(screen.getByText('Application web installable, utilisable en ligne.')).toBeInTheDocument();

    const offlineQuestion = screen.getByRole('button', { name: /Faut-il une connexion/ });
    await user.click(offlineQuestion);
    expect(screen.getByText(/sans connexion, impossible de charger une page/)).toBeInTheDocument();
    expect(screen.queryByText(/rejouées à la reconnexion/)).not.toBeInTheDocument();
  });

  it('annonce le nombre RÉEL d’espaces du catalogue, jamais un nombre écrit à la main', () => {
    renderWithProviders(<LandingPage />, { withHousehold: false });
    // Le titre lisait « Seize espaces » pour 17 entrées de `lib/modules.ts` :
    // un nombre en toutes lettres est une affirmation qui dérive en silence
    // (constat (f) du lot de la phase 22, §8 des `deferred-items` de la phase
    // 19). Le titre lit `modules.length`, donc cette assertion rougit si
    // quelqu'un réécrit un nombre à la main.
    expect(
      screen.getByRole('heading', { level: 2, name: new RegExp(`^${modules.length} espaces`) }),
    ).toBeInTheDocument();
    expect(modules.length).toBeGreaterThan(1);
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

  it('annonce l’hébergement serveur, pas le hors ligne (D-07)', () => {
    renderWithProviders(<SignInPage />, { withHousehold: false });
    expect(screen.getByText(/vivent sur le serveur de votre foyer/)).toBeInTheDocument();
    expect(screen.queryByText(/accessibles hors ligne/)).not.toBeInTheDocument();
    expect(screen.queryByText(/retour du réseau/)).not.toBeInTheDocument();
  });
});

describe('WelcomePage', () => {
  it('propose exactement deux options : créer ou rejoindre un foyer', () => {
    renderWithProviders(<WelcomePage />);
    expect(screen.getByRole('link', { name: /Créer mon foyer/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rejoindre un foyer/ })).toBeInTheDocument();
  });
});
