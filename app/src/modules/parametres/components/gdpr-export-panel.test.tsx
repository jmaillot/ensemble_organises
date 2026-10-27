import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { GdprExportPanel } from './gdpr-export-panel';
import type { GdprExportJobRow } from '../types';

/**
 * Conventions du jumeau structurel household-delete-panel.test.tsx :
 * supabase mocké par vi.hoisted, libellés français de boutons cherchés par
 * rôle accessible. Ici le panneau passe par `supabase.rpc` (déclencheur) et
 * `supabase.from('gdpr_export_jobs')` (historique RLS) plutôt que par
 * `functions.invoke` — les deux sont mockés sur le même modèle.
 */
const { mockRpc, mockFrom, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
  },
}));

/** Fabrique le chaînage `from('gdpr_export_jobs').select(…).order(…)` attendu par api.ts. */
function mockJobs(jobs: Partial<GdprExportJobRow>[]) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      order: () => Promise.resolve({ data: jobs, error: null }),
    }),
  }));
}

function job(overrides: Partial<GdprExportJobRow>): Partial<GdprExportJobRow> {
  return {
    id: overrides.id ?? `job-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pret',
    storage_path: 'uid-1/job-1.zip',
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderPanel() {
  return renderWithProviders(<GdprExportPanel />, { route: '/parametres' });
}

describe('GdprExportPanel', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockCreateSignedUrl.mockReset();
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signe.example/archives/gdpr/telechargement' },
      error: null,
    });
  });

  it('déclenche l’export par le RPC serveur et affiche l’état « en attente »', async () => {
    const user = userEvent.setup();
    // Premier chargement : aucun export passé. Après le clic, la relecture
    // (invalidation de la query) rend la ligne « en attente » créée par le RPC.
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }));
    mockJobs([job({ status: 'en_attente', storage_path: null })]);
    mockRpc.mockResolvedValue({ data: null, error: null });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Demander mon export' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('request_gdpr_export');
    });
    expect(await screen.findByText('En attente')).toBeInTheDocument();
  });

  it('affiche l’état « en cours » avec la durée écoulée — jamais de pourcentage', async () => {
    const ninetySecondsAgo = new Date(Date.now() - 90_000).toISOString();
    mockJobs([job({ status: 'en_cours', storage_path: null, created_at: ninetySecondsAgo })]);
    renderPanel();

    expect(await screen.findByText('En cours')).toBeInTheDocument();
    expect(screen.getByText(/durée écoulée/i)).toBeInTheDocument();
    // D-03 : trois états + durée, jamais un pourcentage factice.
    expect(document.body.textContent).not.toContain('%');
    expect(screen.queryByRole('button', { name: 'Demander mon export' })).not.toBeInTheDocument();
  });

  it('propose le téléchargement au clic sur un lien signé de 24 h maximum', async () => {
    const user = userEvent.setup();
    mockJobs([job({ status: 'pret', storage_path: 'uid-1/job-1.zip' })]);
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Télécharger' }));

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('uid-1/job-1.zip', 86400);
    // D-04/RGEX-01 : l'URL signée vit dans le handler, pas affichée dans le DOM.
    expect(document.body.textContent).not.toContain('https://signe.example');
  });

  it('affiche l’échec avec son message et un bouton de nouvelle tentative', async () => {
    const user = userEvent.setup();
    mockJobs([job({ status: 'echec', storage_path: null, error: 'La création de l’archive a échoué.' })]);
    mockRpc.mockResolvedValue({ data: null, error: null });
    renderPanel();

    expect(await screen.findByText('Échec')).toBeInTheDocument();
    expect(screen.getByText('La création de l’archive a échoué.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('request_gdpr_export');
    });
  });

  it('se rend pour un membre non administrateur — aucune garde isAdmin (D-08)', async () => {
    mockJobs([]);
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Demander mon export' })).toBeInTheDocument();
    expect(screen.getByText(/Mes données/i)).toBeInTheDocument();
  });

  it('liste l’historique des exports passés, les plus récents d’abord (D-07)', async () => {
    const now = Date.now();
    mockJobs([
      job({ id: 'recent', status: 'pret', created_at: new Date(now - 60_000).toISOString() }),
      job({ id: 'moyen', status: 'echec', created_at: new Date(now - 86_400_000).toISOString() }),
      job({ id: 'ancien', status: 'pret', created_at: new Date(now - 2 * 86_400_000).toISOString() }),
    ]);
    renderPanel();

    await screen.findByText('Historique des exports');
    const rows = screen.getAllByTestId('gdpr-history-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Prêt');
    expect(rows[1].textContent).toContain('Échec');
    expect(rows[2].textContent).toContain('Prêt');
  });

  it('n’affiche pas de bouton mort : au-delà de 24 h, « Lien expiré » + voie de regénération', async () => {
    const user = userEvent.setup();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockJobs([job({ status: 'pret', storage_path: 'uid-1/vieux-job.zip', created_at: twoDaysAgo })]);
    mockRpc.mockResolvedValue({ data: null, error: null });
    renderPanel();

    await screen.findByText('Historique des exports');
    expect(screen.getByText('Lien expiré')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Télécharger' })).not.toBeInTheDocument();

    // La voie de regénération relance un cycle complet (D-02/D-06).
    await user.click(screen.getByRole('button', { name: 'Régénérer un export' }));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('request_gdpr_export');
    });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('n’affiche pas de téléchargement sur un job prêt sans storage_path', async () => {
    mockJobs([job({ status: 'pret', storage_path: null })]);
    renderPanel();

    await screen.findByText('Historique des exports');
    expect(screen.queryByRole('button', { name: 'Télécharger' })).not.toBeInTheDocument();
  });
});
