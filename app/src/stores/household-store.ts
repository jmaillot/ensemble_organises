import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { HouseholdMemberRow, HouseholdRow, Role } from '@/types';

interface HouseholdState {
  householdId: string | null;
  householdName: string;
  householdColor: string;
  members: HouseholdMemberRow[];
  /** Membre correspondant à l'utilisateur connecté (profil géré par un parent). */
  currentMemberId: string;
  /** Ville du profil : elle pilote le widget météo de l'accueil. */
  city: string;
  setCity: (city: string) => void;
  setHousehold: (household: HouseholdRow, members: HouseholdMemberRow[], currentMemberId?: string) => void;
  switchHousehold: (householdId: string, householdName: string) => void;
  setMembers: (members: HouseholdMemberRow[]) => void;
  reset: () => void;
}

const initialState = {
  householdId: null,
  householdName: 'Foyer Martin',
  householdColor: 'accent',
  members: [] as HouseholdMemberRow[],
  currentMemberId: DEMO_MEMBERS.camille,
  city: 'Lyon',
};

export const useHouseholdStore = create<HouseholdState>()(
  persist(
    (set) => ({
      ...initialState,
      setHousehold: (household, members, currentMemberId) =>
        set({
          householdId: household.id,
          householdName: household.name,
          householdColor: household.avatar_color,
          members,
          currentMemberId: currentMemberId ?? members[0]?.id ?? '',
        }),
      switchHousehold: (householdId, householdName) => set({ householdId, householdName }),
      setMembers: (members) => set({ members }),
      setCity: (city) => set({ city }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'ensemble-organises-household',
      version: 1,
      partialize: (state) => ({
        householdId: state.householdId,
        householdName: state.householdName,
        householdColor: state.householdColor,
        members: state.members,
        currentMemberId: state.currentMemberId,
        city: state.city,
      }),
    },
  ),
);

/** Foyer de démonstration utilisé quand aucun backend n'est configuré. */
export const DEMO_HOUSEHOLD_ID_EXPORT = DEMO_HOUSEHOLD_ID;

export function useCurrentMember(): HouseholdMemberRow | null {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId) ?? state.members[0] ?? null);
}

export function useMembers(): HouseholdMemberRow[] {
  return useHouseholdStore((state) => state.members);
}

export function useIsAdmin(): boolean {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role === 'admin');
}

export function useMemberName(): string {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.display_name ?? 'Camille Martin');
}

export function useMemberRole(): Role {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role ?? 'membre');
}
