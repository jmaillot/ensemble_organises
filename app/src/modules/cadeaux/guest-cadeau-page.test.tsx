import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
import { demoProfile } from '@/lib/data/seed';
import GuestCadeauPage from './guest-cadeau-page';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';

const GUEST_VIEW = {
  listId: 'gift-list-1',
  listName: 'Noël Mamie',
  items: [
    { id: 'gift-item-1', name: 'Foulard', price: 29, comment: null, reserved: false },
    { id: 'gift-item-2', name: 'Théière', price: 45, comment: 'Bleue', reserved: true },
  ],
};

function mockRedeemFetch(ok = true, payload: unknown = { list_id: 'gift-list-1', already_shared: false }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      if (!ok) return { ok: false, json: async () => ({ error: 'code invalide' }) };
      return { ok: true, json: async () => payload };
    }),
  );
}

/** Stub orienté action pour la branche invitée (guest-view / guest-reserve). */
function mockGuestFetch(handlers: {
  view?: unknown | Error;
  reserve?: unknown | Error | ((body: Record<string, unknown>) => unknown | Error);
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const outcome =
        body.action === 'guest-view'
          ? handlers.view ?? GUEST_VIEW
          : typeof handlers.reserve === 'function'
            ? handlers.reserve(body)
            : (handlers.reserve ?? { itemId: 'gift-item-1', alreadyReserved: false });
      if (outcome instanceof Error) return { ok: false, json: async () => ({ error: outcome.message }) };
      return { ok: true, json: async () => outcome };
    }),
  );
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/cadeau" element={<GuestCadeauPage />} />
    </Routes>,
    { route: code ? `/invitation/cadeau?code=${code}` : '/invitation/cadeau', withHousehold: false },
  );
}

describe('GuestCadeauPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useSessionStore.setState({ status: 'guest', user: null });
  });

  it('sans session : nom déclaré puis réserve, sans compte', async () => {
    mockGuestFetch({});
    const user = userEvent.setup();
    try {
      renderGuest(CODE);

      // La liste et les états réservés seuls (jamais d'auteur).
      expect(await screen.findByText(/Noël Mamie/)).toBeInTheDocument();
      expect(screen.getByText('Foulard')).toBeInTheDocument();
      expect(screen.getByText('Théière')).toBeInTheDocument();
      expect(screen.queryByText(/Thomas/)).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/réservé au nom de Mamie/)).toBeInTheDocument();
      // Mémoire cosmétique : le nom est mémorisé pour la pré-remplissage.
      expect(localStorage.getItem(`cadeaux:guest-name:${CODE}`)).toBe('Mamie');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('réserve idempotente à nom égal : succès affiché comme succès', async () => {
    mockGuestFetch({ reserve: { itemId: 'gift-item-1', alreadyReserved: true } });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Mamie');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/déjà réservé à ce nom/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('conflit à nom différent : message distinct de l’oracle', async () => {
    mockGuestFetch({ reserve: new Error('Cet article est déjà réservé.') });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText('Foulard')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Votre nom/), 'Papi');
      await user.click(screen.getByRole('button', { name: 'Réserver' }));

      expect(await screen.findByText(/vient de réserver cet article/)).toBeInTheDocument();
      expect(screen.queryByText(/ne passe plus/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code invalide : message oracle et retour au formulaire', async () => {
    mockGuestFetch({ view: new Error('Ce code est invalide.') });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);

      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('en session : échange le code et propose d’ouvrir les cadeaux', async () => {
    mockRedeemFetch();
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/Partage activé/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ouvrir les cadeaux/ })).toHaveAttribute('href', '/cadeaux');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien révoqué en session : message et retour au formulaire', async () => {
    mockRedeemFetch(false);
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...demoProfile, email: 'bob-cal@example.fr' } as never,
    });
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
