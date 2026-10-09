import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import AdressesPage from './adresses-page';

describe('Adresses', () => {
  it('bascule « Déjà visité » puis le filtre « À visiter » exclut les lieux visités', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdressesPage />);

    const toggle = await screen.findByRole('switch', { name: 'Marquer Le Parc du Quartier comme visité' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Marquer Le Parc du Quartier comme non visité' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'À visiter' }));

    expect(await screen.findByText('Aucun lieu ne correspond')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier Le Parc du Quartier/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifier Le Café du Matin/ })).toBeNull();
  });

  it('filtre par recherche et par type de lieu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdressesPage />);

    await screen.findByRole('button', { name: /Modifier Le Café du Matin/ });

    await user.type(screen.getByRole('searchbox', { name: /rechercher un lieu/i }), 'parc');
    expect(screen.queryByRole('button', { name: /Modifier Le Café du Matin/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Modifier Le Parc du Quartier/ })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: /rechercher un lieu/i }));
    await user.selectOptions(screen.getByLabelText(/type de lieu/i), 'restaurant');
    expect(await screen.findByText('Aucun lieu ne correspond')).toBeInTheDocument();
  });

  it('ajoute un lieu depuis le dialogue et l’affiche dans la grille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdressesPage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une adresse/i }));

    const dialog = await screen.findByRole('dialog', { name: /ajouter une adresse/i });
    await user.type(within(dialog).getByLabelText(/nom du lieu/i), 'Boulangerie du Coin');
    await user.selectOptions(within(dialog).getByLabelText(/type de lieu/i), 'restaurant');
    await user.selectOptions(within(dialog).getByLabelText(/^note \*/i), '5');
    await user.type(within(dialog).getByLabelText(/ville/i), 'Villeurbanne');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer le lieu/i }));

    const created = await screen.findByRole('button', { name: /Modifier Boulangerie du Coin/ });
    expect(created).toBeInTheDocument();
    expect(screen.getByText('Boulangerie du Coin')).toBeInTheDocument();
    // Le lieu n'est pas encore visité : il reste dans le filtre « À visiter ».
    expect(screen.getByRole('switch', { name: 'Marquer Boulangerie du Coin comme visité' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

const EMPTY_CACHE_TITLE = 'Aucune donnée en cache';

/** Bascule `navigator.onLine` et notifie les abonnés, comme le navigateur. */
function setOnlineStatus(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** Les écritures échouent en mode file (`queuedForSync`), comme hors ligne. */
function mockOfflineQueue() {
  return vi.spyOn(data, 'create').mockImplementation(async (table, values) => {
    await enqueueMutation({
      table,
      operation: 'insert',
      rowId: String((values as { id?: unknown }).id ?? ''),
      values: values as Record<string, unknown>,
    });
    throw new DataError('Hors ligne : la modification sera synchronisée au retour du réseau.', null, true);
  });
}

describe('AdressesPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<AdressesPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Les adresses n’ont pas pu être chargées.')).not.toBeInTheDocument();
  });

  it('création hors ligne : retenue en file, jamais un toast d’erreur', async () => {
    const user = userEvent.setup();
    // `addPlace` passe par `resource.create` (09-03) : la mise en file y est
    // retenue et l'appel se résout — aucun toast d'erreur.
    mockOfflineQueue();
    renderWithProviders(<AdressesPage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une adresse/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/nom du lieu/i), 'Librairie Horsligne');
    await user.selectOptions(within(dialog).getByLabelText(/type de lieu/i), 'restaurant');
    await user.selectOptions(within(dialog).getByLabelText(/^note \*/i), '5');
    await user.type(within(dialog).getByLabelText(/ville/i), 'Villeurbanne');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer le lieu/i }));

    await waitFor(() => expect(screen.getByText('Lieu enregistré.')).toBeInTheDocument());
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
