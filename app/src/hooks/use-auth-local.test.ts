import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { HouseholdRow, SessionUser } from '@/types';

/**
 * Preuve de la branche LOCALE de D-07 (IN-07), sans backend.
 *
 * `use-auth.test.ts` mocke `@/lib/supabase/client` avec un client truthy : la
 * branche `!supabase` de `useAuthBootstrap` n'y est donc jamais exercée. Or
 * c'est là que vivait le second site du défaut — quand aucune session n'est
 * persistée, la branche ne posait que `setStatus('guest')` et laissait le foyer
 * persisté en mémoire. Le mock de `vi.mock` étant hissé PAR FICHIER, la seule
 * façon d'exercer la branche locale est un fichier de test dédié : celui-ci.
 *
 * La règle est la même dans les deux modes (D-07) : les deux branches appellent
 * le même `signOut()`. Ce fichier le prouve pour le mode local ; l'autre moitié
 * de la preuve est dans `use-auth.test.ts`.
 */

vi.mock('@/lib/supabase/client', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

// La branche locale n'appelle aucune fonction de l'adaptateur de données : le
// mock garde le test indépendant de Dexie/IndexedDB, comme `use-auth.test.ts`.
vi.mock('@/lib/data', () => ({
  data: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const { useSessionStore } = await import('@/stores/session-store');
const { useHouseholdStore } = await import('@/stores/household-store');
const { useAuthBootstrap } = await import('./use-auth');

const persistedUser: SessionUser = {
  id: 'user-camille',
  email: 'camille.martin@example.fr',
  displayName: 'Camille Martin',
  avatarUrl: null,
  provider: 'email',
};

describe('amorçage en mode local (sans backend)', () => {
  beforeEach(() => {
    // Les deux stores sont persistés et partagés par le module : chaque cas
    // repart d'un état neutre pour ne pas contaminer le suivant.
    useSessionStore.setState({ status: 'initialising', user: null, householdLoaded: false });
    useHouseholdStore.getState().reset();
  });

  it('vide le foyer persisté quand aucune session n’est persistée (D-07)', async () => {
    // Un foyer encore en mémoire, aucun utilisateur : c'est le cas du défaut.
    // Sans la correction, la branche locale posait un statut et laissait le
    // foyer — l'application « invitée » affichait encore ses membres.
    useHouseholdStore.getState().setHousehold(
      { id: 'h-fantome', name: 'Foyer fantôme', avatar_color: 'accent' } as HouseholdRow,
      [],
    );
    useSessionStore.setState({ status: 'initialising', user: null, householdLoaded: false });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(useHouseholdStore.getState().householdId).toBeNull();
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).toBe('guest');
  });

  it('pose le foyer de démonstration quand une session est persistée', async () => {
    // Verrou de non-régression : ce cas reste vert des DEUX côtés du correctif
    // (celui-ci ne touche que la branche « pas de session »). Ce n'est donc pas
    // une preuve du défaut — seulement la garantie que la branche voisine n'a
    // pas été cassée.
    useSessionStore.setState({ status: 'initialising', user: persistedUser, householdLoaded: false });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useHouseholdStore.getState().householdId).toBe(DEMO_HOUSEHOLD_ID);
    expect(useHouseholdStore.getState().members.length).toBeGreaterThan(0);
  });
});
