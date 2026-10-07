import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { HouseholdMemberRow } from '@/types';
import { GiftShareDialog } from './gift-share-dialog';
import type { GiftList, GiftShare, GiftShareInput } from '../types';

/** État du résumé d'invitation servi par le stub (G-06-1d). */
let inviteState = { hasCode: false, isActive: false };
const mockSummary = vi.fn(async (_listId: string) => ({
  listId: 'gift-list-test',
  isActive: inviteState.isActive,
  hasCode: inviteState.hasCode,
  expiresAt: null,
  maxUses: 20,
  useCount: inviteState.isActive ? 1 : 0,
}));
const mockCreate = vi.fn(async (listId: string) => {
  inviteState = { hasCode: true, isActive: true };
  return { code: 'CODECADEAU22CHARS012345', expiresAt: null, maxUses: 20, listId };
});
const mockRevoke = vi.fn(async (_listId: string) => {
  inviteState = { hasCode: false, isActive: false };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchGiftListInviteSummary: (...args: [string]) => mockSummary(...args),
    createGiftListInviteCode: (...args: [string]) => mockCreate(...args),
    revokeGiftListInviteCode: (...args: [string]) => mockRevoke(...args),
  };
});

const LIST: GiftList = {
  id: 'gift-list-test',
  name: 'Noël Mamie',
  visibility: 'partagee',
  ownerMemberId: 'member-camille',
  ownerName: 'Camille',
  ownerColorTag: 'accent',
  shareCount: 0,
  isOwned: true,
  isPrivate: false,
  isForeign: false,
  originLabel: null,
};

const MEMBERS = [
  {
    id: 'member-camille',
    household_id: 'hh-1',
    user_id: 'user-camille',
    display_name: 'Camille Martin',
    avatar_url: null,
    color_tag: 'accent',
    role: 'admin',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-lina',
    household_id: 'hh-1',
    user_id: 'user-lina',
    display_name: 'Lina Martin',
    avatar_url: null,
    color_tag: 'amber',
    role: 'membre',
    created_at: '2026-01-01T00:00:00Z',
  },
] as HouseholdMemberRow[];

function renderDialog(existingShares: GiftShare[] = []) {
  const onSubmit = vi.fn<(listId: string, shares: GiftShareInput[]) => void>();
  const onEnsureLectureShare = vi.fn(async (_listId: string, _email: string) => {});
  renderWithProviders(
    <GiftShareDialog
      open
      onOpenChange={() => {}}
      list={LIST}
      members={MEMBERS}
      existingShares={existingShares}
      onSubmit={onSubmit}
      onEnsureLectureShare={onEnsureLectureShare}
    />,
  );
  return { onSubmit };
}

async function openDialog() {
  const dialog = await screen.findByRole('dialog');
  return dialog;
}

describe('GiftShareDialog — indépendance partages / lien (G-06-1d)', () => {
  beforeEach(() => {
    inviteState = { hasCode: false, isActive: false };
    vi.clearAllMocks();
  });

  it('explique que retirer un partage ne révoque pas le lien', async () => {
    renderDialog();
    const dialog = await openDialog();
    expect(within(dialog).getByText(/ne révoque pas le lien/)).toBeInTheDocument();
  });

  it('zéro partage + code actif : rappel explicite, pas de coupe silencieuse', async () => {
    inviteState = { hasCode: true, isActive: true };
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    // Le résumé est chargé : le panneau code dit « actif ».
    expect(await within(dialog).findByText(/Partage actif/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByText(/existe encore/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('révoquer depuis le rappel coupe le lien et resynchronise le panneau', async () => {
    inviteState = { hasCode: true, isActive: true };
    renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    await within(dialog).findByText(/Partage actif/);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));
    await within(dialog).findByText(/existe encore/);

    await user.click(within(dialog).getByRole('button', { name: 'Révoquer le lien' }));

    // Même assistant que le panneau code, avec l'identifiant de la liste.
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('gift-list-test'));
    // Résumé rafraîchi : le panneau dit « aucun code », le rappel disparaît.
    expect(await within(dialog).findByText(/Aucun code actif/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/existe encore/)).not.toBeInTheDocument();
  });

  it('garder le lien et enregistrer : coupe explicite des partages, lien intact', async () => {
    inviteState = { hasCode: true, isActive: true };
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    await within(dialog).findByText(/Partage actif/);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));
    await within(dialog).findByText(/existe encore/);

    await user.click(within(dialog).getByRole('button', { name: 'Garder le lien et enregistrer' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('gift-list-test', []);
    // Le lien n'a pas été touché : l'assistant de révocation n'a pas servi.
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('zéro partage sans code : enregistrement silencieux, sans rappel', async () => {
    inviteState = { hasCode: false, isActive: false };
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    await within(dialog).findByText(/Aucun code actif/);

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('gift-list-test', []);
    expect(within(dialog).queryByText(/existe encore/)).not.toBeInTheDocument();
  });

  it('zéro partage + code coupé : enregistrement silencieux, sans rappel', async () => {
    inviteState = { hasCode: true, isActive: false };
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    await within(dialog).findByText(/Partage coupé/);

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('gift-list-test', []);
    expect(within(dialog).queryByText(/existe encore/)).not.toBeInTheDocument();
  });

  it('champ e-mail redondant supprimé (G-06-1e) : aucun champ « Inviter un proche »', async () => {
    renderDialog();
    const dialog = await openDialog();
    expect(within(dialog).queryByLabelText(/Inviter un proche/)).not.toBeInTheDocument();
    // Le bloc d'envoi par e-mail (panneau code) reste : c'est lui qui crée la part.
    expect(within(dialog).getByLabelText(/E-mail du destinataire/)).toBeInTheDocument();
  });

  it('partages non vides + code actif : enregistrement direct, sans rappel', async () => {
    inviteState = { hasCode: true, isActive: true };
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    const dialog = await openDialog();
    await within(dialog).findByText(/Partage actif/);

    await user.click(within(dialog).getByRole('checkbox', { name: /Lina Martin/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le partage' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('gift-list-test', [
      { memberId: 'member-lina', email: null, permission: 'lecture' },
    ]);
    // G-06-1e : aucune part e-mail fabriquée par le formulaire — chaque part
    // porte un memberId et un email nul (la création e-mail vit dans
    // redeem/send-email, jamais dans la soumission membres).
    const shares = onSubmit.mock.calls[0]?.[1] ?? [];
    expect(shares.length).toBeGreaterThan(0);
    for (const share of shares) {
      expect(share.memberId).not.toBeNull();
      expect(share.email).toBeNull();
    }
    expect(within(dialog).queryByText(/existe encore/)).not.toBeInTheDocument();
  });
});
