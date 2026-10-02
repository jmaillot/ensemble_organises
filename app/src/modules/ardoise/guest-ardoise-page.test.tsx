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
  guest: { display_name: 'Hugo' },
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

function mockFetch(calls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const action = (JSON.parse((init?.body as string) ?? '{}') as { action?: string }).action ?? '?';
      calls.push(action);
      if (action === 'redeem-guest') {
        return { ok: true, json: async () => ({ ardoise_id: 'ardoise-1', guest_ticket: 'TICKET-BRUT-1234567890' }) };
      }
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

  it('échange le code une fois puis affiche l’ardoise en lecture seule', async () => {
    const calls: string[] = [];
    mockFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(screen.getByLabelText(/Code d’invitation/)).toHaveValue(CODE);

      await user.type(screen.getByLabelText(/pseudonyme/), 'Hugo');
      await user.click(screen.getByRole('button', { name: 'Voir l’ardoise' }));

      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(screen.getByText('Participer ?')).toBeInTheDocument();
      expect(calls.filter((action) => action === 'redeem-guest')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('réutilise le ticket au retour, sans rééchanger ni reconsommer', async () => {
    const calls: string[] = [];
    mockFetch(calls);
    localStorage.setItem(`eo:ardoise:guest-link:${CODE}`, 'ardoise-1');
    localStorage.setItem('eo:ardoise:ticket:ardoise-1', 'TICKET-BRUT-1234567890');
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Courses')).toBeInTheDocument();
      expect(calls).toEqual(['guest-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
