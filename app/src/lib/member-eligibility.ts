/**
 * Garde d'éligibilité D-06 (phase 25, plan 25-07) : qui peut figurer dans un
 * picker d'un espace donné.
 *
 * Un point unique : adultes (role ≠ 'enfant') toujours listés ; un enfant
 * n'est éligible que si SA fiche sert l'espace (`managed_modules`, migration
 * 0144) — la base vérifie la même ligne membre côté serveur (refus 42501
 * sinon). Aucune liste de clés en dur ici : la fonction lit la fiche, elle ne
 * connaît ni le socle ni le catalogue — l'absence de la clé refuse, par
 * défaut.
 *
 * PURE : le store (`useMembers`) a déjà retiré les enfants archivés à
 * l'ingestion (D-04, plan 25-05) ; la fonction exclut en plus tout enfant
 * `deleted_at` non null — un double filet, jamais un goulot (O(n), sans
 * allocation intermédiaire).
 */
import type { HouseholdMemberRow } from '@/types';
import type { ModuleKey } from '@/lib/modules';

export const eligibleMembersForModule = (
  members: readonly HouseholdMemberRow[],
  moduleKey: ModuleKey,
): HouseholdMemberRow[] =>
  members.filter(
    (member) =>
      member.role !== 'enfant' ||
      (member.deleted_at === null && member.managed_modules.includes(moduleKey)),
  );
