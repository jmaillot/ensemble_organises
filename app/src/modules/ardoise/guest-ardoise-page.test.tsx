import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import GuestArdoisePage from './guest-ardoise-page';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'code-partage-12345678901234';

const viewPayload = {
  ardoise: { id: 'ardoise-1', name: 'Week-end', description: null, coverUrl: null, is_active: true },
  guest: null,
  expenses: [
    {
      id: 'e1',
      title: 'Courses',
      amount: 60,
      date: '2026-10-01',
      paidByName: 'Camille',
      participants: [{ name: 'Camille', share: 30 }],
    },
  ],
  settlement: {
    ardoise_id: 'ardoise-1',
    household_id: 'household-1',
    balances: [{ kind: 'membre', participant_id: 'm1', display_name: 'Camille', amount: 30 }],
    settlements: [],
    generated_at: '2026-10-03T10:00:00.000Z',
  },
};

function mockViewFetch(calls: string[], ok = true, payload: unknown = viewPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const body = (JSON.parse((init?.body as string) ?? '{}') as { action?: string; code?: string }) ?? {};
      calls.push(`${body.action ?? '?'}`);
      if (!ok) return { ok: false, json: async () => ({ error: 'Lien invalide.' }) };
      return { ok: true, json: async () => payload };
    }),
  );
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/ardoise" element={<GuestArdoisePage />} />
    </Routes>,
    { route: code ? `/invitation/ardoise?code=${code}` : '/invitation/ardoise', withHousehold: false },
  );
}

describe('GuestArdoisePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('affiche l’ardoise directement depuis le lien, sans nom ni ticket', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(screen.getByText('Participer ?')).toBeInTheDocument();
      expect(screen.queryByLabelText(/pseudonyme/i)).not.toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * Le cas qui manquait à la phase 19 : le cas existant ne posait que
   * `coverUrl: null`, donc une couverture cassée passait inaperçue. La charge
   * utile invitée porte une URL **servable** (signée par le serveur), jamais le
   * chemin de bucket — la page doit la rendre telle quelle, sans rien
   * reconstruire.
   */
  it('rend la couverture servable de la charge utile, pas un chemin reconstruit', async () => {
    const calls: string[] = [];
    const signed = 'https://api.example/storage/v1/object/sign/household-media/foyer-1/ardoises/plage.webp?token=abc.def';
    mockViewFetch(calls, true, {
      ...viewPayload,
      ardoise: { ...viewPayload.ardoise, coverUrl: signed },
    });
    try {
      renderGuest(CODE);
      const cover = await screen.findByAltText('Couverture de Week-end');
      // La page rend la valeur de la charge utile TELLE QUELLE : ni un chemin
      // de bucket, ni une URL re-signée côté client (impossible pour un invité
      // anonyme) ne produiraient ce `src`.
      expect(cover).toHaveAttribute('src', signed);
      // L'assertion qui dit la PROPRIÉTÉ, et non un motif : la valeur est
      // servable parce qu'elle est absolue. Un chemin de bucket ne commence pas
      // par `https://`. (On ne peut pas interdire `household-media/…` dans le
      // `src` : une URL signée de Supabase contient légitimement ce chemin dans
      // son propre segment — AGENTS.md §2.7D.6.)
      expect(cover.getAttribute('src')).toMatch(/^https:\/\//);
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propose le formulaire sans code, puis ouvre le lien saisi', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(null);
      await user.type(screen.getByLabelText(/Code d’invitation/), CODE);
      await user.click(screen.getByRole('button', { name: 'Voir l’ardoise' }));
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien révoqué : message et retour au formulaire', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, false);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
      expect(calls).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
