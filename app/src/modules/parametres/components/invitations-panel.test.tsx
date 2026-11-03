import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { addDays, formatMediumDate, todayIso } from '@/lib/utils';
import { InvitationsPanel } from './invitations-panel';
import type { InviteTokenSummary } from '@/types';

const { listMock, createMock, revokeAllMock, revokeOneMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  revokeAllMock: vi.fn(),
  revokeOneMock: vi.fn(),
}));

// Les accès Edge sont sous contrôle ; le reste du module `invites`
// (rappel localStorage, validité) reste réel pour éprouver le vrai contrat.
vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return {
    ...actual,
    listInviteTokens: listMock,
    createInviteToken: createMock,
    revokeInviteToken: revokeAllMock,
    revokeInviteTokenById: revokeOneMock,
  };
});

const dayIso = (offset: number) => addDays(todayIso(), offset);

const token = (tokenId: string, overrides: Partial<InviteTokenSummary> = {}): InviteTokenSummary => ({
  isActive: true,
  expiresAt: `${dayIso(20)}T12:00:00.000Z`,
  maxUses: 10,
  useCount: 0,
  createdAt: `${dayIso(-1)}T10:00:00.000Z`,
  ...overrides,
  tokenId,
});

function renderPanel() {
  return renderWithProviders(<InvitationsPanel />);
}

describe('InvitationsPanel — formulaire de création durci (D-14, Pitfall 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listMock.mockResolvedValue([token('tok-new')]);
  });

  it('pré-remplit 30 jours et 10 utilisations, sans hint « Laissez vide »', () => {
    renderPanel();

    expect(screen.getByLabelText(/Expire le/)).toHaveValue(addDays(todayIso(), 30));
    expect(screen.getByLabelText(/Utilisations maximum/)).toHaveValue(10);
    expect(screen.queryByText(/Laissez vide/)).not.toBeInTheDocument();
  });

  it('refuse une expiration vide sans appeler l’Edge', async () => {
    const user = userEvent.setup();
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Expire le/), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));

    expect(await screen.findByText('Choisissez une date dans le futur.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuse une expiration dans le passé sans appeler l’Edge', async () => {
    const user = userEvent.setup();
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Expire le/), { target: { value: '2020-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));

    expect(await screen.findByText('Choisissez une date dans le futur.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuse moins d’une utilisation sans appeler l’Edge', async () => {
    const user = userEvent.setup();
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Utilisations maximum/), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));

    expect(await screen.findByText('Indiquez au moins 1 utilisation.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('soumet une création valide avec expiration future et affiche le toast pluriel', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      token: 'BRUT-affiche-une-seule-fois',
      expiresAt: `${dayIso(30)}T23:59:00.000Z`,
      maxUses: 10,
      householdId: 'household-martin',
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Générer un nouveau lien' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        expiresAt: `${addDays(todayIso(), 30)}T23:59:00.000Z`,
        maxUses: 10,
      });
    });
    expect(await screen.findByText('Nouveau lien généré. Les liens précédents restent actifs jusqu’à leur expiration ou leur révocation.')).toBeInTheDocument();
    // Le brut s'affiche une fois (bloc de rappel), la liste est rafraîchie.
    expect(await screen.findByText('BRUT-affiche-une-seule-fois')).toBeInTheDocument();
    expect(await screen.findByText('Liens actifs')).toBeInTheDocument();
  });
});

describe('InvitationsPanel — liste des liens actifs (D-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listMock.mockResolvedValue([
      token('tok-old', { createdAt: `${dayIso(-9)}T10:00:00.000Z`, expiresAt: `${dayIso(25)}T12:00:00.000Z` }),
      token('tok-new'),
      token('tok-exhausted', { useCount: 10, createdAt: `${dayIso(-5)}T10:00:00.000Z` }),
    ]);
  });

  it('affiche la liste triée par création décroissante, sans jamais montrer le token brut', async () => {
    const { container } = renderPanel();

    await screen.findByText('Liens actifs');
    // Le brut n'existe côté client qu'au rappel local : aucune donnée de la
    // liste ne doit le contenir (T-31-09, assertion négative).
    expect(screen.queryByText('BRUT-secret-jamais-affiche')).not.toBeInTheDocument();
    // Tri décroissant : la création du plus récent précède celle du plus ancien.
    const text = container.textContent ?? '';
    const newest = text.indexOf(formatMediumDate(dayIso(-1)));
    const oldest = text.indexOf(formatMediumDate(dayIso(-9)));
    expect(newest).toBeGreaterThan(-1);
    expect(oldest).toBeGreaterThan(newest);
    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });
  });

  it('ne présente « Actif » que pour un lien réellement utilisable', async () => {
    renderPanel();

    // tok-exhausted : is_active = true en base, mais épuisé → « Révoqué ».
    expect(await screen.findByText('10 / 10 utilisations')).toBeInTheDocument();
    expect(screen.getAllByText('Actif')).toHaveLength(2);
    expect(screen.getAllByText('Révoqué')).toHaveLength(1);
  });

  it('révoque un lien individuellement après confirmation, sans toucher aux autres', async () => {
    const user = userEvent.setup();
    renderPanel();

    const exhaustedCell = await screen.findByText('10 / 10 utilisations');
    const row = exhaustedCell.closest('div');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Révoquer' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Révoquer ce lien ?')).toBeInTheDocument();

    // Annuler : rien ne part.
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(revokeOneMock).not.toHaveBeenCalled();
    expect(revokeAllMock).not.toHaveBeenCalled();

    // Confirmer : seul l'id visé est révoqué.
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Révoquer' }));
    const reopened = await screen.findByRole('alertdialog');
    await user.click(within(reopened).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => {
      expect(revokeOneMock).toHaveBeenCalledWith('tok-exhausted');
    });
    expect(revokeAllMock).not.toHaveBeenCalled();
  });

  it('conserve la révocation globale existante derrière sa modale', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Liens actifs');
    await user.click(screen.getByRole('button', { name: 'Révoquer tous les liens' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Révoquer tous les liens ?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Révoquer' }));

    await waitFor(() => {
      expect(revokeAllMock).toHaveBeenCalled();
    });
    expect(revokeOneMock).not.toHaveBeenCalled();
  });

  it('affiche l’empty state après la migration des jetables', async () => {
    listMock.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText('Aucun lien d’invitation actif')).toBeInTheDocument();
    expect(screen.getByText('Générez un lien pour inviter un nouveau membre.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Générer un lien' })).toBeInTheDocument();
    expect(screen.queryByText('Liens actifs')).not.toBeInTheDocument();
  });
});
