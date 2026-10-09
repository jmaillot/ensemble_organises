import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AnniversairesPage from './anniversaires-page';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import { formatMonthLabel } from '@/lib/utils';

const list = () => screen.findByRole('list', { name: 'Liste des anniversaires' });

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('AnniversairesPage', () => {
  it('filtre la liste par prénom et affiche un message si rien ne correspond', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    const rows = await list();
    expect(await within(rows).findByText('Maya Martin')).toBeInTheDocument();
    expect(within(rows).getByText('Paul Durand')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Rechercher un prénom' });
    await user.type(search, 'maya');

    const filtered = await list();
    expect(within(filtered).getByText('Maya Martin')).toBeInTheDocument();
    expect(within(filtered).queryByText('Paul Durand')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(await screen.findByText(/Aucun anniversaire ne correspond/)).toBeInTheDocument();
  });

  it('ajoute un anniversaire via le dialogue et l’affiche dans la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un anniversaire' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Zoé Bernard');
    const birthDate = within(dialog).getByLabelText(/^Date de naissance/);
    await user.type(birthDate, '14/03/1995');
    await user.selectOptions(within(dialog).getByLabelText(/Membre du foyer/), 'member-lina');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’anniversaire/ }));

    const rows = await list();
    const added = await within(rows).findByText('Zoé Bernard');
    // La ligne affiche le compte à rebours, l'âge fêté et la date du 14 mars.
    expect(added.closest('[role="listitem"]')).toHaveTextContent(/Dans \d+ jours · 32 ans/);
    expect(added.closest('[role="listitem"]')).toHaveTextContent('14 mars');
  });

  it('bascule entre la vue liste et la vue calendrier', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnniversairesPage />, { route: '/anniversaires' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getByRole('tab', { name: 'Calendrier' }));

    expect(screen.getByRole('group', { name: 'Calendrier des anniversaires' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: new RegExp(escape(formatMonthLabel(new Date()))) }),
    ).toBeInTheDocument();

    // Maya annivire le 7 octobre : la pastille apparaît au mois suivant.
    const mayaDot = () => screen.queryByRole('button', { name: 'Modifier l’anniversaire de Maya Martin' });
    for (let attempt = 0; attempt < 2 && !mayaDot(); attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }
    await user.click(mayaDot() as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Nom/)).toHaveValue('Maya Martin');
    // Stockée en ISO, ressaisie en JJ/MM/AAAA.
    expect(within(dialog).getByLabelText(/^Date de naissance/)).toHaveValue('07/10/1992');
  });
});

const EMPTY_CACHE_TITLE = 'Aucune donnée en cache';

/** Bascule `navigator.onLine` et notifie les abonnés, comme le navigateur. */
function setOnlineStatus(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** jsdom n'implémente pas `scrollIntoView`, utilisé par Radix à l'ouverture d'un dialogue. */
function supportScrollIntoView() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  }
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

describe('AnniversairesPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<AnniversairesPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Les anniversaires du foyer n’ont pas pu être chargés.')).not.toBeInTheDocument();
  });

  it('création hors ligne : confirmation mise en file, jamais un toast d’erreur', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    mockOfflineQueue();
    renderWithProviders(<AnniversairesPage />);

    await user.click(screen.getAllByRole('button', { name: 'Ajouter un anniversaire' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Robin Horsligne');
    await user.type(within(dialog).getByLabelText(/^Date de naissance/), '14/03/1995');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’anniversaire/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByText('Anniversaire ajouté — il sera synchronisé au retour du réseau.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
