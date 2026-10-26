import { differenceInMonths, differenceInYears, parseISO } from 'date-fns';
import { useCallback } from 'react';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdMemberRow } from '@/types';
import {
  archiveChildProfile,
  giveChildAccess,
  linkChildToAccount,
  saveChildProfile,
  setManagedModules,
  updateChildProfile,
  type ChildProfileCreation,
  type ChildProfileInput,
} from '../api';
/**
 * Profils enfants gérés par le parent (phase 25) : la couche d'état au-dessus
 * des RPC. Chaque mutation réussie réingère la liste via `setMembers` — le
 * filtre `vivantes` du store (D-04) reste le SEUL point d'éviction des lignes
 * archivées ; ce hook ne décide jamais seul du rendu.
 */

/** Un enfant sans compte affiché dans les listes : « géré par un adulte ». */
export function childGuardianNotice(displayName: string): string {
  // D-16 : le prénom seul suffit — la fiche est courte, pas un dossier.
  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName;
  return `${firstName} n’a pas de compte : un adulte agit pour lui, ici et dans les listes.`;
}

/**
 * D-05 : l'âge dit « où en est l'enfant » — années seules dès trois ans,
 * années et mois avant, mois seuls la première année. Sans date, rien :
 * l'absence d'une information n'est jamais un zéro.
 */
export function childAgeLabel(birthDate: string | null, now: Date = new Date()): string | null {
  if (!birthDate) return null;
  const birth = parseISO(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const years = differenceInYears(now, birth);
  if (years >= 3) return `${years} ans`;
  const months = differenceInMonths(now, birth);
  if (months < 1) return null;
  if (years >= 1) return `${years} ans, ${months - years * 12} mois`;
  return `${months} mois`;
}

const childRowFromCreation = (creation: ChildProfileCreation): HouseholdMemberRow => ({
  id: creation.id,
  household_id: creation.household_id,
  user_id: null,
  display_name: creation.display_name,
  // 0154 : la création stocke l'avatar — la ligne locale le porte désormais.
  avatar_url: creation.avatar_url,
  color_tag: creation.color_tag,
  role: 'enfant',
  birth_date: creation.birth_date,
  managed_modules: creation.managed_modules,
  deleted_at: null,
  created_at: new Date().toISOString(),
});

const currentMembers = (): HouseholdMemberRow[] => useHouseholdStore.getState().members;

export function useChildProfiles() {
  const setMembers = useHouseholdStore((state) => state.setMembers);

  const save = useCallback(
    async (values: ChildProfileInput): Promise<HouseholdMemberRow> => {
      const householdId = useHouseholdStore.getState().householdId;
      if (!householdId) throw new Error('Aucun foyer actif : ouvrez l’application dans votre foyer.');
      const creation = await saveChildProfile(householdId, values);
      const row = childRowFromCreation(creation);
      setMembers([...currentMembers(), row]);
      return row;
    },
    [setMembers],
  );

  const update = useCallback(
    async (memberId: string, values: ChildProfileInput): Promise<void> => {
      await updateChildProfile(memberId, values);
      setMembers(
        currentMembers().map((member) =>
          member.id === memberId
            ? { ...member, display_name: values.displayName.trim(), color_tag: values.colorTag, birth_date: values.birthDate, avatar_url: values.avatarUrl }
            : member,
        ),
      );
    },
    [setMembers],
  );

  const setModules = useCallback(
    async (memberId: string, modules: string[], current: { birthDate: string | null; avatarUrl: string | null }): Promise<void> => {
      await setManagedModules(memberId, modules, current);
      setMembers(currentMembers().map((member) => (member.id === memberId ? { ...member, managed_modules: modules } : member)));
    },
    [setMembers],
  );

  const archive = useCallback(
    async (memberId: string): Promise<void> => {
      await archiveChildProfile(memberId);
      // La ligne marque `deleted_at` ; `setMembers` l'écarte — le panneau ne
      // retire jamais la ligne en local (D-04, un seul filtre).
      setMembers(
        currentMembers().map((member) => (member.id === memberId ? { ...member, deleted_at: new Date().toISOString() } : member)),
      );
    },
    [setMembers],
  );

  const link = useCallback(
    async (childMemberId: string, accountMemberId: string): Promise<void> => {
      await linkChildToAccount(childMemberId, accountMemberId);
      // La base supprime la ligne enfant EN DERNIER (0148) : la liste perd la
      // fiche, l'historique est réattribué au compte.
      setMembers(currentMembers().filter((member) => member.id !== childMemberId));
    },
    [setMembers],
  );

  return { save, update, setModules, archive, link, giveAccess: giveChildAccess };
}
