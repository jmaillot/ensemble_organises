/**
 * T3 (25-07) — toggleFor : cocher AU NOM d'un enfant, un seul chemin d'écriture.
 *
 * - Le self-toggle existant (toggleOccurrence) délègue désormais au même
 *   markOccurrenceDone avec p_member_id = membre courant : self = cas particulier
 *   de la délégation, non-régression testée.
 * - toggleFor porte les mêmes gardes (foyer, adulte) PLUS l'éligibilité D-06 de
 *   la cible — la garde UI précède l'appel RPC, le serveur 0146 reste l'autorité.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { HouseholdMemberRow } from '@/types';
import { createTestQueryClient } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import type { Routine } from '../types';
import { useRoutines } from './use-routines';

const { markOccurrenceDoneMock } = vi.hoisted(() => ({ markOccurrenceDoneMock: vi.fn() }));

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  markOccurrenceDone: markOccurrenceDoneMock,
}));

const baseMember: HouseholdMemberRow = {
  id: '',
  role: 'membre',
  household_id: 'h-1',
  user_id: null,
  display_name: '',
  avatar_url: null,
  color_tag: 'accent',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const admin = { ...baseMember, id: 'm-camille', role: 'admin', display_name: 'Camille Martin' } as HouseholdMemberRow;
const membre = { ...baseMember, id: 'm-lior', role: 'membre', display_name: 'Lior Martin', color_tag: 'ink' } as HouseholdMemberRow;
const enfantSocle = {
  ...baseMember,
  id: 'm-noe',
  role: 'enfant',
  display_name: 'Noé Martin',
  color_tag: 'amber',
  managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
} as HouseholdMemberRow;
const enfantHorsModule = {
  ...baseMember,
  id: 'm-mae',
  role: 'enfant',
  display_name: 'Maé Martin',
  color_tag: 'coral',
  managed_modules: ['anniversaires'],
} as HouseholdMemberRow;

const routine = { id: 'r-1', name: 'Dents du soir', isDoneToday: false } as unknown as Routine;

let queryClient = createTestQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const seed = (currentMemberId: string) =>
  useHouseholdStore.setState({
    householdId: 'h-1',
    householdName: 'Foyer Martin',
    householdColor: 'accent',
    members: [admin, membre, enfantSocle, enfantHorsModule],
    currentMemberId,
    disabledModules: [],
  });

beforeEach(() => {
  queryClient = createTestQueryClient();
  markOccurrenceDoneMock.mockReset().mockResolvedValue(undefined);
});

describe('use-routines — cocher pour un enfant (D-08/D-11)', () => {
  it('toggleOccurrence (self) délègue au même markOccurrenceDone, p_member_id = membre courant', async () => {
    seed(admin.id);
    const { result } = renderHook(() => useRoutines(), { wrapper });
    await act(async () => {
      await result.current.toggleOccurrence(routine);
    });
    expect(markOccurrenceDoneMock).toHaveBeenCalledWith({
      routineId: 'r-1',
      householdId: 'h-1',
      occurrenceDate: todayIso(),
      completedBy: 'm-camille',
    });
    expect(markOccurrenceDoneMock).toHaveBeenCalledTimes(1);
  });

  it('toggleFor coche AU NOM de l’enfant éligible « routines » — p_member_id = l’enfant', async () => {
    seed(admin.id);
    const { result } = renderHook(() => useRoutines(), { wrapper });
    expect(typeof result.current.toggleFor).toBe('function');
    await act(async () => {
      await result.current.toggleFor(routine, 'm-noe');
    });
    expect(markOccurrenceDoneMock).toHaveBeenCalledWith({
      routineId: 'r-1',
      householdId: 'h-1',
      occurrenceDate: todayIso(),
      completedBy: 'm-noe',
    });
    expect(markOccurrenceDoneMock).toHaveBeenCalledTimes(1);
  });

  it('refuse l’enfant hors-module « routines », et refuse l’enfant acteur', async () => {
    seed(admin.id);
    const adulte = renderHook(() => useRoutines(), { wrapper });
    await expect(adulte.result.current.toggleFor(routine, 'm-mae')).rejects.toThrow();
    expect(markOccurrenceDoneMock).not.toHaveBeenCalled();

    seed('m-noe');
    const enfant = renderHook(() => useRoutines(), { wrapper });
    await expect(enfant.result.current.toggleFor(routine, 'm-noe')).rejects.toThrow('rôle ne permet pas');
    expect(markOccurrenceDoneMock).not.toHaveBeenCalled();
  });
});
