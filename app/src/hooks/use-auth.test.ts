import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

/**
 * Régression : après une inscription ou une connexion réussie, l'application
 * revenait à l'écran de connexion.
 *
 * La session était obtenue, mais le statut du store restait celui d'un invité.
 * Deux raisons, cumulées :
 *
 *   1. l'événement `SIGNED_IN` de supabase-js appelait `refreshUser`, qui ne pose
 *      que l'utilisateur — `signIn` est le seul chemin qui passe le statut à
 *      `authenticated` ;
 *   2. les actions `signInWithEmail` / `signUpWithEmail` rendaient la main sans
 *      rien appliquer, donc la navigation partait avant que l'événement d'état
 *      n'ait été traité. La garde de route redirigeait alors vers `/connexion`.
 *
 * Le symptôme était d'autant plus trompeur qu'un simple rechargement de la page
 * fonctionnait : le bootstrap passe par `getSession`, qui, lui, appliquait la
 * session.
 */

const listeners: Array<(event: string, session: { user: User } | null) => void> = [];

const auth = {
  getSession: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn((callback: (event: string, session: { user: User } | null) => void) => {
    listeners.push(callback);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
};

const user: User = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'alice@example.fr',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Alice Martin' },
} as unknown as User;

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth },
  isSupabaseConfigured: true,
  supabaseUrl: 'https://api.exemple.fr',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseFunctionsBase: 'https://api.exemple.fr/functions/v1',
}));

// Le chargement du foyer interroge l'adaptateur de données : on l'observe sans
// le laisser décider du statut, qui est l'objet du test.
const listMock = vi.fn(async () => [] as unknown[]);
vi.mock('@/lib/data', () => ({ data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

const { signInWithEmail, signUpWithEmail, applySession } = await import('./use-auth');
const { useSessionStore } = await import('@/stores/session-store');

describe("chemin d'authentification", () => {
  beforeEach(() => {
    listeners.length = 0;
    auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    auth.signUp.mockReset();
    auth.signInWithPassword.mockReset();
    listMock.mockClear();
    useSessionStore.setState({ status: 'guest', user: null });
  });

  it("établit la session après une inscription confirmée automatiquement", async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: { user } }, error: null });

    await signUpWithEmail('alice@example.fr', 'mot-de-passe');

    const state = useSessionStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user?.id).toBe(user.id);
    expect(state.user?.displayName).toBe('Alice Martin');
  });

  it('établit la session après une connexion', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });

    await signInWithEmail('alice@example.fr', 'mot-de-passe');

    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it("refuse d'établir une session quand l'adresse reste à confirmer", async () => {
    // GoTrue crée le compte mais ne rend aucune session : c'est le cas sans
    // autoconfirm. Naviguer quand même ferait rebondir la garde, et
    // l'utilisateur croirait que son inscription a échoué alors qu'elle a
    // réussi.
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });

    await expect(signUpWithEmail('alice@example.fr', 'mot-de-passe')).rejects.toThrow(/confirmer votre adresse/i);
    expect(useSessionStore.getState().status).toBe('guest');
  });

  it("établit la session sur l'événement SIGNED_IN", async () => {
    await applySession(user);
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('conserve le fournisseur du compte, y compris pour un SSO', async () => {
    const google = { ...user, app_metadata: { provider: 'google' } } as unknown as User;

    await applySession(google);

    expect(useSessionStore.getState().user?.provider).toBe('google');
  });

  it('ne recharge pas le foyer à chaque renouvellement de jeton', async () => {
    await applySession(user);
    const appelsApresPremiereApplication = listMock.mock.calls.length;

    // Deuxième événement pour la même session, comme un TOKEN_REFRESHED.
    await applySession(user);

    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(listMock.mock.calls.length).toBe(appelsApresPremiereApplication);
  });

  it("établit la session quand l'événement d'état apporte une session", async () => {
    // Le bootstrap est monté pour de vrai : c'est lui qui enregistre
    // l'écouteur d'état. L'événement est ensuite émis à la main, comme le fait
    // supabase-js après une inscription ou une connexion.
    const { useAuthBootstrap } = await import('./use-auth');
    const { unmount } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('guest'));
    expect(listeners.length).toBeGreaterThan(0);

    for (const listener of listeners) listener('SIGNED_IN', { user });

    // L'ancien code appelait `refreshUser`, qui ne pose que l'utilisateur : le
    // statut restait celui d'un invité et la garde redirigeait vers /connexion.
    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'));
    expect(useSessionStore.getState().user?.id).toBe(user.id);
    unmount();
  });

  it('déconnecte sur SIGNED_OUT', async () => {
    await applySession(user);

    useSessionStore.getState().signOut();

    expect(useSessionStore.getState().status).toBe('guest');
    expect(useSessionStore.getState().user).toBeNull();
  });
});
