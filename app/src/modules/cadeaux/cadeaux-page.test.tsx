import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { data } from '@/lib/data';
import { nextBirthdayDate } from '@/modules/anniversaires/types';
import { renderWithProviders } from '@/test/render';
import type { GiftItemRow } from '@/types';
import CadeauxPage from './cadeaux-page';
import { nextAnniversary, nextIdeaOccasion } from './types';

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

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchGiftListInviteSummary: (...args: [string]) => mockSummary(...args),
    createGiftListInviteCode: (...args: [string]) => mockCreate(...args),
    revokeGiftListInviteCode: (...args: [string]) => mockRevoke(...args),
  };
});

beforeEach(() => {
  codeActive = false;
  vi.clearAllMocks();
});

describe('CadeauxPage', () => {
  it('signale la liste privée et partage une idée, qui passe en « Gérer »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    // La liste sélectionnée est la liste privée de Camille.
    expect(await screen.findByText('Atelier céramique')).toBeInTheDocument();
    expect(screen.getByText('Liste privée')).toBeInTheDocument();
    expect(screen.getByText('Ne partagez pas cette liste : elle est votre surprise.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Le partage porte sur toute la liste/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /Lina Martin/ }));
    await user.selectOptions(within(dialog).getByLabelText('Permission pour Lina Martin'), 'reservation');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    // Le partage porte sur la liste : les deux idées passent en « Gérer ».
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Gérer' })).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });

  it('cache les réservations des autres pour le propriétaire de la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CadeauxPage />, { route: '/cadeaux' });

    await user.click(await screen.findByRole('button', { name: 'Anniversaire de Noé' }));

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
    await user.click(screen.getByRole('tab', { name: /Listes/ }));
    await user.click(await screen.findByRole('button', { name: 'Anniversaire de Noé' }));
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
    await user.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Aucun code actif. Générez-en un pour inviter.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Générer un code' }));
    expect(await within(dialog).findByText(TEST_CODE)).toBeInTheDocument();
    expect(within(dialog).getByText(/\/invitation\/cadeau\?code=/)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Régénérer' })).toBeInTheDocument());

    // Fermer = naviguer : le code brut ne survit pas au dialogue.
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByText(TEST_CODE)).not.toBeInTheDocument();
    expect(
      within(reopened).getByText('Code actif créé ailleurs : régénérez pour l’afficher sur cet appareil.'),
    ).toBeInTheDocument();
  });
});
