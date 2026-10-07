import type { BirthdayRow, ContactRow, GiftIdeaRow, GiftItemRow, GiftListRow, GiftListShareRow, HouseholdMemberRow, MemberColorTag } from '@/types';
import { nextBirthdayDate } from '@/modules/anniversaires/types';

export type GiftVisibility = 'privee' | 'foyer' | 'partagee';
export type GiftPermission = 'lecture' | 'reservation';

export const visibilityLabel: Record<GiftVisibility, string> = {
  privee: 'Liste privée',
  foyer: 'Liste du foyer',
  partagee: 'Liste partagée',
};

export const permissionLabel: Record<GiftPermission, string> = {
  lecture: 'Lecture seule',
  reservation: 'Peut réserver',
};

export interface GiftList {
  id: string;
  name: string;
  visibility: GiftVisibility;
  ownerMemberId: string;
  ownerName: string;
  ownerColorTag: MemberColorTag | null;
  shareCount: number;
  /** La liste appartient-elle au membre connecté ? */
  isOwned: boolean;
  isPrivate: boolean;
  /**
   * Liste d'un autre foyer, rejointe par partage (G-06-1b-bis) : lecture
   * seule côté client (réserve via la voie serveur, aucune gestion).
   */
  isForeign: boolean;
  /**
   * Nom du foyer d'origine quand il est lisible sous la RLS existante,
   * sinon null → badge neutre « Liste partagée » (jamais une nouvelle
   * lecture inter-foyers pour l'obtenir).
   */
  originLabel: string | null;
}

export interface GiftItem {
  id: string;
  listId: string;
  name: string;
  price: number | null;
  comment: string | null;
  photoUrl: string | null;
  url: string | null;
  reservedBy: string | null;
  reservedByName: string | null;
  reservedByColorTag: MemberColorTag | null;
  /**
   * Tenu par un visiteur sans compte (D-05) : `reserved_by_name` renseigné,
   * `reserved_by` NULL. Le nom déclaré n'est JAMAIS exposé (D-07) —
   * `reservedByName` reste NULL dans ce cas, l'UI affiche « Réservé » seul.
   */
  heldAnonymously: boolean;
  purchased: boolean;
  /** Idée d'origine (D-04), `null` pour un article saisi à la main. */
  ideaId: string | null;
}

export interface GiftShare {
  id: string;
  listId: string;
  memberId: string | null;
  memberName: string | null;
  email: string | null;
  permission: GiftPermission;
}

export interface NewGiftItemInput {
  listId: string;
  name: string;
  price: number | null;
  url: string | null;
  comment: string | null;
  photoUrl: string | null;
  /** Renseigne la promotion idée→article (D-05) ; `null` en saisie manuelle. */
  ideaId?: string | null;
}

/** Statuts verrouillés à l'octet près (OQ-3, plan 05-01) : partagés avec les schémas. */
export type GiftIdeaStatus = 'a_offrir' | 'offert';

export const ideaStatusLabel: Record<GiftIdeaStatus, string> = {
  a_offrir: 'À offrir',
  offert: 'Offert',
};

export interface GiftIdea {
  id: string;
  name: string;
  price: number | null;
  url: string | null;
  comment: string | null;
  photoUrl: string | null;
  status: GiftIdeaStatus;
  gifteeText: string | null;
  gifteeContactId: string | null;
  gifteeName: string | null;
  /** Prochaine occasion du contact lié (D-07), `null` sans contact daté. */
  nextOccasionDate: string | null;
  createdBy: string | null;
}

export interface NewGiftIdeaInput {
  name: string;
  price: number | null;
  url: string | null;
  comment: string | null;
  photoUrl: string | null;
  status: GiftIdeaStatus;
  gifteeText: string | null;
  gifteeContactId: string | null;
}

/**
 * Prochaine occasion d'une idée (D-07) : la date du contact lié, rabattue par
 * le helper clamp partagé (D-11) — le 29 février n'y disparaît jamais.
 */
