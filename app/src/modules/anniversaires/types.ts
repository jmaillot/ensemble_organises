import { getDaysInMonth } from 'date-fns';
import { daysBetween, initials, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import { toColorTag } from '@/modules/calendrier/types';
import type { BirthdayRow, HouseholdMemberRow, MemberColorTag } from '@/types';

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

/** « 7 octobre », sans l'année : c'est la date d'anniversaire affichée partout. */
export const formatDayMonth = (iso: string) => {
  const value = dayMonth.format(toLocalDate(iso));
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
};

export interface Birthday {
  id: string;
  householdId: string;
  name: string;
  birthDate: string;
  photoUrl: string | null;
  linkedMemberId: string | null;
  initials: string;
  colorTag: MemberColorTag;
  member: HouseholdMemberRow | null;
  /** Prochain anniversaire : cette année, ou l'année suivante s'il est passé. */
  nextDate: string;
  /** Nombre de jours avant le prochain anniversaire. */
  daysUntil: number;
  /** Âge fêté au prochain anniversaire. */
  turning: number;
}

/** Gestion du 29 février : on retombe sur le dernier jour du mois. */
function clampDay(year: number, month: number, day: number) {
  return Math.min(day, getDaysInMonth(new Date(year, month, 1)));
}

export function nextBirthdayDate(birthDate: string, from = todayIso()): string {
  const source = toLocalDate(birthDate);
  const reference = toLocalDate(from);
  const month = source.getMonth();
  const day = source.getDate();
  const thisYear = clampDay(reference.getFullYear(), month, day);
  const candidate = new Date(reference.getFullYear(), month, thisYear);
  if (toIsoDate(candidate) >= from) return toIsoDate(candidate);
  const nextYear = reference.getFullYear() + 1;
  return toIsoDate(new Date(nextYear, month, clampDay(nextYear, month, day)));
}

export function toBirthday(row: BirthdayRow, members: readonly HouseholdMemberRow[] = []): Birthday {
  const member = members.find((entry) => entry.id === row.linked_member_id) ?? null;
  const nextDate = nextBirthdayDate(row.birth_date);
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    birthDate: row.birth_date,
    photoUrl: row.photo_url,
    linkedMemberId: row.linked_member_id,
    initials: initials(row.name),
    colorTag: toColorTag(member?.color_tag, 'coral'),
    member,
    nextDate,
    daysUntil: daysBetween(todayIso(), nextDate),
    turning: new Date(`${nextDate}T12:00:00`).getFullYear() - Number(row.birth_date.slice(0, 4)),
  };
}

export const isInMonth = (birthday: Birthday, iso: string) => birthday.nextDate.slice(0, 7) === iso.slice(0, 7);

/** Libellé relatif utilisé dans les lignes de liste. */
export function birthdayCountdown(birthday: Birthday): string {
  if (birthday.daysUntil === 0) return 'C’est aujourd’hui';
  if (birthday.daysUntil === 1) return 'Demain';
  return `Dans ${birthday.daysUntil} jours`;
}

/** Un anniversaire se répète chaque année : seul le mois et le jour comptent. */
export const monthDayKey = (iso: string) => iso.slice(5);

export interface BirthdayFormValues {
  name: string;
  birthDate: string;
  linkedMemberId: string;
  photoUrl: string;
}
