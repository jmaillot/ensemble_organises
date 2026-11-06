import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { HouseholdRow } from '@/types';

/**
 * Bootstrap Supabase tolérant au hors-ligne (plan 35-04, gaps §1.4/§1.5 de
 * 35-VERIFICATION.md). Avant le correctif, tout rejet de la chaîne
 * `getSession` → `applySession` → `loadHousehold` appelait `fail()` et
 * affichait l'écran d'erreur WR-04 : le routeur ne montait jamais, ni la vue
 * visée depuis le cache (§1.4, session valide), ni l'écran « connexion
 * requise » (D-07, §1.5, sans session) — les gardes du routeur n'étaient
 * jamais atteintes. Le contrat demandé :
 *
 *  - hors-ligne + session valide persistée + foyer persisté → `ready`, sans
 *    erreur, statut authentifié, foyer marqué chargé (test D) ;
 *  - hors-ligne + bootstrap rejeté (rafraîchissement impossible) → chemin
 *    invité, `ready` sans erreur, JAMAIS authentifiée (test E) ;
 *  - en ligne + backend en échec → l'erreur est posée (écran WR-04 inchangé,
 *    test F).
 */

const auth = {
  getSession: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
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

// Toutes les lectures réseau rejettent : c'est le scénario hors-ligne froid.
const listMock = vi.fn(async () => {
  throw new TypeError('Échec de la requête réseau');
});
vi.mock('@/lib/data', () => ({ data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

const { useAuthBootstrap } = await import('../use-auth');
const { useSessionStore } = await import('@/stores/session-store');
const { useHouseholdStore } = await import('@/stores/household-store');

const members = [
  { id: 'm1', household_id: 'h1', user_id: user.id, display_name: 'Alice Martin', role: 'admin' },
];
const household = { id: 'h1', name: 'Foyer Martin', avatar_color: 'accent' } as HouseholdRow;

/** Sème le foyer persisté — l'état restauré par le persist zustand au démarrage. */
function semerFoyerPersiste() {
  useHouseholdStore.getState().setHousehold(household, members as never);
}

describe('useAuthBootstrap — hors-ligne (35-04)', () => {
  beforeEach(() => {
    auth.getSession.mockReset();
    listMock.mockClear();
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
    useHouseholdStore.getState().reset();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    useHouseholdStore.getState().reset();
  });

  it('monte l’application hors-ligne avec session valide et foyer persisté (test D)', async () => {
    semerFoyerPersiste();
    onlineManager.setOnline(false);
    auth.getSession.mockResolvedValue({
      data: { session: { user, expires_at: Date.now() / 1000 + 3600 } },
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().householdLoaded).toBe(true);
    expect(useHouseholdStore.getState().householdId).toBe('h1');
  });

  it('retombe invitée hors-ligne quand le bootstrap rejette — jamais authentifiée (test E)', async () => {
    onlineManager.setOnline(false);
    // Le rafraîchissement auto de supabase-js échoue hors-ligne : `getSession`
    // rejette. La session doit tomber sur le chemin invité (T-35-06).
    auth.getSession.mockRejectedValue(new TypeError('Échec de la requête réseau'));

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
    expect(useSessionStore.getState().status).toBe('guest');
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('pose l’erreur en ligne malgré un foyer persisté — écran WR-04 inchangé (test F)', async () => {
    semerFoyerPersiste();
    onlineManager.setOnline(true);
    auth.getSession.mockResolvedValue({
      data: { session: { user, expires_at: Date.now() / 1000 + 3600 } },
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).not.toBeNull();
    // La session ne paraît PAS établie quand l'amorçage a échoué.
    expect(useSessionStore.getState().householdLoaded).toBe(false);
  });
});
