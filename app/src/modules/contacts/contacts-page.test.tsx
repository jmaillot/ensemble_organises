import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { data, DataError } from '@/lib/data';
import { enqueueMutation, pendingCount } from '@/lib/data/sync-queue';
import ContactsPage from './contacts-page';

const list = () => screen.findByRole('list', { name: 'Liste des contacts' });

describe('ContactsPage', () => {
  it('en tant qu’admin, seules Famille + sa perso sont visibles (OQ-2 amendée)', async () => {
    // Camille, la connectée du jeu de démo, est admin : depuis 0098, même un
    // admin ne reçoit du serveur que Famille + sa liste personnelle. La page
    // rend ce snapshot filtré sans l'élargir (aucune branche rôle côté
    // client) — ce test verrouille la forme : 2 pastilles, compteurs sur le
    // seul visible.
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const state = useHouseholdStore.getState();
    expect(state.members.find((member) => member.id === state.currentMemberId)?.role).toBe('admin');

    await within(await list()).findByText('Maya Martin');

    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    expect(within(chips).getAllByRole('button')).toHaveLength(2);
    expect(within(chips).getByRole('button', { name: /Famille/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /Camille/ })).toBeInTheDocument();

    // Compteurs sur le seul visible (jeu de démo : 2 listes, 5 fiches).
    expect(screen.getByText('Listes').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('Fiches').closest('div')).toHaveTextContent('5');
  });

  it('affiche les chips de listes et les fiches avec date au format JJ/MM/AAAA', async () => {
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    const rows = await list();
    expect(await within(rows).findByText('Maya Martin')).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    expect(within(chips).getByRole('button', { name: /Famille/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /Camille/ })).toBeInTheDocument();

    // La date de naissance s'affiche en JJ/MM/AAAA (D-02).
    expect(within(rows).getByText(/Né\(e\) le 07\/10\/1992/)).toBeInTheDocument();
  });

  it('avertit d’un doublon probable sans bloquer la soumission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un contact' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Maya Martin');
    await user.type(within(dialog).getByLabelText(/Date de naissance/), '07/10/1992');

    // L'alerte D-04 est non bloquante : elle s'affiche, la soumission reste permise.
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/Doublon probable/);
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    const rows = await list();
    expect(await within(rows).findAllByText('Maya Martin')).toHaveLength(2);
  });

  it('propose le déplacement vers Famille sur ses propres contacts personnels, jamais sur Famille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    // Liste Famille par défaut : aucun bouton de déplacement.
    await within(await list()).findByText('Maya Martin');
    expect(screen.queryByRole('button', { name: /Déplacer la fiche/ })).not.toBeInTheDocument();

    // Liste personnelle du membre connecté : le bouton est proposé.
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    const rows = await list();
    expect(await within(rows).findByText('Camille Martin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }),
    ).toBeInTheDocument();
  });

  it('la modale annonce le partage au foyer, l’annulation ne déplace rien', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    await within(await list()).findByText('Camille Martin');
    await user.click(screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }));

    // Copie de confirmation (D-04) : l'issue est dite avant de confirmer.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Déplacer « Camille Martin » vers Famille ?')).toBeInTheDocument();
    expect(within(dialog).getByText(/visible par tout le foyer/)).toBeInTheDocument();
    expect(within(dialog).getByText(/anniversaire sera partagé/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Annulation sans effet : la fiche reste personnelle, absente de Famille.
    await user.click(within(chips).getByRole('button', { name: /Famille/ }));
    expect(screen.queryByText('Camille Martin')).not.toBeInTheDocument();
  });

  it('confirmer déplace la fiche vers Famille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactsPage />, { route: '/contacts' });

    await within(await list()).findByText('Maya Martin');
    const chips = screen.getByRole('group', { name: 'Choisir une liste de contacts' });
    await user.click(within(chips).getByRole('button', { name: /Camille/ }));
    await within(await list()).findByText('Camille Martin');
    await user.click(screen.getByRole('button', { name: 'Déplacer la fiche de Camille Martin vers Famille' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer vers Famille' }));

    // La fiche rejoint la liste partagée…
    await user.click(within(chips).getByRole('button', { name: /Famille/ }));
    expect(await within(await list()).findByText('Camille Martin')).toBeInTheDocument();
    // …et le bouton de déplacement disparaît avec elle.
    expect(screen.queryByRole('button', { name: /Déplacer la fiche/ })).not.toBeInTheDocument();
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

describe('ContactsPage hors ligne (09-05)', () => {
  afterEach(() => {
    setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  it('cache vide hors ligne : état explicite avec réessai, jamais l’erreur brute', async () => {
    setOnlineStatus(false);
    vi.spyOn(data, 'list').mockRejectedValue(new DataError('fetch failed'));
    renderWithProviders(<ContactsPage />);

    expect(await screen.findByText(EMPTY_CACHE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Les contacts du foyer n’ont pas pu être chargés.')).not.toBeInTheDocument();
  });

  it('création hors ligne : confirmation mise en file, jamais un toast d’erreur', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    mockOfflineQueue();
    renderWithProviders(<ContactsPage />);

    await user.click(screen.getAllByRole('button', { name: 'Ajouter un contact' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Robin Horsligne');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByText('Contact ajouté — il sera synchronisé au retour du réseau.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Hors ligne : la modification sera synchronisée au retour du réseau.'),
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await pendingCount()).toBeGreaterThan(0));
  });
});
