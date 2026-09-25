import type { BirthdayRow, GiftItemRow, GiftListRow, GiftListShareRow, HouseholdMemberRow, MemberColorTag } from '@/types';

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
  purchased: boolean;
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
  const [, month, day] = birthDate.split('-');
  if (!month || !day) return null;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${month}-${day}`;
  const candidate = thisYear >= today ? thisYear : `${year + 1}-${month}-${day}`;
  return Number.isNaN(new Date(`${candidate}T12:00:00`).getTime()) ? null : candidate;
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
  };
}

export function toGiftItem(row: GiftItemRow, members: HouseholdMemberRow[]): GiftItem {
  const reserver = row.reserved_by ? members.find((member) => member.id === row.reserved_by) : undefined;
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
    purchased: row.purchased,
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
