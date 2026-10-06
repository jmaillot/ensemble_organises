import type { FrenchHoliday } from '@/hooks/use-french-holidays';
import { formatLongDate, formatShortDate, pluralize } from '@/lib/utils';
import type { VacationRange } from './hooks/use-ref-days';
import { vacationsOfDay } from './hooks/use-ref-days';
import type { BirthdayRow, EventReminderRow, EventRow, HouseholdMemberRow, MemberColorTag, TaskStatus } from '@/types';
import type { TaskAssignee } from '@/modules/taches/types';

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
  calendarId: string;
  categoryId: string | null;
  /** Nom de la catégorie, résolu depuis `event_categories` (pastille catégorie). */
  categoryName: string | null;
  /** Couleur hex de la catégorie (`event_categories.color`) : colore
   * l'événement (D-07). La couleur membre reste sur `colorTag`/avatars. */
  categoryColor: string | null;
  createdBy: string | null;
  /** Jour local (`YYYY-MM-DD`) affiché dans la grille. */
  date: string;
  timeLabel: string;
  colorTag: MemberColorTag;
  author: HouseholdMemberRow | null;
}

export function toCalendarEvent(
  row: EventRow,
  members: readonly HouseholdMemberRow[] = [],
  categories: readonly { id: string; name: string; color?: string | null }[] = [],
): CalendarEvent {
  const author = members.find((member) => member.id === row.created_by) ?? null;
  const category = categories.find((entry) => entry.id === row.category_id) ?? null;
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
    calendarId: row.calendar_id,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
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
  /** `event_categories.id`, ou chaîne vide pour sans catégorie. */
  categoryId: string;
  /** `event_calendars.id`, choisi explicitement (D-03, présélection Commun). Chaîne vide : filet serveur 0048 uniquement. */
  calendarId: string;
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
      /** Couleur hex de la catégorie (D-07), quand l'événement est catégorisé. */
      categoryColor: string | null;
      chipLabel: string;
      author: HouseholdMemberRow | null;
    }
  | {
      kind: 'tache';
      key: string;
      taskId: string;
      time: string;
      title: string;
      subtitle: string | null;
      colorTag: MemberColorTag;
      chipLabel: string;
      assignees: TaskAssignee[];
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
    }
  | {
      kind: 'vacances';
      key: string;
      time: string;
      title: string;
      subtitle: string | null;
      chipLabel: string;
    };

/** Tâche vue depuis le calendrier : échéance, retard et assignataires. */
export interface CalendarTask {
  id: string;
  name: string;
  dueDate: string | null;
  status: TaskStatus;
  isLate: boolean;
  lateDays: number;
  assignees: TaskAssignee[];
}

/** Tâches visibles un jour donné : dues ce jour-là, plus les en retard
 * rappelées aujourd'hui. Sans la seconde condition, une tâche en retard
 * hanterait chaque jour futur et l'état « Journée libre » disparaîtrait. */
export function tasksOfDay(tasks: readonly CalendarTask[], date: string, today: string): CalendarTask[] {
  return tasks
    .filter(
      (task) =>
        task.status !== 'fait' &&
        task.dueDate !== null &&
        (task.dueDate === date || (task.isLate && date === today)),
    )
    .sort((a, b) => Number(b.isLate) - Number(a.isLate) || (a.dueDate as string).localeCompare(b.dueDate as string));
}

/** Journée de l'agenda : événements et tâches du foyer, anniversaires, jours fériés puis vacances. */
export function buildAgenda(
  date: string,
  sources: {
    events: readonly CalendarEvent[];
    tasks: readonly CalendarTask[];
    birthdays: readonly CalendarBirthday[];
    holidays: readonly FrenchHoliday[];
    vacations?: readonly VacationRange[];
    today: string;
  },
): AgendaItem[] {
  const { events, tasks, birthdays, holidays, vacations = [], today } = sources;
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
      categoryColor: event.categoryColor,
      chipLabel: event.categoryName ?? (event.allDay ? 'Journée entière' : 'Événement'),
      author: event.author,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const tasksOfTheDay = tasksOfDay(tasks, date, today).map<AgendaItem>((task) => ({
    kind: 'tache',
    key: `tache-${task.id}`,
    taskId: task.id,
    time: task.isLate ? 'En retard' : task.dueDate === date ? 'Échéance' : formatShortDate(task.dueDate as string),
    title: task.name,
    subtitle: task.isLate
      ? `En retard de ${task.lateDays} j`
      : task.dueDate === date
        ? null
        : `Échéance le ${formatShortDate(task.dueDate as string)}`,
    colorTag: 'violet',
    chipLabel: task.isLate ? 'En retard' : 'Tâche',
    assignees: task.assignees,
  }));

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

  const vacationsOfTheDay = vacationsOfDay(vacations, date).map<AgendaItem>((range) => ({
    kind: 'vacances',
    key: `vacances-${range.label}-${range.start}`,
    time: 'Toute la journée',
    title: range.label,
    subtitle: 'Vacances scolaires',
    colorTag: 'ink',
    chipLabel: 'Vacances',
  }));

  return [...eventsOfDay, ...tasksOfTheDay, ...birthdaysOfDay, ...holidaysOfDay, ...vacationsOfTheDay];
}

