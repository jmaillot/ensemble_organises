import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import PrestatairesPage from './prestataires-page';

describe('PrestatairesPage', () => {
  it('filtre la grille sur le type choisi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    expect(await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atelier Bois & Co' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type'), 'Artisan');

    expect(screen.getByRole('heading', { name: 'Atelier Bois & Co' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cabinet du Dr Morel' })).not.toBeInTheDocument();
  });

  it('propose un état vide quand la recherche ne renvoie rien', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.type(screen.getByLabelText('Recherche'), 'dentiste');

    expect(screen.getByRole('heading', { name: 'Aucun prestataire trouvé' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByRole('heading', { name: 'Cabinet du Dr Morel' })).toBeInTheDocument();
  });

  it('ajoute un prestataire via le dialogue et le retrouve dans la grille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Crèche Les Petits Pas');
    await user.selectOptions(within(dialog).getByLabelText(/Type/), 'École');
    await user.type(within(dialog).getByLabelText(/Téléphone/), '04 78 11 22 33');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'contact@lespetitspas.fr');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    const card = await screen.findByRole('heading', { name: 'Crèche Les Petits Pas' });
    const article = card.closest('article');
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByText('École')).toBeInTheDocument();
    expect(within(article as HTMLElement).getByRole('link', { name: '04 78 11 22 33' })).toHaveAttribute(
      'href',
      'tel:0478112233',
    );
  });

  it('valide l’adresse e-mail du formulaire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Plombier');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'pas-un-email');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    expect(await within(dialog).findByText('Adresse e-mail invalide.')).toBeInTheDocument();
  });

  it('joint un devis à la création et l’affiche sur la carte', async () => {
    // Mode démo : le dépôt renvoie un aperçu local.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:piece-jointe' });
    try {
      const user = userEvent.setup();
      renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

      await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
      await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));

      const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
      await user.type(within(dialog).getByLabelText(/^Nom/), 'Électricien Lumen');
      await user.upload(
        within(dialog).getByLabelText(/Joindre des fichiers/),
        new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' }),
      );
      expect(await within(dialog).findByText(/devis\.pdf/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

      // Le dialogue ne se referme qu'après le dépôt : attendre sa fermeture
      // prouve le circuit complet, pas seulement la création de la fiche.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const card = await screen.findByRole('heading', { name: 'Électricien Lumen' });
      const article = card.closest('article');
      expect(article).not.toBeNull();
      expect(within(article as HTMLElement).getByText('devis.pdf')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('gère les types depuis le dialogue dédié', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Gérer les types' }));

    const dialog = await screen.findByRole('dialog', { name: 'Gérer les types' });
    await user.type(within(dialog).getByLabelText(/Nom du type/), 'Kinésithérapeute');
    await user.click(within(dialog).getByRole('radio', { name: 'Santé' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le type' }));

    const list = await within(dialog).findByText('Kinésithérapeute');
    expect(list).toBeInTheDocument();
    // Le nouveau type devient disponible dans le formulaire prestataire.
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));
    const form = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    expect(within(form).getByLabelText(/Type/)).toHaveDisplayValue('Sans type');
    expect(within(form).getByRole('option', { name: 'Kinésithérapeute' })).toBeInTheDocument();
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

describe('PrestatairesPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<PrestatairesPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Lecture impossible.')).not.toBeInTheDocument();
  });

  it('création hors ligne : confirmation mise en file, jamais un toast d’erreur', async () => {
    const user = userEvent.setup();
    mockOfflineQueue();
    renderWithProviders(<PrestatairesPage />);

    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Plombier Horsligne');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByText('Prestataire ajouté — il sera synchronisé au retour du réseau.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
