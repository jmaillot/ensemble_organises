import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { data } from '@/lib/data';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { nextBirthdayDate } from '@/modules/anniversaires/types';
import { renderWithProviders } from '@/test/render';
import type { GiftItemRow, HouseholdMemberRow } from '@/types';
import CadeauxPage from './cadeaux-page';
import { nextAnniversary, nextIdeaOccasion, toGiftItem } from './types';

const TEST_CODE = 'CODECADEAU22CHARS012345';

let codeActive = false;
const mockSummary = vi.fn(async (_listId: string) => ({
  listId: 'gift-list-maya',
  isActive: codeActive,
  hasCode: codeActive,
  expiresAt: null,
  maxUses: 20,
  useCount: codeActive ? 1 : 0,
}));
const mockCreate = vi.fn(async (_listId: string) => {
  codeActive = true;
  return { code: TEST_CODE, expiresAt: null, maxUses: 20, listId: 'gift-list-maya' };
});
const mockRevoke = vi.fn(async (_listId: string) => {
  codeActive = false;
});
const mockReserveMember = vi.fn(async (itemId: string) => {
  // Bascule fidèle (G-06-23) : comme le RPC serveur, tenir un article libre
  // pose la tenue (nom de démo, signal), rejouer une tenue la libère (trois
  // colonnes effacées, `released: true`). Le distinguo mien/autrui est le
  // verdict serveur (prouvé en 0035) : le mock ne simule que le transport
  // du verdict. La base de démo est ré-amorcée après chaque test (setup.ts).
  const rows = await data.list<GiftItemRow>('gift_items', { id: itemId });
  const row = rows[0];
  if (!row) throw new Error('Article introuvable.');
  if (row.reserved_by ?? row.reserved_by_name) {
    await data.update<GiftItemRow>('gift_items', itemId, {
      reserved_by: null,
      reserved_by_name: null,
      purchased: false,
    } as Partial<GiftItemRow>);
    return { itemId, alreadyReserved: false, released: true };
  }
  await data.update<GiftItemRow>('gift_items', itemId, {
    reserved_by_name: 'Camille Martin',
    purchased: true,
  } as Partial<GiftItemRow>);
  return { itemId, alreadyReserved: false, released: false };
});
// Départ fidèle (G-06-1c) : comme le RPC serveur, quitter supprime la part
// qui faisait fusionner la liste — le refetch la fait sortir de la vue. La
// base de démo est ré-amorcée après chaque test (setup.ts), sans pollution.
const mockLeaveList = vi.fn(async (listId: string) => {
  await data.remove('gift_list_shares', 'gift-share-2');
  return { list_id: listId, left: true };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchGiftListInviteSummary: (...args: [string]) => mockSummary(...args),
    createGiftListInviteCode: (...args: [string]) => mockCreate(...args),
    revokeGiftListInviteCode: (...args: [string]) => mockRevoke(...args),
    reserveMemberGiftItem: (...args: [string]) => mockReserveMember(...args),
    leaveGiftList: (...args: [string]) => mockLeaveList(...args),
  };
});

beforeEach(() => {
  codeActive = false;
  vi.clearAllMocks();
});

