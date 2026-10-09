import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import FidelitePage from './fidelite-page';

describe('Fidélité', () => {
  it('ouvre le code d’une carte en plein écran avec sa valeur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    const card = await screen.findByRole('button', { name: 'Afficher le code de Marché de proximité en plein écran' });
    await user.click(card);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Marché de proximité')).toBeInTheDocument();
    expect(within(dialog).getByText('628411903312')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /fermer/i }).length).toBeGreaterThan(0);
  });

  it('ajoute une carte depuis le dialogue et la retrouve dans la grille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une carte/i }));

    const dialog = await screen.findByRole('dialog', { name: /ajouter une carte/i });
    await user.type(within(dialog).getByLabelText(/nom de la carte/i), 'Pharmacie Verte');
    await user.type(within(dialog).getByLabelText(/^code/i), '99887766');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer la carte/i }));

    expect(await screen.findByRole('button', { name: 'Afficher le code de Pharmacie Verte en plein écran' })).toBeInTheDocument();
    expect(screen.getByText('99887766')).toBeInTheDocument();
  });

  it('explique l’absence de caméra et propose la saisie manuelle', async () => {
    const user = userEvent.setup();
    // jsdom n’expose ni `BarcodeDetector` ni `mediaDevices`.
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /scanner une carte/i }));
    const dialog = await screen.findByRole('dialog', { name: /scanner une carte/i });
    expect(within(dialog).getByText(/caméra non disponible/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/saisissez le code/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /saisir le code à la main/i }));
    expect(await screen.findByLabelText(/nom de la carte/i)).toBeInTheDocument();
  });

  it('supprime une carte après confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' }));
    await user.click(await screen.findByRole('button', { name: /^supprimer$/i }));

    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /supprimer la carte/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' })).toBeNull(),
    );
  });

  it('filtre les cartes par catégorie d’enseigne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await screen.findByRole('button', { name: 'Afficher le code de Marché de proximité en plein écran' });
    const filter = screen.getByLabelText(/catégorie/i);

    await user.selectOptions(filter, 'alimentaire');
    expect(screen.getByRole('button', { name: 'Afficher le code de Marché de proximité en plein écran' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' })).toBeNull();

    await user.selectOptions(filter, 'sport');
    expect(await screen.findByText('Aucune carte dans cette catégorie')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toutes les catégories' }));
    expect(screen.getByRole('button', { name: 'Afficher le code de Librairie du parc en plein écran' })).toBeInTheDocument();
  });

  it('enregistre la catégorie choisie dans le formulaire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une carte/i }));

    const dialog = await screen.findByRole('dialog', { name: /ajouter une carte/i });
    await user.type(within(dialog).getByLabelText(/nom de la carte/i), 'Garage Central');
    await user.type(within(dialog).getByLabelText(/^code/i), '44556677');
    await user.selectOptions(within(dialog).getByLabelText(/catégorie/i), 'auto_carburant');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer la carte/i }));

    expect(await screen.findByText('Auto & Carburant')).toBeInTheDocument();
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

describe('FidelitePage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<FidelitePage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Les cartes de fidélité n’ont pas pu être chargées.')).not.toBeInTheDocument();
  });

  it('création hors ligne : retenue en file, jamais un toast d’erreur', async () => {
    const user = userEvent.setup();
    // `addCard` passe par `resource.create` (09-03) : la mise en file y est
    // retenue et l'appel se résout — aucun toast d'erreur.
    mockOfflineQueue();
    renderWithProviders(<FidelitePage />);

    await user.click(await screen.findByRole('button', { name: /ajouter une carte/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/nom de la carte/i), 'Pharmacie Horsligne');
    await user.type(within(dialog).getByLabelText(/^code/i), '11223344');
    await user.click(within(dialog).getByRole('button', { name: /enregistrer la carte/i }));

    await waitFor(() => expect(screen.getByText('Carte de fidélité enregistrée.')).toBeInTheDocument());
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
