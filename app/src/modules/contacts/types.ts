import { initials } from '@/lib/utils';
import type { ContactListRow, ContactRow, HouseholdMemberRow } from '@/types';
import { formatFrDate, parseFrDate } from '@/modules/anniversaires/types';

export { formatFrDate, parseFrDate };

export interface ContactList {
  id: string;
  householdId: string;
  name: string;
  ownerMemberId: string | null;
  isDefault: boolean;
  /** `true` pour la liste partagée « Famille » (`owner_member_id` NULL). */
  isShared: boolean;
  ownerName: string | null;
}

export interface Contact {
  id: string;
  listId: string;
  householdId: string;
  name: string;
  birthDate: string | null;
  photoUrl: string | null;
  linkedMemberId: string | null;
  initials: string;
  linkedMember: HouseholdMemberRow | null;
}

export function toContactList(row: ContactListRow, members: readonly HouseholdMemberRow[] = []): ContactList {
  const owner = row.owner_member_id ? (members.find((entry) => entry.id === row.owner_member_id) ?? null) : null;
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    ownerMemberId: row.owner_member_id,
    isDefault: row.is_default,
    isShared: row.owner_member_id === null,
    ownerName: owner?.display_name ?? null,
  };
}

export function toContact(row: ContactRow, members: readonly HouseholdMemberRow[] = []): Contact {
  return {
    id: row.id,
    listId: row.list_id,
    householdId: row.household_id,
    name: row.name,
    birthDate: row.birth_date,
    photoUrl: row.photo_url,
    linkedMemberId: row.linked_member_id,
    initials: initials(row.name),
    linkedMember: row.linked_member_id
      ? (members.find((entry) => entry.id === row.linked_member_id) ?? null)
      : null,
  };
}

/**
 * Normalisation nom de la garde anti-doublon serveur (0078, D-10) :
 * espaces rognés et réduits, casse repliée, forme Unicode canonique.
 * Sans désaccentuation (extension `unaccent` non garantie sur la stack) :
 * les accents restent distinctifs, comme côté serveur.
 */
export const normalizeContactName = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');

/**
 * Clé de fusion nom normalisé + mois-jour (D-12) : deux lignes partageant
 * cette clé et ce jour parlent de la même personne probable.
 */
export const contactFusionKey = (name: string, birthDate: string) =>
  `${normalizeContactName(name)}|${birthDate.slice(5)}`;

/**
 * Doublons probables (D-04) : même clé de fusion quand la fiche candidate
 * porte une date, même nom normalisé sinon. Non bloquant : les homonymes
 * réels existent, la soumission reste autorisée.
 */
export function findLikelyDuplicates(
  candidate: { name: string; birthDate: string | null },
  contacts: readonly Contact[],
  excludeId: string | null = null,
): Contact[] {
  const name = candidate.name.trim();
  if (name === '') return [];
  const normalized = normalizeContactName(name);
  return contacts.filter((contact) => {
    if (excludeId !== null && contact.id === excludeId) return false;
    if (normalizeContactName(contact.name) !== normalized) return false;
    if (candidate.birthDate === null || contact.birthDate === null) return true;
    return contact.birthDate.slice(5) === candidate.birthDate.slice(5);
  });
}

export interface ContactFormValues {
  name: string;
  /** Saisie `JJ/MM/AAAA`, `''` = sans date (donc sans miroir). */
  birthDate: string;
  listId: string;
  linkedMemberId: string;
  photoUrl: string;
}
