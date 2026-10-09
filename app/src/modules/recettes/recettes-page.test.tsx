import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data, DataError } from '@/lib/data';
import RecettesPage from './recettes-page';

describe('Module Recettes', () => {
  it('affiche l’état vide « bientôt disponible »', async () => {
    renderWithProviders(<RecettesPage />);

    expect(await screen.findByText('Les recettes arrivent bientôt.')).toBeInTheDocument();
    expect(
      screen.getByText(/enregistrer vos recettes, les ingrédients et les préférences de chaque membre/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Ce que le module apportera')).toBeInTheDocument();
  });

  it('liste les recettes déjà enregistrées avec leur état', async () => {
    renderWithProviders(<RecettesPage />);

    expect(await screen.findByText('Tartiflette de saison')).toBeInTheDocument();
    expect(screen.getAllByText('Déjà enregistrée').length).toBeGreaterThan(0);
  });

  it('déclenche un toast depuis l’action « Me tenir informée »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecettesPage />);

    const boutons = await screen.findAllByRole('button', { name: 'Me tenir informée' });
    await user.click(boutons[0]!);

    await waitFor(() => {
      expect(
        screen.getByText('C’est noté, nous vous préviendrons dès l’ouverture des recettes.'),
      ).toBeInTheDocument();
    });
  });
});

const EMPTY_CACHE_TITLE = 'Aucune donnée en cache';

/** Bascule `navigator.onLine` et notifie les abonnés, comme le navigateur. */
function setOnlineStatus(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

describe('RecettesPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<RecettesPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Les recettes sont inaccessibles.')).not.toBeInTheDocument();
  });
});