export function nextIdeaOccasion(
  idea: Pick<GiftIdea, 'gifteeContactId'>,
  contacts: readonly Pick<ContactRow, 'id' | 'birth_date'>[],
  today: string,
): string | null {
  if (!idea.gifteeContactId) return null;
  const contact = contacts.find((entry) => entry.id === idea.gifteeContactId);
  if (!contact?.birth_date) return null;
  return nextAnniversary(contact.birth_date, today);
}

export function toGiftIdea(
  row: GiftIdeaRow,
  contacts: readonly ContactRow[],
  today: string,
): GiftIdea {
  const contact = row.giftee_contact_id
    ? contacts.find((entry) => entry.id === row.giftee_contact_id)
    : undefined;
  return {
    id: row.id,
    name: row.name,
    price: row.price === null ? null : Number(row.price),
    url: row.url,
    comment: row.comment,
    photoUrl: row.photo_url,
    status: row.status,
    gifteeText: row.giftee_text,
    gifteeContactId: row.giftee_contact_id,
    gifteeName: contact?.name ?? row.giftee_text,
    nextOccasionDate: contact?.birth_date ? nextAnniversary(contact.birth_date, today) : null,
    createdBy: row.created_by,
  };
}

export interface NewGiftListInput {
  name: string;
  visibility: GiftVisibility;
}

export interface GiftShareInput {
  memberId: string | null;
  email: string | null;
  permission: GiftPermission;
}

/** Prochaine occurrence annuelle d'une date de naissance, `null` si inexploitable. */
export function nextAnniversary(birthDate: string, today: string): string | null {
  // D-11 : le 29 février est rabattu sur le 28 (helper clamp partagé avec
  // Anniversaires, jamais dupliqué). L'ancienne version locale rendait `null`
  // les années non bissextiles et faisait disparaître l'anniversaire.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) return null;
  return nextBirthdayDate(birthDate, today);
}

export interface NextOccasion {
  name: string;
  date: string;
}

export function findNextOccasion(birthdays: BirthdayRow[], today: string): NextOccasion | null {
  const occurrences = birthdays
    .map((birthday) => ({ name: birthday.name, date: nextAnniversary(birthday.birth_date, today) }))
    .filter((entry): entry is { name: string; date: string } => entry.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return occurrences[0] ?? null;
}

export function toGiftList(
  row: GiftListRow,
  owner: HouseholdMemberRow | undefined,
  shareCount: number,
  currentMemberId: string | null,
  extra?: { isForeign?: boolean; originLabel?: string | null },
): GiftList {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    ownerMemberId: row.owner_member_id,
    ownerName: owner?.display_name ?? 'Membre',
    ownerColorTag: owner?.color_tag ?? null,
    shareCount,
    isOwned: row.owner_member_id === currentMemberId,
    isPrivate: row.visibility === 'privee',
    isForeign: extra?.isForeign ?? false,
    originLabel: extra?.originLabel ?? null,
  };
}

export function toGiftItem(row: GiftItemRow, members: HouseholdMemberRow[]): GiftItem {
  const reserver = row.reserved_by ? members.find((member) => member.id === row.reserved_by) : undefined;
  // L'une ou l'autre forme d'auteur vaut « réservé » (CR-01) : un article
  // tenu anonymement n'est jamais proposé comme libre, et le nom déclaré ne
  // sort jamais d'ici (D-07 — `reservedByName` reste NULL dans ce cas).
  const heldAnonymously = (row.reserved_by_name ?? '').trim() !== '';
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    price: row.price === null ? null : Number(row.price),
    comment: row.comment,
    photoUrl: row.photo_url,
    url: row.url,
    reservedBy: row.reserved_by,
    reservedByName: reserver?.display_name ?? null,
    reservedByColorTag: reserver?.color_tag ?? null,
    heldAnonymously,
    purchased: row.purchased,
    ideaId: row.idea_id,
  };
}

export function toGiftShare(row: GiftListShareRow, members: HouseholdMemberRow[]): GiftShare {
  return {
    id: row.id,
    listId: row.list_id,
    memberId: row.shared_with_member_id,
    memberName: row.shared_with_member_id
      ? (members.find((member) => member.id === row.shared_with_member_id)?.display_name ?? null)
      : null,
    email: row.shared_with_email,
    permission: row.permission,
  };
}

export const roundPrice = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
