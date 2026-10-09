import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TachesPage from './taches-page';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, flushWithAdapter, pendingCount } from '@/lib/data/sync-queue';
import { renderWithProviders } from '@/test/render';

/**
 * jsdom n'implémente ni `scrollIntoView` (ouverture d'un dialogue Radix) ni
 * `ResizeObserver` (mesure des cases à cocher Radix).
 */
function supportDialogEnvironment() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  }
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;
  }
}

const LIST_NAME = 'Tâches du foyer';

/** La liste du panneau « Vos prochaines tâches », hors panneau des rappels. */
function taskList() {
  return within(screen.getByRole('list', { name: LIST_NAME }));
}

/** Même liste, avec attente : le contenu de fond est masqué tant qu'un dialogue est ouvert. */
async function findTaskList() {
  return within(await screen.findByRole('list', { name: LIST_NAME }));
}

describe('TachesPage', () => {
  it('affiche les tâches du foyer, les retards en tête', async () => {
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    const list = taskList();
    // Filtre « À faire par échéance » : la tâche terminée n'est pas listée.
    expect(list.queryByText('Ranger les photos de l’été')).not.toBeInTheDocument();
    // Échéance d'hier : le retard est annoncé et la tâche remonte en tête.
    expect(list.getByText('En retard de 1 j')).toBeInTheDocument();
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('Choisir le menu du week-end');
    expect(list.getByRole('button', { name: 'Réordonner : Choisir le menu du week-end' })).toBeInTheDocument();
  });

  it('coche une tâche puis filtre sur les tâches terminées', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(taskList().getByRole('checkbox', { name: 'Terminer Valider les rendez-vous du carnet' }));

    // Mise à jour optimiste : la tâche quitte la liste des tâches à faire.
    expect(taskList().queryByText('Valider les rendez-vous du carnet')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer les tâches'), 'terminees');

    expect(await (await findTaskList()).findByText('Valider les rendez-vous du carnet')).toBeInTheDocument();
    expect(taskList().getByText('Ranger les photos de l’été')).toBeInTheDocument();
    expect(taskList().queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
    expect(taskList().getByRole('checkbox', { name: 'Rouvrir Valider les rendez-vous du carnet' })).toBeChecked();
  });

  it('ajoute une tâche depuis le dialogue', async () => {
    supportDialogEnvironment();
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));

    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));
    expect(await dialog.findByText('Indiquez ce qu’il reste à faire.')).toBeInTheDocument();

    // Le membre courant est assigné par défaut.
    expect(dialog.getByRole('checkbox', { name: 'Assigner à Camille Martin' })).toBeChecked();

    await user.type(dialog.getByLabelText(/Nom de la tâche/), 'Réserver la table du restaurant');
    await user.selectOptions(dialog.getByLabelText(/Priorité/), 'haute');
    await user.click(dialog.getByRole('checkbox', { name: 'Assigner à Thomas Martin' }));
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));

    expect(await (await findTaskList()).findByText('Réserver la table du restaurant')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le foyer compte désormais une tâche de plus.
    expect(screen.getByText('dans la liste').previousElementSibling).toHaveTextContent('5');
  });

  it('ouvre la création pré-remplie depuis l’état de navigation (raccourci calendrier)', async () => {
    supportDialogEnvironment();
    renderWithProviders(<TachesPage />, { route: { pathname: '/taches', state: { dueDate: '2026-10-15' } } });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ajouter une tâche')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Échéance/)).toHaveValue('2026-10-15');
  });

  it('ignore un état de navigation invalide sans ouvrir le dialogue', async () => {
    renderWithProviders(<TachesPage />, { route: { pathname: '/taches', state: { dueDate: 'n’importe quoi' } } });

    await findTaskList();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

const EMPTY_CACHE_TITLE = 'Aucune donnée en cache';

/** Bascule `navigator.onLine` et notifie les abonnés, comme le navigateur. */
function setOnlineStatus(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

describe('TachesPage hors ligne (09-03)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('premier lancement hors ligne : état de cache vide explicite, jamais une liste muette', async () => {
    setOnlineStatus(false);
    renderWithProviders(<TachesPage />, { route: '/taches' });

    // Socle rouge : la requête reste en pause, seuls des squelettes muets
    // s'affichent, sans jamais dire que le cache est vide.
    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/reconnecte-toi pour charger/i)).toBeInTheDocument();
    // Ni la vraie liste vide (zéro ligne serveur), ni une erreur brute.
    expect(screen.queryByText('Aucune tâche à faire')).not.toBeInTheDocument();
    expect(screen.queryByText('Ce contenu n’a pas pu être chargé')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('lecture en échec hors ligne : état explicite, jamais l’erreur brute', async () => {
    const listSpy = vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<TachesPage />, { route: '/taches' });

    // En ligne : l'erreur existante s'affiche comme avant.
    expect(await screen.findByText('Ce contenu n’a pas pu être chargé')).toBeInTheDocument();

    // Hors ligne : le même échec devient l'état de cache vide explicite.
    setOnlineStatus(false);
    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Ce contenu n’a pas pu être chargé')).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('la reconnexion recharge la liste sans action manuelle', async () => {
    setOnlineStatus(false);
    renderWithProviders(<TachesPage />, { route: '/taches' });

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();

    setOnlineStatus(true);
    // Le réessai suit le retour réseau (mécanisme de reconnexion partagé).
    await findTaskList();
    expect(screen.queryByText(EMPTY_CACHE_TITLE)).not.toBeInTheDocument();
  });

  it('le bouton Réessayer est sans danger hors ligne puis recharge au retour réseau', async () => {
    const user = userEvent.setup();
    setOnlineStatus(false);
    renderWithProviders(<TachesPage />, { route: '/taches' });

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    // Toujours hors ligne : l'état persiste, sans erreur ni plantage.
    expect(screen.getByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();

    setOnlineStatus(true);
    await findTaskList();
  });

  it('création hors ligne : confirmation mise en file, ligne en attente, confirmée au rejeu sans doublon', async () => {
    supportDialogEnvironment();
    const user = userEvent.setup();
    // Les écritures échouent en mode file (signal `queuedForSync`), les
    // lectures restent en direct : c'est la copie d'erreur qui est le bug,
    // pas la file (les lignes se rejouent plus bas). La mise en file passe
    // par la vraie `enqueueMutation` : le rejeu est une preuve, pas un simulacre.
    const createSpy = vi.spyOn(data, 'create').mockImplementation(async (table, values) => {
      await enqueueMutation({
        table,
        operation: 'insert',
        rowId: String((values as { id?: unknown }).id ?? ''),
        values: values as Record<string, unknown>,
      });
      throw new DataError('Hors ligne : la modification sera synchronisée au retour du réseau.', null, true);
    });
    const { queryClient } = renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));

    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Nom de la tâche/), 'Acheter des piles hors ligne');
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));

    // Socle rouge : la file remontait comme une erreur (toast d'erreur,
    // dialogue bloqué ouvert, ligne invisible).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Tâche ajoutée — elle sera synchronisée au retour du réseau.')).toBeInTheDocument();
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    const list = await findTaskList();
    expect(list.getByText('Acheter des piles hors ligne')).toBeInTheDocument();
    expect(screen.getByText('En attente de synchronisation')).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalled();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));

    // Rejeu : la file se vide vers le stockage, la ligne est confirmée sans
    // doublon et la marque d'attente disparaît.
    createSpy.mockRestore();
    const flushed = await flushWithAdapter(data);
    expect(flushed.replayed).toBeGreaterThan(0);
    await queryClient.invalidateQueries();
    const confirmed = await findTaskList();
    expect(confirmed.getAllByText('Acheter des piles hors ligne')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('En attente de synchronisation')).not.toBeInTheDocument());
  });
});
