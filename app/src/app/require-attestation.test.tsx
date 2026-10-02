import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_USER_ID } from '@/lib/data/seed';
import { useSessionStore } from '@/stores/session-store';
import { RequireAttestation } from './router';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => ({}),
    },
  },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return { ...actual, data: getLocalAdapter(), isLocalMode: true };
});

function signIn() {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: DEMO_USER_ID,
      email: 'camille.martin@example.fr',
      displayName: 'Camille Martin',
      avatarUrl: null,
      provider: 'email',
    },
  });
}

function renderGate() {
  return renderWithProviders(
    <RequireAttestation>
      <p>Contenu protégé</p>
    </RequireAttestation>,
    { route: '/accueil' },
  );
}

describe('RequireAttestation', () => {
  beforeEach(async () => {
    useSessionStore.setState({ status: 'guest', user: null });
    const adapter = getLocalAdapter();
    await adapter.update('profiles', DEMO_USER_ID, { age_attested_at: null });
  });

  it('bloque tant que la case n’est pas cochée, puis laisse passer', async () => {
    const user = userEvent.setup();
    signIn();
    renderGate();

    expect(await screen.findByText('Une dernière étape avant de commencer')).toBeInTheDocument();
    // Le dialogue est modal et non contournable : le bouton reste inactif.
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
    const adapter = getLocalAdapter();
    const rows = (await adapter.list('profiles', { id: DEMO_USER_ID })) as { age_attested_at: string | null }[];
    expect(rows[0]?.age_attested_at).not.toBeNull();
  });

  it('laisse passer un compte déjà attesté', async () => {
    const adapter = getLocalAdapter();
    await adapter.update('profiles', DEMO_USER_ID, { age_attested_at: new Date().toISOString() });
    signIn();
    renderGate();

    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
    expect(screen.queryByText('Une dernière étape avant de commencer')).not.toBeInTheDocument();
  });

  it('refuser déconnecte', async () => {
    const user = userEvent.setup();
    signIn();
    renderGate();

    await screen.findByText('Une dernière étape avant de commencer');
    await user.click(screen.getByRole('button', { name: /Refuser/ }));
    expect(useSessionStore.getState().status).toBe('guest');
  });
});
