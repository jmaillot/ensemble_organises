import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { data } from '@/lib/data';
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
const mockReserveMember = vi.fn(async (itemId: string) => ({ itemId, alreadyReserved: false }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchGiftListInviteSummary: (...args: [string]) => mockSummary(...args),
    createGiftListInviteCode: (...args: [string]) => mockCreate(...args),
    revokeGiftListInviteCode: (...args: [string]) => mockRevoke(...args),
    reserveMemberGiftItem: (...args: [string]) => mockReserveMember(...args),
  };
});

beforeEach(() => {
  codeActive = false;
  vi.clearAllMocks();
});

describe('CadeauxPage', () => {
  it("filtre les listes par visibilité au lieu d'un badge accolé au nom", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille : aucun badge accolé.
    expect(await screen.findByText('Idées pour Maya')).toBeInTheDocument();
    expect(screen.queryByText('Liste privée')).not.toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    // Plusieurs listes : sélecteur déroulant libellé avec une option par liste.
    const selector = screen.getByLabelText('Sélection de la liste de cadeaux');
    expect(within(selector).getByRole('option', { name: 'Idées pour Maya' })).toBeInTheDocument();
    expect(within(selector).getByRole('option', { name: 'Anniversaire de Noé' })).toBeInTheDocument();

    // Filtre « Foyer » : les deux listes non privées — dont la liste
    // voisine rejointe (G-06-1b-bis), marquée par son badge d'origine.
    await user.click(screen.getByRole('button', { name: 'Foyer' }));
    const foyerSelector = screen.getByLabelText('Sélection de la liste de cadeaux');
    expect(within(foyerSelector).getByRole('option', { name: 'Anniversaire de Noé' })).toBeInTheDocument();
    expect(within(foyerSelector).getByRole('option', { name: 'Noël des Voisins' })).toBeInTheDocument();
    expect(screen.queryByText('Idées pour Maya')).not.toBeInTheDocument();

    // Filtre « Privées » : seule la privée reste, en texte.
    await user.click(screen.getByRole('button', { name: 'Privées' }));
    expect(screen.getByText('Idées pour Maya')).toBeInTheDocument();
    expect(screen.queryByText('Anniversaire de Noé')).not.toBeInTheDocument();

    // Filtre « Toutes » : retour du déroulant avec les trois listes.
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    const reselected = screen.getByLabelText('Sélection de la liste de cadeaux');
    expect(within(reselected).getByRole('option', { name: 'Idées pour Maya' })).toBeInTheDocument();
    expect(within(reselected).getByRole('option', { name: 'Anniversaire de Noé' })).toBeInTheDocument();
    expect(within(reselected).getByRole('option', { name: 'Noël des Voisins' })).toBeInTheDocument();
  });

  it('partage la liste depuis son niveau, pas depuis chaque idée', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille (sans badge accolé).
    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    // Un seul bouton Partager au niveau de la liste, aucun sur les cartes d'idées.
    expect(screen.getByRole('button', { name: /Partager/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Partager|Gérer/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Partager/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Le partage porte sur toute la liste/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /Lina Martin/ }));
    await user.selectOptions(within(dialog).getByLabelText('Permission pour Lina Martin'), 'reservation');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    // Le partage porte sur la liste : le bouton unique passe en « Gérer ».
    await waitFor(() => expect(screen.getByRole('button', { name: /Gérer/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Partager/ })).not.toBeInTheDocument();
  });

  it('cache les réservations des autres pour le propriétaire de la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.selectOptions(
      await screen.findByLabelText('Sélection de la liste de cadeaux'),
      'Anniversaire de Noé',
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
    await user.selectOptions(
      await screen.findByLabelText('Sélection de la liste de cadeaux'),
      'Anniversaire de Noé',
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

describe('CadeauxPage — liste étrangère (G-06-1b-bis)', () => {
  it('la liste rejointe porte son badge d’origine, sans aucune gestion', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.selectOptions(
      await screen.findByLabelText('Sélection de la liste de cadeaux'),
      'Noël des Voisins',
    );

    expect(await screen.findByText('Liste partagée · Les Voisins')).toBeInTheDocument();
    expect(screen.getByText('Bougie parfumée')).toBeInTheDocument();
    expect(screen.getByText('Plante verte')).toBeInTheDocument();
    // Lecture seule : ni partage, ni ajout, ni suppression de liste.
    expect(screen.queryByRole('button', { name: /Partager|Gérer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une idée' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer la liste/ })).not.toBeInTheDocument();
  });

  it('tenue attribuée sur liste étrangère : « Réservé » sans auteur, interrupteur inerte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.selectOptions(
      await screen.findByLabelText('Sélection de la liste de cadeaux'),
      'Noël des Voisins',
    );

    expect(await screen.findByText('Plante verte')).toBeInTheDocument();
    // Le nom attribué ne sort jamais vers le rendu (D-07).
    expect(screen.queryByText('Sam Voisin')).not.toBeInTheDocument();
    expect(screen.getByText('Réservé')).toBeInTheDocument();
    expect(screen.getByLabelText('Acheté (réservé, Plante verte)')).toBeDisabled();
    expect(mockReserveMember).not.toHaveBeenCalled();
  });

  it('réserve sur liste étrangère : un seul appel serveur, sans reserved_by', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.selectOptions(
      await screen.findByLabelText('Sélection de la liste de cadeaux'),
      'Noël des Voisins',
    );

    await user.click(await screen.findByRole('switch', { name: 'Acheté' }));

    expect(mockReserveMember).toHaveBeenCalledTimes(1);
    expect(mockReserveMember).toHaveBeenCalledWith('gift-4');
    expect(await screen.findByText('Article réservé.')).toBeInTheDocument();
  });
});
