import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QueryClient } from '@tanstack/react-query';
import { connectOfflineCache, purgeCache, stopPersisting } from '@/lib/offline/query-persistence';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { HouseholdMemberRow, HouseholdRow, Role } from '@/types';

interface HouseholdState {
  householdId: string | null;
  householdName: string;
  householdColor: string;
  members: HouseholdMemberRow[];
  /** Membre correspondant à l'utilisateur connecté (profil géré par un parent). */
  currentMemberId: string;
  /**
   * Clés des espaces éteints par le foyer (menu des applications, migration
   * 0140). Vide = tout activé. Source de vérité : la ligne `households`,
   * rechargée à chaque session ; ce cache rend le masquage immédiat dans le
   * shell sans attendre une lecture.
   */
  disabledModules: string[];
  /** Ville du profil (`profiles.city`) : cache local, repli hors ligne et démo. */
  city: string;
  setCity: (city: string) => void;
  setHousehold: (household: HouseholdRow, members: HouseholdMemberRow[], currentMemberId?: string) => void;
  setDisabledModules: (disabledModules: string[]) => void;
  switchHousehold: (householdId: string, householdName: string) => void;
  /**
   * Changement de foyer avec purge du foyer quitté (OFFR-04, D-04, Pitfall 5).
   * Le setter sync `switchHousehold` reste la dernière étape — jamais
   * asynchronisé ; c'est cette action async encapsulante que le sélecteur de
   * foyer doit awaiter. `client` est le queryClient de l'app (`router.tsx`),
   * passé par l'appelant pour éviter un cycle d'import. L'appelant DOIT
   * awaiter la fonction (WR-03, revue 33) : le contrat complet est purge →
   * clear → switch → rétablissement du persist + restore du cache du nouveau
   * couple — l'app ne se retrouve jamais sans souscription de sauvegarde ni
   * sans cache restauré après le switch.
   */
  switchWithPurge: (
    householdId: string,
    householdName: string,
    client: QueryClient,
    userId?: string | null,
  ) => Promise<void>;
  setMembers: (members: HouseholdMemberRow[]) => void;
  reset: () => void;
}

const initialState = {
  householdId: null,
  householdName: 'Foyer Martin',
  householdColor: 'accent',
  members: [] as HouseholdMemberRow[],
  currentMemberId: DEMO_MEMBERS.camille,
  disabledModules: [] as string[],
  city: 'Lyon',
};

/**
 * D-04 : les lignes `household_members` archivées (enfant retiré du foyer,
 * `deleted_at` non null) restent en base — leurs traces aussi — mais ne
 * doivent plus apparaître nulle part dans l'application. Le filtre vit ICI,
 * une seule fois : chaque ingestion de membres passe par `setHousehold` ou
 * `setMembers`, donc tous les consommateurs (`useMembers`, `useCurrentMember`,
 * les sélecteurs inline du panneau comme des modules) voient la liste vivante,
 * sans qu'aucun composant n'ait à refiltrer.
 */
const vivantes = (members: HouseholdMemberRow[]): HouseholdMemberRow[] => members.filter((member) => member.deleted_at == null);

export const useHouseholdStore = create<HouseholdState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setHousehold: (household, members, currentMemberId) =>
        set({
          householdId: household.id,
          householdName: household.name,
          householdColor: household.avatar_color,
          // D-04 : ingestion filtrée des membres — voir `vivantes`.
          members: vivantes(members),
          currentMemberId: currentMemberId ?? members[0]?.id ?? '',
          // `?? []` : une ligne démo ou un cache ancien peut ne pas porter la
          // colonne ; l'absence de configuration veut dire tout activé.
          disabledModules: household.disabled_modules ?? [],
        }),
      setDisabledModules: (disabledModules) => set({ disabledModules }),
      switchHousehold: (householdId, householdName) => set({ householdId, householdName }),
      switchWithPurge: async (householdId, householdName, client, userId) => {
        // D-04, Pitfall 5 (T-33-12) : ordre STRICT — purge du foyer quitté
        // (await) → clear du cache mémoire → seulement ensuite le switch.
        // Les lectures du nouveau foyer partent APRÈS le clear : aucune ligne
        // de l'ancien foyer ne peut répondre un instant sous le nouveau
        // householdId. Le désabonnement précède la purge (Pitfall 6, T-33-13) :
        // sans lui, une sauvegarde throttlée en vol ressusciterait la clé.
        const previousId = get().householdId;
        if (previousId && previousId !== householdId) {
          // D-17 (plan 34-04, T-34-08) : cette purge emporte l'outbox du foyer
          // quitté (la file persiste dans `cacheKey(userId, householdId)`)
          // SANS confirmation — contrairement à la déconnexion, qui scanne la
          // file et exige l'acknowledgment (`OutboxPendingError`). Ici
          // l'utilisateur a lui-même demandé le changement de foyer et reste
          // connecté : les écritures pendantes du foyer quitté perdent leur
          // destinataire, c'est le prix assumé du départ (prouvé par test :
          // « la purge du foyer quitté emporte l'outbox persistée »).
          stopPersisting();
          if (userId) await purgeCache(userId, previousId);
        }
        client.clear();
        get().switchHousehold(householdId, householdName);
        // WR-03 (revue 33) : le persist est RÉTABLI sur le nouveau couple —
        // sans cet appel, `stopPersisting()` ci-dessus laissait l'app sans
        // souscription de sauvegarde ni cache restauré jusqu'au prochain
        // bootstrap. Restore → prune → souscription, même mécanique que le
        // branchement initial (`connectOfflineCache`). Pas de branchement en
        // démo (userId null) : le mode démo ne persiste jamais (Pitfall 7).
        if (userId) await connectOfflineCache(client, userId, householdId);
      },
      // D-04 : ingestion filtrée des membres — voir `vivantes`.
      setMembers: (members) => set({ members: vivantes(members) }),
      setCity: (city) => set({ city }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'ensemble-organises-household',
      version: 2,
      // v1 → v2 : la colonne `disabled_modules` n'existait pas dans l'état
      // persisté. La valeur persistée reste entière, seule la clé manquante
      // reçoit le défaut (tout activé) — jamais une remise à zéro du foyer.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<HouseholdState>;
        return { ...initialState, ...state, disabledModules: state.disabledModules ?? [] };
      },
      partialize: (state) => ({
        householdId: state.householdId,
        householdName: state.householdName,
        householdColor: state.householdColor,
        members: state.members,
        currentMemberId: state.currentMemberId,
        disabledModules: state.disabledModules,
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

/**
 * D-01 : les adultes — administrateur ET membre — gèrent les profils enfants
 * (création, édition, archivage, choix des espaces, modération du Cercle).
 * L'enfant, lui, n'administre rien. `useIsAdmin` garde sa sémantique stricte :
 * les dossiers perso notes/routines restent réservés à l'administrateur.
 */
export function useIsAdult(): boolean {
  const role = useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role);
  return role === 'admin' || role === 'membre';
}

export function useMemberName(): string {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.display_name ?? 'Camille Martin');
}

export function useMemberRole(): Role {
  return useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role ?? 'membre');
}

/**
 * Espaces éteints par le foyer (menu des applications, migration 0140).
 * Lecture seule : l'écriture passe par `setDisabledModules` — appelé par le
 * panneau des paramètres après l'enregistrement en base — ou par
 * `setHousehold`, qui recharge la valeur depuis la ligne foyer.
 */
export function useDisabledModules(): string[] {
  return useHouseholdStore((state) => state.disabledModules);
}
