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
  ardoise: { id: 'ardoise-1', name: 'Week-end', description: null, cover_url: null, is_active: true },
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

function mockViewFetch(calls: string[], ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const body = (JSON.parse((init?.body as string) ?? '{}') as { action?: string; code?: string }) ?? {};
      calls.push(`${body.action ?? '?'}`);
      if (!ok) return { ok: false, json: async () => ({ error: 'Lien invalide.' }) };
      return { ok: true, json: async () => viewPayload };
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