describe('CadeauxPage', () => {
  it('filtre les listes par visibilité, l’étrangère dans son propre filtre Partagées', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille : aucun badge accolé.
    expect(await screen.findByText('Idées pour Maya')).toBeInTheDocument();
    expect(screen.queryByText('Liste privée')).not.toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    // Trois listes : sélecteur à bascules, une par liste, l'active enfoncée.
    const selector = screen.getByRole('group', { name: 'Listes de cadeaux' });
    expect(within(selector).getByRole('button', { name: 'Idées pour Maya' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(selector).getByRole('button', { name: 'Anniversaire de Noé' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(selector).getByRole('button', { name: 'Noël des Voisins' })).toBeInTheDocument();

    // La bascule change la liste active et ses idées.
    await user.click(within(selector).getByRole('button', { name: 'Anniversaire de Noé' }));
    expect(await screen.findByText('Casque pour le vélo')).toBeInTheDocument();
    expect(screen.queryByText('Atelier céramique')).not.toBeInTheDocument();

    // Filtre « Foyer » : la seule liste non privée du foyer — l'étrangère
    // rejointe a son propre filtre ; liste unique en texte simple.
    await user.click(screen.getByRole('button', { name: 'Foyer' }));
    expect(screen.queryByRole('group', { name: 'Listes de cadeaux' })).not.toBeInTheDocument();
    expect(screen.getByText('Anniversaire de Noé')).toBeInTheDocument();
    expect(screen.queryByText('Noël des Voisins')).not.toBeInTheDocument();
    expect(screen.queryByText('Idées pour Maya')).not.toBeInTheDocument();

    // Filtre « Partagées » : exactement la liste étrangère rejointe —
    // G-06-24 : le filtre porte le sens, aucun badge d'origine accolé.
    await user.click(screen.getByRole('button', { name: 'Partagées' }));
    expect(screen.getByText('Noël des Voisins')).toBeInTheDocument();
    expect(screen.queryByText(/Liste partagée/)).not.toBeInTheDocument();
    expect(screen.queryByText('Anniversaire de Noé')).not.toBeInTheDocument();
    expect(screen.queryByText('Idées pour Maya')).not.toBeInTheDocument();

    // Filtre « Privées » : seule la privée reste, en texte.
    await user.click(screen.getByRole('button', { name: 'Privées' }));
    expect(screen.getByText('Idées pour Maya')).toBeInTheDocument();
    expect(screen.queryByText('Anniversaire de Noé')).not.toBeInTheDocument();

    // Filtre « Toutes » : retour des trois bascules.
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    const reselected = screen.getByRole('group', { name: 'Listes de cadeaux' });
    expect(within(reselected).getByRole('button', { name: 'Idées pour Maya' })).toBeInTheDocument();
    expect(within(reselected).getByRole('button', { name: 'Anniversaire de Noé' })).toBeInTheDocument();
    expect(within(reselected).getByRole('button', { name: 'Noël des Voisins' })).toBeInTheDocument();
  });

  it('« Créer une liste » en haut ouvre le même formulaire en ligne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await screen.findByText('Atelier céramique');
    expect(screen.queryByLabelText('Nom de la nouvelle liste')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer une liste' }));
    expect(await screen.findByLabelText('Nom de la nouvelle liste')).toBeInTheDocument();
    expect(screen.getByLabelText('Visibilité de la liste')).toBeInTheDocument();
  });

  it('partage la liste depuis son niveau, pas depuis chaque idée', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille (sans badge accolé).
    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    // G-06-21 : sélecteur étiqueté en petites bascules, actions de liste en
    // une seule rangée d'outils.
    expect(screen.getByText(/Sélection de la liste de cadeaux/)).toBeInTheDocument();
    const selector = screen.getByRole('group', { name: 'Listes de cadeaux' });
    for (const toggle of within(selector).getAllByRole('button')) {
      expect(toggle).toHaveClass('min-h-9');
    }
    const toolbar = screen.getByRole('group', { name: 'Actions de la liste' });
    expect(within(toolbar).getByRole('button', { name: /Partager/ })).toBeInTheDocument();

    // Un seul bouton Partager au niveau de la liste, aucun sur les cartes d'idées.
    expect(screen.getByRole('button', { name: /Partager/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Partager|Gérer/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Partager/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Le partage porte sur toute la liste/)).toBeInTheDocument();

    // G-06-21 : aucune option de permission — cocher suffit, la part créée
    // est `reservation` (D-04 amendée).
    expect(within(dialog).queryByLabelText(/Permission pour/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /Lina Martin/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    // Le partage porte sur la liste : le bouton unique passe en « Gérer »,
    // toujours dans la même rangée d'outils.
    await waitFor(() => expect(screen.getByRole('button', { name: /Gérer/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Partager/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Actions de la liste' })).getByRole('button', { name: /Gérer/ }),
    ).toBeInTheDocument();
  });

  it('cache les réservations des autres pour le propriétaire de la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Anniversaire de Noé',
      }),
    );

    // « Casque pour le vélo » est réservé par Thomas : le propriétaire ne le voit pas.
    expect(screen.getByText('Casque pour le vélo')).toBeInTheDocument();
    expect(screen.queryByText(/Réservé par/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Acheté')).not.toBeInTheDocument();
  });

  it('masque au membre courant l’idée qui lui est destinée (repli UX de la surprise serveur)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(await screen.findByRole('tab', { name: /Idées/ }));

    // « Montre connectée » vise Camille via sa fiche contact liée : invisible dans sa session.
    expect(await screen.findByText('Stage de poterie')).toBeInTheDocument();
    expect(screen.getByText('Coffret thés du monde')).toBeInTheDocument();
    expect(screen.queryByText('Montre connectée')).not.toBeInTheDocument();
    // L’idée liée à Maya affiche sa prochaine occasion, pas un trou.
    expect(screen.getAllByText(/Prochaine occasion/).length).toBeGreaterThan(0);
  });

  it('promouvoir une idée crée un article avec idea_id renseigné', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(await screen.findByRole('tab', { name: /Idées/ }));
    await user.click(await screen.findByRole('button', { name: 'Ajouter l’idée Stage de poterie à une liste' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/deviendra un article lié/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Liste destinataire'), 'gift-list-noe');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));

    await waitFor(async () => {
      const linked = await data.list<GiftItemRow>('gift_items', { idea_id: 'idea-2' });
      expect(linked).toHaveLength(1);
      expect(linked[0].list_id).toBe('gift-list-noe');
      expect(linked[0].name).toBe('Stage de poterie');
    });

    // L’article apparaît dans sa liste, l’idée reste dans son onglet.
    // findBy (06-07) : la fermeture du dialogue attend le refetch snapshot,
    // allongé par la fusion inter-foyers — getBy synchrone = course critique.
    await user.click(await screen.findByRole('tab', { name: /Listes/ }));
    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Anniversaire de Noé',
      }),
    );
    expect(await screen.findByText('Stage de poterie')).toBeInTheDocument();
  });

  it('nextOccasion rabat le 29 février sans le faire disparaître (miroir 0006)', () => {
    // Helper clamp partagé : année non bissextile → 28 février.
    expect(nextBirthdayDate('2020-02-29', '2023-02-01')).toBe('2023-02-28');
    // Le relais cadeaux ne réintroduit pas le trou historique (null).
    expect(nextAnniversary('2020-02-29', '2023-02-01')).toBe('2023-02-28');
    expect(nextAnniversary('pas-une-date', '2023-02-01')).toBeNull();
    // Année bissextile suivante : le 29 février est conservé.
    expect(
      nextIdeaOccasion({ gifteeContactId: 'contact-x' }, [{ id: 'contact-x', birth_date: '2020-02-29' }], '2023-06-01'),
    ).toBe('2024-02-29');
    // Sans contact daté : aucune occasion, pas d’erreur.
    expect(nextIdeaOccasion({ gifteeContactId: null }, [], '2023-06-01')).toBeNull();
  });

  it('panneau partage : Générer puis Régénérer, code brut masqué après navigation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Partager/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Aucun code actif. Générez-en un pour inviter.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Générer un code' }));
    expect(await within(dialog).findByText(TEST_CODE)).toBeInTheDocument();
    expect(within(dialog).getByText(/\/invitation\/cadeau\?code=/)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Régénérer' })).toBeInTheDocument());

    // Fermer = naviguer : le code brut ne survit pas au dialogue.
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Partager/ }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByText(TEST_CODE)).not.toBeInTheDocument();
    expect(
      within(reopened).getByText('Code actif créé ailleurs : régénérez pour l’afficher sur cet appareil.'),
    ).toBeInTheDocument();
  });
});

