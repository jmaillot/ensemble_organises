import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
import GuestTripPage from './guest-trip-page';

const { mockGetSession } = vi.hoisted(() => {
  const mockGetSession = vi.fn(
    async (): Promise<{ data: { session: { access_token: string } | null } }> => ({ data: { session: null } }),
  );
  return { mockGetSession };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: mockGetSession } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';
const TICKET = 'ticket-brut-invite-abcdef1234567890';

const LINK_VIEW = {
  trip: {
    id: 'trip-1',
    name: 'Week-end à Lisbonne',
    destination: 'Lisbonne',
    startDate: '2027-04-12',
    endDate: '2027-04-18',
    coverPhoto: '/assets/lisbonne.jpg',
    notes: 'Un voyage à préparer tranquillement.',
    isClosed: false,
  },
  guest: null,
};

const GUEST_VIEW = {
  trip: { ...LINK_VIEW.trip },
  guest: { display_name: 'Mamie' },
};

/** Stub orienté action : link-view / redeem-guest / guest-view / join. */
function stubGuestFetch() {
  const seen: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seen.push(body);
      if (body.action === 'link-view') return { ok: true, json: async () => LINK_VIEW };
      if (body.action === 'redeem-guest') {
        return { ok: true, json: async () => ({ trip_id: 'trip-1', guest_ticket: TICKET }) };
      }
      if (body.action === 'guest-view') {
        return body.ticket === TICKET
          ? { ok: true, json: async () => GUEST_VIEW }
          : { ok: false, json: async () => ({ error: 'Ticket invalide.' }) };
      }
      if (body.action === 'join') return { ok: true, json: async () => ({ trip_id: 'trip-1', already_member: false }) };
      return { ok: false, json: async () => ({ error: 'action inconnue' }) };
    }),
  );
  return seen;
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/voyage" element={<GuestTripPage />} />
    </Routes>,
    { route: code ? `/invitation/voyage?code=${code}` : '/invitation/voyage', withHousehold: false },
  );
}

describe('GuestTripPage — invitation voyage (D-09)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useSessionStore.setState({ status: 'guest', user: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test');
  });

  it('sans compte : visite par lien, puis pseudonyme → ticket persisté → vue invitée', async () => {
    stubGuestFetch();
    const user = userEvent.setup();
    try {
      renderGuest(CODE);

      // Vue anonyme par lien : identité du voyage, aucun contrôle de membre.
      expect(await screen.findByText('Lisbonne')).toBeInTheDocument();
      expect(screen.getByText('Un voyage à préparer tranquillement.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Modifier|Figer|Quitter/ })).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre pseudonyme/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Rejoindre comme invité' }));

      // Ticket persisté sous la clé namespacée, vue invitée personnalisée.
      expect(await screen.findByText('Invité : Mamie.')).toBeInTheDocument();
      expect(localStorage.getItem('eo:trip:ticket:trip-1')).toBe(TICKET);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code révoqué : oracle honnête, sans détail d’état', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'Ce code est invalide.' }) })),
    );
    try {
      renderGuest(CODE);

      expect(await screen.findByText(/Ce lien ne passe plus/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('avec compte : rejoindre mène à la fiche, sans lier reste invité', async () => {
    stubGuestFetch();
    const user = userEvent.setup();
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: 'user-camille', email: 'camille.martin@example.fr', displayName: 'Camille', avatarUrl: null, provider: 'email' },
    });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-test' } } });
    try {
      renderGuest(CODE);

      expect(await screen.findByText(/deux façons de participer/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Rejoindre via mon compte' }));

      expect(await screen.findByText(/Voyage rejoint/)).toBeInTheDocument();
      const open = screen.getByRole('link', { name: 'Ouvrir le voyage' });
      expect(open.getAttribute('href')).toBe('/voyages/trip-1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