export interface DayMarker {
  count: number;
  colorTag: MemberColorTag;
  /** Couleur hex de la catégorie du premier événement (D-07) : la catégorie
   * colore la pastille, la couleur membre reste sur `colorTag`/avatars. */
  categoryColor: string | null;
  hasBirthday: boolean;
  hasHoliday: boolean;
  hasVacation: boolean;
  /** Tâches dues ce jour-là (non terminées), pastille violette. */
  hasTask: boolean;
  taskCount: number;
}

export type DayMarkerMap = Record<string, DayMarker>;

function isSameMonthDay(iso: string, monthDay: string) {
  return iso.slice(5) === monthDay;
}

/** Pastilles de la grille : couleur du membre pour un événement, violet pour une tâche, ambre pour un férié. */
export function buildDayMarkers(
  days: readonly { iso: string }[],
  sources: {
    events: readonly CalendarEvent[];
    tasks: readonly CalendarTask[];
    birthdays: readonly CalendarBirthday[];
    holidays: readonly FrenchHoliday[];
    vacations?: readonly VacationRange[];
  },
  today: string,
): DayMarkerMap {
  const markers: DayMarkerMap = {};
  days.forEach(({ iso }) => {
    const events = sources.events.filter((event) => event.date === iso);
    // Ponctuel (dû ce jour-là) plus rappels en retard épinglés à aujourd'hui :
    // sans la seconde condition, une tâche en retard teinterait tout le futur.
    const tasks = sources.tasks.filter(
      (task) =>
        task.status !== 'fait' &&
        task.dueDate !== null &&
        (task.dueDate === iso || (task.isLate && iso === today)),
    );
    const birthdays = sources.birthdays.filter((birthday) => isSameMonthDay(iso, birthday.monthDay));
    const holiday = sources.holidays.find((entry) => entry.date === iso);
    const hasVacation = vacationsOfDay(sources.vacations ?? [], iso).length > 0;
    if (events.length === 0 && tasks.length === 0 && birthdays.length === 0 && !holiday && !hasVacation) return;
    markers[iso] = {
      count: events.length + birthdays.length,
      colorTag: holiday && events.length === 0 ? 'amber' : (events[0]?.colorTag ?? birthdays[0]?.colorTag ?? 'coral'),
      categoryColor: events[0]?.categoryColor ?? null,
      hasBirthday: birthdays.length > 0,
      hasHoliday: Boolean(holiday),
      hasVacation,
      hasTask: tasks.length > 0,
      taskCount: tasks.length,
    };
  });
  return markers;
}

/** Libellé complet d'une case : « Vendredi 25 septembre 2026, 2 événements, 1 tâche ». */export function dayButtonLabel(iso: string, marker?: DayMarker) {
  const base = capitalize(formatLongDate(iso));
  if (!marker || (marker.count === 0 && marker.taskCount === 0))
    return marker?.hasHoliday
      ? `${base}, jour férié`
      : marker?.hasVacation
        ? `${base}, vacances scolaires`
        : base;
  const parts = [
    marker.count > 0 ? pluralize(marker.count, 'événement') : null,
    marker.taskCount > 0 ? pluralize(marker.taskCount, 'tâche') : null,
  ].filter((part): part is string => part !== null);
  return `${base}, ${parts.join(', ')}${marker.hasHoliday ? ', jour férié' : ''}${marker.hasVacation ? ', vacances scolaires' : ''}`;
}

/**
 * Sortie du secret (D-04) : l'événement passe d'un calendrier Perso vers le
 * Commun. Calendrier introuvable (jamais visible via RLS) = pas de
 * confirmation, la barrière serveur reste seule juge.
 */
export function isExitingPerso(
  calendars: readonly { id: string; visibility: string }[],
  fromId: string | null,
  toId: string | null,
): boolean {
  if (!fromId || !toId || fromId === toId) return false;
  const from = calendars.find((calendar) => calendar.id === fromId);
  const to = calendars.find((calendar) => calendar.id === toId);
  return from?.visibility === 'perso' && to?.visibility === 'commun';
}