describe('toGiftItem — tenue anonyme (CR-01)', () => {
  const rowBase: GiftItemRow = {
    id: 'gift-x',
    list_id: 'gift-list-noe',
    household_id: 'hh-1',
    name: 'Puzzle',
    price: 20,
    comment: null,
    photo_url: null,
    url: null,
    reserved_by: null,
    reserved_by_name: null,
    purchased: false,
    idea_id: null,
    created_at: '2026-01-01T00:00:00Z',
  };
  const members = [
    {
      id: 'member-thomas',
      household_id: 'hh-1',
      user_id: 'user-thomas',
      display_name: 'Thomas',
      avatar_url: null,
      color_tag: 'amber',
      role: 'membre',
      created_at: '2026-01-01T00:00:00Z',
    } as HouseholdMemberRow,
  ];

  it('une tenue anonyme vaut réservé sans exposer le nom déclaré (D-07)', () => {
    const item = toGiftItem({ ...rowBase, reserved_by_name: 'Mamie' }, members);

    expect(item.heldAnonymously).toBe(true);
    expect(item.reservedBy).toBeNull();
    // Le nom déclaré ne sort jamais du mapping : badge « Réservé » seul.
    expect(item.reservedByName).toBeNull();
    expect(item.purchased).toBe(false);
  });

  it('un nom déclaré blanc ne vaut pas tenue (miroir du CHECK base)', () => {
    const item = toGiftItem({ ...rowBase, reserved_by_name: '   ' }, members);

    expect(item.heldAnonymously).toBe(false);
  });

  it('une réserve membre garde son auteur résolu, sans tenue anonyme', () => {
    const item = toGiftItem({ ...rowBase, reserved_by: 'member-thomas' }, members);

    expect(item.heldAnonymously).toBe(false);
    expect(item.reservedBy).toBe('member-thomas');
    expect(item.reservedByName).toBe('Thomas');
  });

  it('un article libre ne porte ni auteur ni tenue', () => {
    const item = toGiftItem(rowBase, members);

    expect(item.heldAnonymously).toBe(false);
    expect(item.reservedBy).toBeNull();
    expect(item.reservedByName).toBeNull();
  });
});

