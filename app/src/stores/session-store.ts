import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoProfile, demoHousehold, demoMembers, DEMO_MEMBERS } from '@/lib/data/seed';
import { data } from '@/lib/data';
import { useHouseholdStore } from './household-store';
import type { HouseholdMemberRow, HouseholdRow, SessionStatus, SessionUser } from '@/types';

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: (user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
  setStatus: (status: SessionStatus) => void;
  refreshUser: (user: SessionUser) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      status: 'initialising',
      user: null,
      setStatus: (status) => set({ status }),
      refreshUser: (user) => set({ user }),
      signIn: async (user) => {
        set({ user, status: 'authenticated' });
        await loadHousehold();
      },
      signOut: async () => {
        set({ user: null, status: 'guest' });
        useHouseholdStore.getState().reset();
      },
    }),
    { name: 'ensemble-organises-session', version: 1, partialize: (state) => ({ user: state.user }) },
  ),
);

/** Charge le foyer de l'utilisateur et l'enregistre dans le store. */
export async function loadHousehold() {
  const memberships = await data.list<RowWithHousehold>('household_members');
  const store = useHouseholdStore.getState();

  if (memberships.length === 0) {
    store.reset();
    return null;
  }

  const householdIds = [...new Set(memberships.map((membership) => membership.household_id))];
  const households = await Promise.all(
    householdIds.map(async (id) => {
      const rows = await data.list<HouseholdRow>('households', { id });
      return rows[0];
    }),
  );
  const householdsFound = households.filter((row): row is HouseholdRow => Boolean(row));
  const active = householdsFound.find((household) => household.id === store.householdId) ?? householdsFound[0];
  if (!active) {
    store.reset();
    return null;
  }
  const members = memberships.filter((membership) => membership.household_id === active.id) as HouseholdMemberRow[];
  store.setHousehold(active, members, store.currentMemberId || members[0]?.id);
  return active;
}

interface RowWithHousehold {
  id: string;
  household_id: string;
}

/** Session de démonstration : le foyer Martin, sans backend configuré. */
export async function signInDemo() {
  const store = useHouseholdStore.getState();
  const members = demoMembers as HouseholdMemberRow[];
  store.setHousehold(demoHousehold as HouseholdRow, members, DEMO_MEMBERS.camille);
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: demoProfile.id,
      email: demoProfile.email,
      displayName: demoProfile.display_name,
      avatarUrl: demoProfile.avatar_url,
      provider: 'email',
    },
  });
}

/**
 * Crée un foyer et son premier administrateur.
 *
 * Une seule opération, pour deux raisons qui n'en font qu'une :
 *
 *  * le foyer et son membre doivent disparaître ensemble. Deux requêtes
 *    laissaient un foyer sans administratrice si la seconde échouait — et
 *    `households_delete` exige un administrateur, donc ce foyer ne serait
 *    supprimable par personne ;
 *  * en mode Supabase, une insertion qui RENVOIE sa ligne passe la politique
 *    de lecture, or l'appelant n'est pas encore membre du foyer qu'il crée. Le
 *    403 qui en résultait ne disait rien de sa cause.
 *
 * La fonction SQL `public.create_household` règle les deux : transaction
 * unique, et foyer renvoyé par sa valeur de retour. L'adaptateur local passe
 * par les mêmes lignes, l'IndexedDB étant atomique sur une écriture.
 *
 * Le nom d'affichage vient du profil côté serveur ; le paramètre `actor` n'est
 * transmis que par l'adaptateur local.
 */
export async function createHousehold(
  name: string,
  color: string,
): Promise<{ household: HouseholdRow; members: HouseholdMemberRow[] }> {
  const user = useSessionStore.getState().user;
  const created = await data.createHousehold({
    name,
    avatarColor: color,
    actor: user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null,
  });
  const household = created.household as unknown as HouseholdRow;
  const member = created.member as unknown as HouseholdMemberRow;
  useHouseholdStore.getState().setHousehold(household, [member]);
  return { household, members: [member] };
}

/** Rejoint un foyer en mode local à partir du foyer de démonstration. */
export async function joinHouseholdLocal(): Promise<HouseholdRow> {
  const members = demoMembers as HouseholdMemberRow[];
  useHouseholdStore.getState().setHousehold(demoHousehold as HouseholdRow, members, DEMO_MEMBERS.camille);
  return demoHousehold as HouseholdRow;
}
