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
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';

function mockRedeemFetch(ok = true, payload: unknown = { list_id: 'gift-list-1', already_shared: false }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      if (!ok) return { ok: false, json: async () => ({ error: 'code invalide' }) };
      return { ok: true, json: async () => payload };
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
    useSessionStore.setState({ status: 'guest', user: null });
  });

  it('sans session : invite à se connecter avec l’e-mail invité', async () => {
    mockRedeemFetch();
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/Invitation à une liste de cadeaux/)).toBeInTheDocument();
      expect(screen.getByText(/connectez-vous avec l’e-mail invité/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Se connecter/ })).toHaveAttribute('href', '/connexion');
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

  it('lien révoqué : message et retour au formulaire', async () => {
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