describe('CadeauxPage — liste étrangère (G-06-1b-bis, G-06-24)', () => {
  it('la liste rejointe n’a plus de badge d’origine ; Quitter est un danger sous le sélecteur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    expect(await screen.findByText('Bougie parfumée')).toBeInTheDocument();
    expect(screen.getByText('Plante verte')).toBeInTheDocument();
    // G-06-24 : le filtre Partagées porte le sens — aucun badge accolé.
    expect(screen.queryByText(/Liste partagée/)).not.toBeInTheDocument();
    // Lecture seule : ni partage, ni ajout, ni suppression de liste.
    expect(screen.queryByRole('button', { name: /Partager|Gérer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une idée' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer la liste/ })).not.toBeInTheDocument();
    // Quitter : bouton danger rouge, hors de la barre d'outils générique.
    const quit = screen.getByRole('button', { name: /Quitter la liste/ });
    expect(quit).toHaveClass('bg-coral-soft');
    const toolbar = screen.getByRole('group', { name: 'Actions de la liste' });
    expect(within(toolbar).queryByRole('button', { name: /Quitter/ })).not.toBeInTheDocument();
  });

  it('tenue attribuée sur liste étrangère : « Réservé » sans auteur, interrupteur actif (G-06-23)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    const card = (await screen.findByText('Plante verte')).closest('li');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    // Le nom attribué ne sort jamais vers le rendu (D-07).
    expect(screen.queryByText('Sam Voisin')).not.toBeInTheDocument();
    expect(scope.getByText('Réservé')).toBeInTheDocument();
    // G-06-23 : l'interrupteur reste actif même sur article tenu — le
    // serveur tranche (libération de sa tenue, ou 409 à tenue d'autrui).
    expect(scope.getByRole('switch', { name: 'Acheté' })).toBeEnabled();
    expect(mockReserveMember).not.toHaveBeenCalled();
  });

  it('réserve sur liste étrangère : un seul appel serveur, sans reserved_by', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    const card = (await screen.findByText('Bougie parfumée')).closest('li');
    await user.click(within(card as HTMLElement).getByRole('switch', { name: 'Acheté' }));

    expect(mockReserveMember).toHaveBeenCalledTimes(1);
    expect(mockReserveMember).toHaveBeenCalledWith('gift-4');
    expect(await screen.findByText('Article réservé.')).toBeInTheDocument();
  });

  it('bascule sur tenue : libération serveur, toast, badge effacé après refetch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    const card = (await screen.findByText('Plante verte')).closest('li');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    await user.click(scope.getByRole('switch', { name: 'Acheté' }));

    expect(mockReserveMember).toHaveBeenCalledTimes(1);
    expect(mockReserveMember).toHaveBeenCalledWith('gift-5');
    expect(await screen.findByText('Réservation libérée.')).toBeInTheDocument();
    // Le refetch invalide le cliché : la tenue effacée, le badge suit.
    await waitFor(() => expect(scope.queryByText('Réservé')).not.toBeInTheDocument());
    const rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-5' });
    expect(rows).toHaveLength(1);
    expect(rows[0].purchased).toBe(false);
    expect(rows[0].reserved_by).toBeNull();
    expect(rows[0].reserved_by_name).toBeNull();
  });

  it('tenue d’autrui : le 409 affiche la notice établie et relit, sans auteur', async () => {
    const user = userEvent.setup();
    mockReserveMember.mockRejectedValueOnce(new Error('Cet article est déjà réservé.'));
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    const card = (await screen.findByText('Plante verte')).closest('li');
    expect(card).not.toBeNull();
    await user.click(within(card as HTMLElement).getByRole('switch', { name: 'Acheté' }));

    expect(mockReserveMember).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Cet article est déjà réservé, choisissez-en un autre.'),
    ).toBeInTheDocument();
    // Aucun auteur ne fuite : le nom attribué reste masqué (D-07).
    expect(screen.queryByText('Sam Voisin')).not.toBeInTheDocument();
    // La tenue est toujours là après le refetch.
    expect(screen.getByText('Réservé')).toBeInTheDocument();
  });
});

