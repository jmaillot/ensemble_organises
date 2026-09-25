import type { FrenchHoliday } from '@/hooks/use-french-holidays';
import { formatLongDate, pluralize } from '@/lib/utils';
import type { BirthdayRow, EventReminderRow, EventRow, HouseholdMemberRow, MemberColorTag } from '@/types';

/** Couleurs de membre acceptées par `events.color` (pastille du calendrier). */
const COLOR_TAGS = ['accent', 'ink', 'coral', 'amber', 'violet'] as const satisfies readonly MemberColorTag[];

export function toColorTag(color: string | null | undefined, fallback: MemberColorTag = 'coral'): MemberColorTag {
  return (COLOR_TAGS as readonly string[]).includes(color ?? '') ? (color as MemberColorTag) : fallback;
}

const capitalize = (value: string) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : value);

export interface CalendarEvent {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  /** ISO local (`2026-09-25T19:30:00`), aligné sur les lignes de `events`. */
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  color: string | null;
  createdBy: string | null;
  /** Jour local (`YYYY-MM-DD`) affiché dans la grille. */
  date: string;
  timeLabel: string;
  colorTag: MemberColorTag;
  author: HouseholdMemberRow | null;
}

export function toCalendarEvent(row: EventRow, members: readonly HouseholdMemberRow[] = []): CalendarEvent {
  const author = members.find((member) => member.id === row.created_by) ?? null;
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    color: row.color,
    createdBy: row.created_by,
    date: row.start_at.slice(0, 10),
    timeLabel: row.all_day ? 'Toute la journée' : row.start_at.slice(11, 16),
    colorTag: toColorTag(row.color, author?.color_tag ?? 'coral'),
    author,
  };
}

export interface EventReminder {
  id: string;
  eventId: string;
  remindAt: string;
}

export const toEventReminder = (row: EventReminderRow): EventReminder => ({
  id: row.id,
  eventId: row.event_id,
  remindAt: row.remind_at,
});

/** Anniversaire vu depuis le calendrier (lecture seule). */
export interface CalendarBirthday {
  id: string;
  name: string;
  /** Mois et jour (`MM-DD`) : un anniversaire se répète chaque année. */
  monthDay: string;
  colorTag: MemberColorTag;
  member: HouseholdMemberRow | null;
}

export function toCalendarBirthday(row: BirthdayRow, members: readonly HouseholdMemberRow[] = []): CalendarBirthday {
  const member = members.find((entry) => entry.id === row.linked_member_id) ?? null;
  return {
    id: row.id,
    name: row.name,
    monthDay: row.birth_date.slice(5),
    colorTag: member?.color_tag ?? 'coral',
    member,
  };
}

/** Valeurs du formulaire d'événement, également utilisées comme brouillon d'écriture. */
export interface EventFormValues {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  description: string;
  /** `household_members.id` associé, ou chaîne vide pour la couleur corail. */
  memberId: string;
  /** Rappel au format `datetime-local` (`2026-09-25T18:30`) ou chaîne vide. */
  remindAt: string;
}

export type AgendaItem =
  | {
      kind: 'event';
      key: string;
      event: CalendarEvent;
      time: string;
      title: string;
      subtitle: string | null;
      colorTag: MemberColorTag;
      chipLabel: string;
      author: HouseholdMemberRow | null;
    }
  | {
      kind: 'anniversaire';
      key: string;
      time: string;
      title: string;
      subtitle: string | null;
      colorTag: MemberColorTag;
      chipLabel: string;
    }
  | {
      kind: 'ferie';
      key: string;
      time: string;
      title: string;
      subtitle: string | null;
      chipLabel: string;
    };

/** Journée de l'agenda : événements du foyer, anniversaires, puis jours fériés. */
export function buildAgenda(
  date: string,
  sources: { events: readonly CalendarEvent[]; birthdays: readonly CalendarBirthday[]; holidays: readonly FrenchHoliday[] },
): AgendaItem[] {
  const { events, birthdays, holidays } = sources;
  const eventsOfDay = events
    .filter((event) => event.date === date)
    .map<AgendaItem>((event) => ({
      kind: 'event',
      key: `event-${event.id}`,
      event,
      time: event.timeLabel,
      title: event.title,
      subtitle: event.location,
      colorTag: event.colorTag,
      chipLabel: event.allDay ? 'Journée entière' : 'Événement',
      author: event.author,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const birthdaysOfDay = birthdays
    .filter((birthday) => birthday.monthDay === date.slice(5))
    .map<AgendaItem>((birthday) => ({
      kind: 'anniversaire',
      key: `anniversaire-${birthday.id}`,
      time: 'Toute la journée',
      title: `Anniversaire de ${birthday.name}`,
      subtitle: null,
      colorTag: birthday.colorTag,
      chipLabel: 'Anniversaire',
    }));

  const holidaysOfDay = holidays
    .filter((holiday) => holiday.date === date)
    .map<AgendaItem>((holiday) => ({
      kind: 'ferie',
      key: `ferie-${holiday.date}`,
      time: holiday.time,
      title: holiday.title,
      subtitle: 'Jour férié en France',
      colorTag: 'amber',
      chipLabel: 'Jour férié',
    }));

  return [...eventsOfDay, ...birthdaysOfDay, ...holidaysOfDay];
}

export interface DayMarker {
  count: number;
  colorTag: MemberColorTag;
  hasBirthday: boolean;
  hasHoliday: boolean;
}

export type DayMarkerMap = Record<string, DayMarker>;

function isSameMonthDay(iso: string, monthDay: string) {
  return iso.slice(5) === monthDay;
}

/** Pastilles de la grille : couleur du membre pour un événement, ambre pour un férié. */
export function buildDayMarkers(
  days: readonly { iso: string }[],
  sources: { events: readonly CalendarEvent[]; birthdays: readonly CalendarBirthday[]; holidays: readonly FrenchHoliday[] },
): DayMarkerMap {
  const markers: DayMarkerMap = {};
  days.forEach(({ iso }) => {
    const events = sources.events.filter((event) => event.date === iso);
    const birthdays = sources.birthdays.filter((birthday) => isSameMonthDay(iso, birthday.monthDay));
    const holiday = sources.holidays.find((entry) => entry.date === iso);
    if (events.length === 0 && birthdays.length === 0 && !holiday) return;
    markers[iso] = {
      count: events.length + birthdays.length,
      colorTag: holiday && events.length === 0 ? 'amber' : (events[0]?.colorTag ?? birthdays[0]?.colorTag ?? 'coral'),
      hasBirthday: birthdays.length > 0,
      hasHoliday: Boolean(holiday),
    };
  });
  return markers;
}

/** Libellé complet d'une case : « Vendredi 25 septembre 2026, 2 événements ». */
export function dayButtonLabel(iso: string, marker?: DayMarker) {
  const base = capitalize(formatLongDate(iso));
  if (!marker || marker.count === 0) return marker?.hasHoliday ? `${base}, jour férié` : base;
  return `${base}, ${pluralize(marker.count, 'événement')}${marker.hasHoliday ? ', jour férié' : ''}`;
}

