import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';

/**
 * Régression du 27/09/2026 : après un ménage manuel côté serveur (foyers
 * supprimés, base restaurée), le `currentMemberId` persisté localement
 * désignait un membre qui n'existait plus. `loadHousehold` le conservait tel
 * quel (`store.currentMemberId || members[0]?.id`), et chaque écriture au nom
 * de ce fantôme était refusée par `validate_member_refs` (23514) — dont la
 * création de liste de cadeaux. Le foyer, lui, se chargeait bien : le
 * symptôme ressemblait à un problème de droits, pas à un identifiant périmé.
 */

const memberships = [
  { id: 'm1', household_id: 'h1', user_id: 'u1', display_name: 'Alice', role: 'admin' },
] as HouseholdMemberRow[];

const households = [{ id: 'h1', name: 'Foyer', avatar_color: 'accent' }] as HouseholdRow[];

const listMock = vi.fn(async (table: string) => {
  if (table === 'household_members') return memberships;
  if (table === 'households') return households;
  return [];
});

vi.mock('@/lib/data', () => ({
  data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const { loadHousehold } = await import('./session-store');
const { useHouseholdStore } = await import('./household-store');
const { useSessionStore } = await import('./session-store');

describe('loadHousehold et membre courant', () => {
  beforeEach(() => {
    listMock.mockClear();
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
  });

  it('conserve le membre persisté quand le serveur le renvoie', async () => {
    useHouseholdStore.setState({ currentMemberId: 'm1' });

    const active = await loadHousehold();

    expect(active?.id).toBe('h1');
    expect(useHouseholdStore.getState().householdId).toBe('h1');
    expect(useHouseholdStore.getState().currentMemberId).toBe('m1');
  });

  it('retombe sur le premier membre quand le persisté est un fantôme', async () => {
    useHouseholdStore.setState({ currentMemberId: 'membre-supprime-cote-serveur' });

    await loadHousehold();

    expect(useHouseholdStore.getState().householdId).toBe('h1');
    expect(useHouseholdStore.getState().currentMemberId).toBe('m1');
  });

  it('désigne la ligne liée à l’utilisateur connecté, pas la première ni la persistée', async () => {
    // Régression : un second compte du même foyer (membre existant, session
    // persistée d'un autre membre ou premier de liste) répondait au nom
    // d'autrui, et la RLS refusait l'insertion (`messages` : « new row
    // violates row-level security policy »).
    const duo = [
      { id: 'm1', household_id: 'h1', user_id: 'u1', display_name: 'Alice', role: 'admin' },
      { id: 'm2', household_id: 'h1', user_id: 'u2', display_name: 'Bob', role: 'membre' },
    ] as HouseholdMemberRow[];
    listMock
      .mockImplementationOnce(async () => duo)
      .mockImplementationOnce(async () => households);
    useHouseholdStore.setState({ currentMemberId: 'm1' });
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: 'u2', email: 'bob@example.fr', displayName: 'Bob', avatarUrl: null, provider: 'email' },
    });

    await loadHousehold();

    expect(useHouseholdStore.getState().currentMemberId).toBe('m2');
  });
});