describe('CadeauxPage — quitter une liste étrangère (G-06-1c)', () => {
  it('le bouton ne paraît que sur les listes étrangères, jamais sur celles du foyer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // Liste privée du foyer : aucun départ proposé.
    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitter/ })).not.toBeInTheDocument();

    // Liste non privée du foyer (gestionnaire) : toujours aucun départ.
    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Anniversaire de Noé',
      }),
    );
    expect(await screen.findByText('Casque pour le vélo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitter/ })).not.toBeInTheDocument();

    // Liste étrangère : le bouton paraît, sans badge d'origine (G-06-24).
    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );
    expect(await screen.findByText('Bougie parfumée')).toBeInTheDocument();
    expect(screen.queryByText(/Liste partagée/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quitter la liste/ })).toBeInTheDocument();
  });

  it('la modale annonce le sort exact : liste partie, noms gardés, lien rejouable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Quitter la liste/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Quitter « Noël des Voisins »')).toBeInTheDocument();
    expect(within(dialog).getByText(/Vos réservations à votre nom sont conservées/)).toBeInTheDocument();
    expect(within(dialog).getByText(/rejoindre à nouveau/)).toBeInTheDocument();
    expect(mockLeaveList).not.toHaveBeenCalled();
  });

  it('annuler ne fait rien : aucun appel, liste toujours là', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Quitter la liste/ }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockLeaveList).not.toHaveBeenCalled();
    expect(screen.getByText('Bougie parfumée')).toBeInTheDocument();
    expect(screen.queryByText(/Liste partagée/)).not.toBeInTheDocument();
  });

  it('confirmer appelle une fois le serveur puis la liste disparaît', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Quitter la liste/ }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitter' }));

    expect(mockLeaveList).toHaveBeenCalledTimes(1);
    expect(mockLeaveList).toHaveBeenCalledWith('gift-list-voisins');
    expect(await screen.findByText('Liste quittée. Vos réservations à votre nom sont conservées.')).toBeInTheDocument();
    // La part supprimée, le refetch sort la liste de la vue : son contenu…
    await waitFor(() => expect(screen.queryByText('Bougie parfumée')).not.toBeInTheDocument());
    // …ni bascule au sélecteur (repli sur la première liste du foyer).
    const selector = screen.getByRole('group', { name: 'Listes de cadeaux' });
    expect(within(selector).queryByRole('button', { name: 'Noël des Voisins' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitter/ })).not.toBeInTheDocument();
  });

  it('oracle 404 : la copie « lien ne passe plus » est dite, la liste reste', async () => {
    const user = userEvent.setup();
    mockLeaveList.mockRejectedValueOnce(
      new Error('Ce lien ne passe plus. Demandez un nouveau lien à l’organisateur pour rejoindre à nouveau.'),
    );
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Quitter la liste/ }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitter' }));

    expect(mockLeaveList).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Ce lien ne passe plus/)).toBeInTheDocument();
    expect(screen.getByText('Bougie parfumée')).toBeInTheDocument();
  });
});

