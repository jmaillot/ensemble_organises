import { getDaysInMonth } from 'date-fns';
import { daysBetween, initials, pad, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import { toColorTag } from '@/modules/calendrier/types';
import type { BirthdayRow, ContactRow, HouseholdMemberRow, MemberColorTag } from '@/types';

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

/**
 * Saisie `JJ/MM/AAAA` → ISO, ou `null` si invalide.
 *
 * Le champ natif `type="date"` suit la locale du navigateur (MM/DD/YYYY sur
 * un Firefox en-US) : la saisie est donc un texte explicite, validé ici sans
 * ambiguïté. Le contrôle aller-retour refuse le 30 février ou un 31 avril,
 * et n'accepte le 29 février que les années bissextiles.
 */
const FR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseFrDate(value: string): string | null {
  const match = FR_DATE.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** ISO → `JJ/MM/AAAA` pour l'affichage et la ressaisie, `''` si malformé. */
export function formatFrDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Un anniversaire se répète chaque année : seul le mois et le jour comptent. */
export const monthDayKey = (iso: string) => iso.slice(5);

/**
 * Normalisation nom de la garde anti-doublon serveur (0078, D-10) :
 * espaces rognés et réduits, casse repliée, forme Unicode canonique.
 * Sans désaccentuation (extension `unaccent` non garantie sur la stack) :
 * les accents restent distinctifs, comme côté serveur.
 */
export const normalizePersonName = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');

/**
 * Clé de fusion nom normalisé + mois-jour (D-12) : deux lignes partageant
 * cette clé et ce jour parlent de la même personne probable.
 */
export const personFusionKey = (name: string, birthDate: string) =>
  `${normalizePersonName(name)}|${birthDate.slice(5)}`;

export interface BirthdayFormValues {
  name: string;
  birthDate: string;
  linkedMemberId: string;
  photoUrl: string;
  /**
   * Flux « anniversaire d'abord » (D-10) : coché par défaut à la création,
   * crée aussi la fiche contact (la garde serveur 0078 absorbe le
   * double-miroir). Ignoré en modification.
   */
  createContact: boolean;
}

/**
 * Ligne de la vue agrégée (D-09) : un `Birthday` enrichi de sa provenance.
 * `displayPhotoUrl` applique la priorité photo (D-13) : contact d'abord,
 * repli sur la photo de l'anniversaire.
 */
export interface AggregatedBirthday extends Birthday {
  origin: 'birthday' | 'contact' | 'miroir';
  /** Homonymes indépendants même jour des deux côtés (D-12). */
  twoSources: boolean;
  contactId: string | null;
  displayPhotoUrl: string | null;
  /** Date de naissance de la fiche contact source (`null` si anniversaire seul). */
  contactBirthDate: string | null;
}

const toAggregated = (
  birthday: Birthday,
  extra: Pick<AggregatedBirthday, 'origin' | 'twoSources' | 'contactId' | 'contactBirthDate'> & {
    displayPhotoUrl?: string | null;
  },
): AggregatedBirthday => ({
  ...birthday,
  displayPhotoUrl: extra.displayPhotoUrl ?? birthday.photoUrl,
  ...extra,
});

/**
 * Fusion purement affichage (D-09/D-12/D-13) : chaque ligne reste chargée
 * par sa RLS foyer, la clé de fusion ne joint jamais inter-foyer (T-05-10).
 *
 * - Paires miroir (`birthdays.contact_id`) : une seule ligne.
 * - Homonymes indépendants (même clé nom normalisé + MM-DD, sans lien) :
 *   une seule ligne avec `twoSources` (badge « 2 sources »).
 * - Lignes d'une seule source : telles quelles.
 *
 * Triées par prochaine échéance via le helper clamp partagé (D-11).
 */
export function aggregateBirthdays(
  birthdayRows: readonly BirthdayRow[],
  contactRows: readonly ContactRow[],
  members: readonly HouseholdMemberRow[] = [],
): AggregatedBirthday[] {
  const contactsById = new Map(contactRows.map((row) => [row.id, row]));
  const consumedContacts = new Set<string>();
  const merged: AggregatedBirthday[] = [];
  const leftovers: Array<{ birthday: Birthday; contactId: string | null; contactBirthDate: string | null }> = [];

  for (const row of birthdayRows) {
    const birthday = toBirthday(row, members);
    const source = row.contact_id ? contactsById.get(row.contact_id) : undefined;
    if (source && source.birth_date) {
      consumedContacts.add(source.id);
      merged.push(
        toAggregated(birthday, {
          origin: 'miroir',
          twoSources: false,
          contactId: source.id,
          contactBirthDate: source.birth_date,
          // Photo contact prioritaire, repli photo birthday (D-13).
          displayPhotoUrl: source.photo_url ?? birthday.photoUrl,
        }),
      );
    } else {
      leftovers.push({ birthday, contactId: null, contactBirthDate: null });
    }
  }

  // Homonymes indépendants : regroupés par clé de fusion.
  const groups = new Map<string, { birthdays: Birthday[]; contacts: ContactRow[] }>();
  for (const { birthday } of leftovers) {
    const key = personFusionKey(birthday.name, birthday.birthDate);
    const group = groups.get(key) ?? { birthdays: [], contacts: [] };
    group.birthdays.push(birthday);
    groups.set(key, group);
  }
  for (const contact of contactRows) {
    if (contact.birth_date === null || consumedContacts.has(contact.id)) continue;
    const key = personFusionKey(contact.name, contact.birth_date);
    const group = groups.get(key) ?? { birthdays: [], contacts: [] };
    group.contacts.push(contact);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.birthdays.length > 0) {
      const [first, ...rest] = group.birthdays;
      const linked = group.contacts[0] ?? null;
      merged.push(
        toAggregated(first, {
          origin: 'birthday',
          twoSources: linked !== null,
          contactId: linked?.id ?? null,
          contactBirthDate: linked?.birth_date ?? null,
          displayPhotoUrl: linked?.photo_url ?? first.photoUrl,
        }),
      );
      // Doublons résiduels du même côté (jamais des miroirs) : une ligne chacun.
      for (const extra of rest) {
        merged.push(toAggregated(extra, { origin: 'birthday', twoSources: false, contactId: null, contactBirthDate: null }));
      }
    } else {
      for (const contact of group.contacts) {
        const synthetic: BirthdayRow = {
          id: `contact-${contact.id}`,
          household_id: contact.household_id,
          name: contact.name,
          birth_date: contact.birth_date as string,
          photo_url: contact.photo_url,
          linked_member_id: contact.linked_member_id,
          contact_id: null,
        };
        merged.push(
          toAggregated(toBirthday(synthetic, members), {
            origin: 'contact',
            twoSources: false,
            contactId: contact.id,
            contactBirthDate: contact.birth_date,
            displayPhotoUrl: contact.photo_url,
          }),
        );
      }
    }
  }

  return merged.sort((a, b) => a.daysUntil - b.daysUntil);
}
