import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { findActiveDeletionRequest, GdprDeletePanel, isDemandeActive } from './gdpr-delete-panel';
import type { AccountDeletionRequestRow } from '../types';

/**
 * Conventions du jumeau structurel gdpr-export-panel.test.tsx : supabase
 * mocké par vi.hoisted, libellés français de boutons cherchés par rôle
 * accessible. Le panneau orchestre rpc → Edge (api.ts) — les deux sont
 * mockés, et l'ORDRE des appels est prouvé (le RPC avant l'Edge, D-02).
 */
const { mockRpc, mockFrom, mockInvoke, mockGetUser } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('@/hooks/use-auth', () => ({
  useSessionUser: () => ({ id: 'user-1', email: 'camille@test.local' }),
}));

function demande(overrides: Partial<AccountDeletionRequestRow>): AccountDeletionRequestRow {
  return {
    id: 'demande-1',
    status: 'demandee',
    created_at: new Date('2026-10-20T10:00:00Z').toISOString(),
    purge_due_at: new Date('2026-11-19T10:00:00Z').toISOString(),
    rappel_envoye: false,
    ...overrides,
  };
}

function mockDemandes(rows: AccountDeletionRequestRow[]) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      order: () => Promise.resolve({ data: rows, error: null }),
    }),
  }));
}

function renderPanel() {
  return renderWithProviders(<GdprDeletePanel />, { route: '/parametres' });
}

describe('GdprDeletePanel', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('affiche l’état de la demande active avec l’horloge et l’annulation', async () => {
    mockDemandes([demande({})]);
    renderPanel();

    expect(await screen.findByText(/suppression programmée le/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler ma demande' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Demander la suppression de mon compte' }),
    ).not.toBeInTheDocument();
  });

  it('confirme avant la demande destructive, puis orchestre RPC puis Edge dans cet ordre', async () => {
    const user = userEvent.setup();
    mockDemandes([]);
    mockRpc.mockResolvedValue({ data: 'demande-1', error: null });
    mockInvoke.mockResolvedValue({
      data: { mode: 'compte', request_id: 'demande-1', sessions_revoked: true, email_sent: true },
      error: null,
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Demander la suppression de mon compte' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // RGDP-01 : la modale prévient AVANT le clic que les sessions meurent.
    expect(screen.getByText(/sessions seront coupées immédiatement/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Oui, supprimer mon compte' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('request_account_deletion', { p_user_id: 'user-1' });
      expect(mockInvoke).toHaveBeenCalledWith('household-delete', { body: { mode: 'compte' } });
    });
    // L'ordre RPC → Edge est celui de l'api (le RPC enregistre, l'Edge coupe).
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockInvoke.mock.invocationCallOrder[0]);
    expect(await screen.findByText(/Demande enregistrée/i)).toBeInTheDocument();
  });

  it('signale honnêtement un échec de l’étape Edge après un RPC réussi (D-02)', async () => {
    const user = userEvent.setup();
    mockDemandes([]);
    mockRpc.mockResolvedValue({ data: 'demande-1', error: null });
    mockInvoke.mockResolvedValue({ data: null, error: new Error('raté'), response: undefined });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Demander la suppression de mon compte' }));
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer mon compte' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('annonce les sessions coupées SEULEMENT quand sessions_revoked est true (WR-04)', async () => {
    const user = userEvent.setup();
    mockDemandes([]);
    mockRpc.mockResolvedValue({ data: 'demande-1', error: null });
    mockInvoke.mockResolvedValue({
      data: { mode: 'compte', request_id: 'demande-1', sessions_revoked: true, email_sent: true },
      error: null,
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Demander la suppression de mon compte' }));
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer mon compte' }));

    expect(await screen.findByText(/vos sessions ont été coupées/i)).toBeInTheDocument();
  });

  it('invite à la déconnexion manuelle quand sessions_revoked est false, sans erreur brute (WR-04, T-27-18)', async () => {
    const user = userEvent.setup();
    mockDemandes([]);
    mockRpc.mockResolvedValue({ data: 'demande-1', error: null });
    mockInvoke.mockResolvedValue({
      data: {
        mode: 'compte',
        request_id: 'demande-1',
        sessions_revoked: false,
        email_sent: false,
        email_error: 'relais SMTP refusé: 550 details',
      },
      error: null,
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Demander la suppression de mon compte' }));
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer mon compte' }));

    expect(await screen.findByText(/déconnectez-vous manuellement/i)).toBeInTheDocument();
    // Plus jamais le succès mensonger : le panneau ne dit PAS que les
    // sessions ont été coupées quand l'Edge a répondu sessions_revoked:false.
    expect(screen.queryByText(/sessions ont été coupées/i)).not.toBeInTheDocument();
    // T-27-18 : l'erreur serveur brute (email_error) n'atteint jamais le DOM.
    expect(screen.queryByText(/relais SMTP refusé/i)).not.toBeInTheDocument();
  });

  it('ne promet jamais la restauration des sessions à l’annulation (IN-02)', async () => {
    mockDemandes([demande({})]);
    renderPanel();

    await screen.findByText(/suppression programmée le/i);
    // L'annulation restaure nom et photo ; la reconnexion est à l'utilisateur.
    expect(screen.queryByText(/restaure votre nom, votre photo et vos sessions/i)).not.toBeInTheDocument();
  });

  it('annule la demande active par le RPC de restauration D-05', async () => {
    const user = userEvent.setup();
    mockDemandes([demande({})]);
    mockRpc.mockResolvedValue({ data: null, error: null });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Annuler ma demande' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('cancel_account_deletion', { p_user_id: 'user-1' });
    });
  });
});

describe('findActiveDeletionRequest / isDemandeActive', () => {
  it('rend la première demande vivante et ignore les états terminaux', () => {
    expect(isDemandeActive('demandee')).toBe(true);
    expect(isDemandeActive('rappellee')).toBe(true);
    expect(isDemandeActive('annulee')).toBe(false);
    expect(isDemandeActive('purgee')).toBe(false);
    const active = demande({});
    expect(
      findActiveDeletionRequest([demande({ id: 'a', status: 'annulee' }), active, demande({ id: 'c' })]),
    ).toBe(active);
    expect(findActiveDeletionRequest([])).toBeNull();
  });
});