describe('CadeauxPage — décocher Reçu (G-06-20)', () => {
  it('décocher Reçu sur un article affiché réservé ouvre la confirmation, jamais un effacement silencieux', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Anniversaire de Noé',
      }),
    );

    // « Casque pour le vélo » porte une tenue membre (Thomas) sans drapeau :
    // aucun badge, interrupteur éteint, aucune libération proposée.
    const card = screen.getByText('Casque pour le vélo').closest('li');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.queryByText('Réservé')).not.toBeInTheDocument();
    expect(scope.getByRole('switch', { name: 'Reçu' })).not.toBeChecked();
    expect(scope.queryByRole('button', { name: /Libérer/ })).not.toBeInTheDocument();

    // Cocher : simple suivi, aucune modale, la tenue de Thomas est conservée.
    await user.click(scope.getByRole('switch', { name: 'Reçu' }));
    await waitFor(() => expect(scope.getByText('Réservé')).toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    let rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-2' });
    expect(rows).toHaveLength(1);
    expect(rows[0].purchased).toBe(true);
    expect(rows[0].reserved_by).toBe(DEMO_MEMBERS.thomas);

    // G-06-22 : aucun bouton de libération autonome — le décochage
    // « Reçu » sur un article affiché réservé est la seule voie (modale),
    // et l'ancien libellé n'existe plus nulle part.
    expect(scope.queryByRole('button', { name: /Libérer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Libérer$/ })).not.toBeInTheDocument();

    // Décocher : la confirmation existante s'ouvre ; le drapeau reste posé
    // (la modale masque le fond aux lecteurs d'écran, donc preuve par la
    // base : `purchased` intact → l'interrupteur reste visuellement coché).
    await user.click(scope.getByRole('switch', { name: 'Reçu' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Libérer « Casque pour le vélo »')).toBeInTheDocument();
    rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-2' });
    expect(rows[0].purchased).toBe(true);

    // Annuler : rien ne bouge — drapeau, badge et tenue intacts.
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(scope.getByRole('switch', { name: 'Reçu' })).toBeChecked();
    rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-2' });
    expect(rows[0].purchased).toBe(true);
    expect(rows[0].reserved_by).toBe(DEMO_MEMBERS.thomas);
    expect(scope.getByText('Réservé')).toBeInTheDocument();

    // Décocher puis confirmer : l'unique charge de libération efface les
    // deux formes d'auteur ET le drapeau — une seule voie de sortie.
    await user.click(scope.getByRole('switch', { name: 'Reçu' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Libérer la réserve' }));
    expect(await screen.findByText('Réservation libérée.')).toBeInTheDocument();
    await waitFor(() => expect(scope.queryByText('Réservé')).not.toBeInTheDocument());
    expect(scope.getByRole('switch', { name: 'Reçu' })).not.toBeChecked();
    rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-2' });
    expect(rows[0].purchased).toBe(false);
    expect(rows[0].reserved_by).toBeNull();
    expect(rows[0].reserved_by_name).toBeNull();
  });

  it('cocher Reçu sur un article libre : simple suivi sans modale, aucun auteur inventé', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // Liste privée de Camille : « Atelier céramique » est libre.
    const card = (await screen.findByText('Atelier céramique')).closest('li');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByRole('switch', { name: 'Reçu' })).not.toBeChecked();

    await user.click(scope.getByRole('switch', { name: 'Reçu' }));

    // Aucune modale : le drapeau se pose, le badge suit, aucun auteur touché.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(scope.getByText('Réservé')).toBeInTheDocument());
    const rows = await data.list<GiftItemRow>('gift_items', { id: 'gift-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].purchased).toBe(true);
    expect(rows[0].reserved_by).toBeNull();
    expect(rows[0].reserved_by_name).toBeNull();
  });

  it('G-06-22 : aucun bouton « Libérer la réserve » nulle part, jamais sur liste étrangère', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(
      within(await screen.findByRole('group', { name: 'Listes de cadeaux' })).getByRole('button', {
        name: 'Noël des Voisins',
      }),
    );

    // « Plante verte » est tenue (badge affiché) mais la liste est étrangère :
    // état visible, aucune libération proposée.
    const card = (await screen.findByText('Plante verte')).closest('li');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText('Réservé')).toBeInTheDocument();
    expect(scope.queryByRole('button', { name: /Libérer/ })).not.toBeInTheDocument();
  });
});
