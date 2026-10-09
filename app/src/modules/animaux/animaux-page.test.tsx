import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import AnimauxPage from './animaux-page';

describe('AnimauxPage', () => {
  it('n’affiche que les vaccins dans l’onglet Vaccins', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    // Onglet ouvert par défaut : les produits du foyer Martin, pas les vaccins.
    const produits = await screen.findByRole('tabpanel');
    expect(await within(produits).findByText('Alimentation — croquettes XL')).toBeInTheDocument();
    expect(within(produits).queryByText('Rappel annuel — rage')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Vaccins' }));

    const vaccins = screen.getByRole('tabpanel');
    expect(within(vaccins).getByText('Rappel annuel — rage')).toBeInTheDocument();
    expect(within(vaccins).queryByText('Alimentation — croquettes XL')).not.toBeInTheDocument();
    expect(within(vaccins).queryByText('Antiparasitaire')).not.toBeInTheDocument();
  });

  it('ajoute un suivi via le dialogue et le retrouve dans le carnet de santé', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un suivi' })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un suivi' });
    await user.selectOptions(within(dialog).getByLabelText(/Type de suivi/), 'traitement');
    await user.type(within(dialog).getByLabelText(/Nom du suivi/), 'Comprimé antiparasitaire');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));

    const timeline = await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    expect(await within(timeline).findByText('Comprimé antiparasitaire')).toBeInTheDocument();
    // Le suivi créé apparaît aussi dans l'onglet correspondant.
    await user.click(screen.getByRole('tab', { name: 'Traitements' }));
    expect(within(screen.getByRole('tabpanel')).getByText('Comprimé antiparasitaire')).toBeInTheDocument();
  });

  it('refuse une échéance antérieure à la date du suivi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un suivi' })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un suivi' });
    await user.type(within(dialog).getByLabelText(/Nom du suivi/), 'Rappel à tester');
    await user.clear(within(dialog).getByLabelText(/Date du suivi/));
    await user.type(within(dialog).getByLabelText(/Date du suivi/), '2026-10-01');
    await user.type(within(dialog).getByLabelText(/Prochaine échéance/), '2026-09-30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));

    expect(await within(dialog).findByText('La prochaine échéance doit suivre la date du suivi.')).toBeInTheDocument();
  });

  it('affiche la section pièces jointes sous le carnet de santé', async () => {
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    expect(await screen.findByRole('heading', { name: 'Pièces jointes' })).toBeInTheDocument();
    expect(screen.getByText('Aucun document pour cette fiche. Les ordonnances et factures du vétérinaire restent à portée de main.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Joindre des fichiers/)).toBeInTheDocument();
  });

  it('propose de choisir une photo locale dans le dialogue de fiche', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getByRole('button', { name: 'Modifier la fiche' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Choisir une photo/)).toBeInTheDocument();
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

describe('AnimauxPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<AnimauxPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Lecture impossible.')).not.toBeInTheDocument();
  });

  it('création hors ligne : confirmation mise en file, jamais un toast d’erreur', async () => {
    const user = userEvent.setup();
    mockOfflineQueue();
    renderWithProviders(<AnimauxPage />);

    await user.click(screen.getAllByRole('button', { name: 'Ajouter une fiche' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Médor Horsligne');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la fiche' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByText('Fiche animal créée — elle sera synchronisée au retour du réseau.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
