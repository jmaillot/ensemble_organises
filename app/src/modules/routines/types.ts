import { RRule, type ByWeekday, type Frequency, type Options } from 'rrule';
import { addDays, relativeDayLabel, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, RoutineAssigneeRow, RoutineCompletionRow, RoutineReminderRow, RoutineRow } from '@/types';

/** Statuts ports par `routine_completions.status`. */
export type RoutineCompletionStatus = RoutineCompletionRow['status'];

/** État d'une occurrence, statut enregistré compris, plus l'état « à venir ». */
export type OccurrenceState = RoutineCompletionStatus | 'a_venir';

/**
 * Fenêtres d'analyse. La RRULE est bornée à `MAX_OCCURRENCE_DAYS` : une règle
 * quotidienne ne demande jamais plus de 90 jours d'exploration.
 */
export const MAX_OCCURRENCE_DAYS = 90;
/** Fenêtre de calcul de la série. */
export const STREAK_DAYS = 90;
/** Fenêtre des occurrences « à rattraper » et de l'historique. */
export const HISTORY_DAYS = 30;
/** Autour du jour courant pour la carte mensuelle de l'historique. */
export const CALENDAR_MARGIN_DAYS = 45;

/* ------------------------------------------------------------------ */
/* Occurrences et RRULE                                                */
/* ------------------------------------------------------------------ */

const WEEKDAY_CODES: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const WEEKDAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const MONTH_LABELS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/**
 * RRule raisonne en UTC : les fenêtres sont donc saisies en « dates flottantes »
 * (minuit UTC) puis relues en jours locaux. Aucun décalage de fuseau ni changement
 * d'heure ne peut ainsi faire glisser une occurrence d'un jour.
 */
const floatingStart = (iso: string) => new Date(`${iso}T00:00:00Z`);
const floatingEnd = (iso: string) => new Date(`${iso}T23:59:59.999Z`);
const fromUtcParts = (date: Date) => new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Retire le préfixe `RRULE:` et les lignes `DTSTART`/`EXDATE` d'une règle. */
export function normaliseRule(rule: string): string {
  return rule
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (/^RRULE:/i.test(line) ? line.replace(/^RRULE:/i, '') : line))
    // Une ligne `DTSTART:…`, `EXDATE:…` ou `RRULE;X-…:…` porte une property
    // iCalendar : seule la RRULE nous intéresse.
    .filter((line) => !/^[A-Z-]+[;:]/.test(line))
    .join(';')
    .replace(/;{2,}/g, ';')
    .replace(/;$/, '')
    .toUpperCase();
}

/** Analyse une RRULE ; `null` si elle est absente ou illisible. */
export function parseRRule(rule: string): Partial<Options> | null {
  const cleaned = normaliseRule(rule);
  if (cleaned === '') return null;
  try {
    const parsed = RRule.parseString(cleaned);
    return typeof parsed.freq === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

const toNumberList = (value: number | number[] | null | undefined): number[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * Message d'erreur lisible pour une RRULE saisie à la main, `null` si elle est
 * exploitable. La construction d'un `RRule` reste la seule validation de
 * référence : elle rejette notamment un `BYDAY` inconnu.
 */
export function validateRRule(rule: string): string | null {
  const cleaned = normaliseRule(rule);
  if (cleaned === '') return 'Saisissez une règle RRULE (ex. FREQ=WEEKLY;BYDAY=MO).';
  const parsed = parseRRule(cleaned);
  if (!parsed) return 'Règle illisible : utilisez FREQ=DAILY, FREQ=WEEKLY, FREQ=MONTHLY ou FREQ=YEARLY.';
  if (typeof parsed.interval === 'number' && parsed.interval < 1) return 'L’intervalle doit valoir au moins 1.';
  if (toNumberList(parsed.bymonthday).some((day) => day < 1 || day > 31)) return 'BYMONTHDAY doit être compris entre 1 et 31.';
  if (toNumberList(parsed.bymonth).some((month) => month < 1 || month > 12)) return 'BYMONTH doit être compris entre 1 et 12.';
  try {
    // `new RRule` valide les valeurs ignorées par l'analyse lexicale (BYDAY…).
    new RRule({ ...parsed, dtstart: floatingStart(todayIso()) });
  } catch {
    return 'Règle invalide : vérifiez les valeurs de BYDAY, BYMONTHDAY ou INTERVAL.';
  }
  return null;
}

/**
 * Occurrences d'une RRULE comprises entre deux dates locales, bornes incluses.
 * Le premier jour est calé sur le fuseau local, un `DTSTART` passé est ignoré et
 * la fenêtre est plafonnée à `MAX_OCCURRENCE_DAYS`.
 */
export function occurrencesBetween(rule: string, from: Date, to: Date): Date[] {
  const parsed = parseRRule(rule);
  if (!parsed) return [];
  const fromIso = toIsoDate(from);
  const toIso = toIsoDate(to);
  if (toIso < fromIso) return [];
  const capIso = addDays(fromIso, MAX_OCCURRENCE_DAYS);
  const endIso = toIso < capIso ? toIso : capIso;
  const start = floatingStart(fromIso);
  // Un `DTSTART` déjà dépassé ne doit pas restreindre la recherche.
  const dtstart = parsed.dtstart && parsed.dtstart.getTime() > start.getTime() ? parsed.dtstart : start;
  return new RRule({ ...parsed, dtstart }).between(start, floatingEnd(endIso), true).map(fromUtcParts);
}

/** Même calcul, exprimé en chaînes ISO `AAAA-MM-JJ`. */
export function occurrencesBetweenIso(rule: string, fromIso: string, toIso: string): string[] {
  return occurrencesBetween(rule, toLocalDate(fromIso), toLocalDate(toIso)).map(toIsoDate);
}

/** La routine est-elle due ce jour-là ? */
export function isDueOn(rule: string, iso: string): boolean {
  return occurrencesBetweenIso(rule, iso, iso).length > 0;
}

/** Prochaine occurrence à partir d'un jour inclus. */
export function nextOccurrence(rule: string, fromIso: string): string | null {
  return occurrencesBetweenIso(rule, fromIso, addDays(fromIso, MAX_OCCURRENCE_DAYS))[0] ?? null;
}

/** Prochaine occurrence strictement postérieure à un jour. */
export function nextOccurrenceAfter(rule: string, fromIso: string): string | null {
  return occurrencesBetweenIso(rule, addDays(fromIso, 1), addDays(fromIso, MAX_OCCURRENCE_DAYS))[0] ?? null;
}

/** Liste triée des codes de jours (0 = lundi) portés par un `BYDAY`. */
function weekdayCodes(value: ByWeekday | ByWeekday[] | null | undefined): number[] {
  if (value === null || value === undefined) return [];
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => {
      if (typeof entry === 'number') return entry % 7;
      if (typeof entry === 'string') {
        const match = /^(\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(entry.toUpperCase());
        return match ? WEEKDAY_CODES[match[2]] : null;
      }
      if (typeof entry === 'object' && typeof entry.weekday === 'number') return entry.weekday % 7;
      return null;
    })
    .filter((code): code is number => code !== null)
    .sort((a, b) => a - b);
}

const joinList = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;

/** « chaque lundi », « les lundis et mercredis », « chaque jour de la semaine ». */
function describeDays(codes: number[], plural: boolean): string {
  if (codes.length === 0) return '';
  if (codes.length === 7) return 'tous les jours';
  if (codes.length === 5 && codes[0] === 0 && codes[4] === 4) return 'chaque jour de la semaine';
  const names = codes.map((code) => WEEKDAY_LABELS[code] ?? '');
  if (codes.length === 1) return plural ? `les ${names[0]}s` : names[0];
  return plural ? `les ${joinList(names.map((name) => `${name}s`))}` : joinList(names);
}

/** Libellé français lisible d'une RRULE iCalendar. */
export function describeRecurrence(rule: string): string {
  const parsed = parseRRule(rule);
  if (!parsed) return 'Récurrence à vérifier';
  const interval = typeof parsed.interval === 'number' && parsed.interval > 1 ? parsed.interval : 1;
  const codes = weekdayCodes(parsed.byweekday);
  const dayPart = codes.length > 0 ? describeDays(codes, false) : '';
  const daysPart = codes.length > 0 ? describeDays(codes, true) : '';

  switch (parsed.freq as Frequency) {
    case RRule.DAILY:
      return interval === 1 ? 'Tous les jours' : `Tous les ${interval} jours`;
    case RRule.WEEKLY:
      if (interval === 1) return codes.length > 0 ? `Chaque ${dayPart}` : 'Chaque semaine';
      return `Toutes les ${interval} semaines${daysPart ? `, ${daysPart}` : ''}`;
    case RRule.MONTHLY: {
      const monthDay = toNumberList(parsed.bymonthday)[0];
      if (monthDay) return `Le ${monthDay} de chaque mois`;
      if (codes.length > 0) {
        return interval === 1 ? `Chaque mois, le ${dayPart}` : `Tous les ${interval} mois, le ${dayPart}`;
      }
      return interval === 1 ? 'Chaque mois' : `Tous les ${interval} mois`;
    }
    case RRule.YEARLY: {
      const month = toNumberList(parsed.bymonth)[0];
      const monthDay = toNumberList(parsed.bymonthday)[0];
      if (month && monthDay) return `Chaque ${monthDay} ${MONTH_LABELS[month - 1]}`;
      if (month) return `Chaque ${MONTH_LABELS[month - 1]}`;
      if (codes.length > 0) return `Chaque année, le ${dayPart}`;
      return interval === 1 ? 'Chaque année' : `Tous les ${interval} ans`;
    }
    default:
      return 'Récurrence personnalisée';
  }
}

/** Première lettre en minuscule, pour les phrases d'aperçu. */
export const lowercaseFirst = (value: string) => (value ? `${value[0].toLowerCase()}${value.slice(1)}` : value);

/* ------------------------------------------------------------------ */
/* Presets du formulaire                                               */
/* ------------------------------------------------------------------ */

export type FrequencyPreset = 'quotidien' | 'hebdomadaire' | 'mensuel' | 'annuel' | 'personnalise';

/** Chaque preset compose une vraie RRULE, y compris l'aperçu affiché. */
export const frequencyPresets: ReadonlyArray<{ value: FrequencyPreset; label: string; rule: string }> = [
  { value: 'quotidien', label: 'Quotidien', rule: 'FREQ=DAILY' },
  { value: 'hebdomadaire', label: 'Chaque semaine', rule: 'FREQ=WEEKLY;BYDAY=MO' },
  { value: 'mensuel', label: 'Chaque mois', rule: 'FREQ=MONTHLY' },
  { value: 'annuel', label: 'Chaque année', rule: 'FREQ=YEARLY' },
  { value: 'personnalise', label: 'Personnalisé', rule: '' },
];

/** RRULE réellement enregistrée pour un choix du formulaire. */
export function ruleForPreset(preset: FrequencyPreset, customRule: string): string {
  if (preset === 'personnalise') return normaliseRule(customRule);
  return frequencyPresets.find((entry) => entry.value === preset)?.rule ?? 'FREQ=DAILY';
}

/** Preset correspondant à une règle déjà enregistrée. */
export function presetForRule(rule: string): FrequencyPreset {
  const cleaned = normaliseRule(rule);
  return frequencyPresets.find((entry) => entry.rule === cleaned)?.value ?? 'personnalise';
}

/* ------------------------------------------------------------------ */
/* Type métier                                                         */
/* ------------------------------------------------------------------ */

/** Saisie du dialogue de création et de modification. */
export interface RoutineFormValues {
  name: string;
  frequency: FrequencyPreset;
  /** RRULE libre, utilisée uniquement par le preset « Personnalisé ». */
  customRule: string;
  description: string;
  assigneeIds: string[];
  /** Valeur d'un `datetime-local`, chaîne vide pour « pas de rappel ». */
  reminderAt: string;
}

/** `routine_assignees` n'a pas de colonne `id` : clé primaire composite. */
export type RoutineAssigneeRecord = { id: string } & Pick<RoutineAssigneeRow, 'routine_id' | 'member_id'>;
export type RoutineReminderRecord = { id: string } & RoutineReminderRow;

export interface RoutineAssignee {
  memberId: string;
  member: HouseholdMemberRow;
}

export interface Routine {
  id: string;
  name: string;
  description: string | null;
  recurrenceRule: string;
  /** « Chaque semaine », « Le 15 de chaque mois »… */
  frequencyLabel: string;
  preset: FrequencyPreset;
  assignees: RoutineAssignee[];
  reminderAt: string | null;
  reminderLabel: string | null;
  createdBy: string | null;
  createdAt: string;
  /** La routine tombe aujourd'hui d'après sa RRULE. */
  isDueToday: boolean;
  /** L'occurrence du jour est enregistrée comme faite. */
  isDoneToday: boolean;
  /** Occurrences consécutives terminées, en remontant depuis aujourd'hui. */
  streak: number;
  /** « 12 jours d’affilée » ou « Série à relancer ». */
  streakLabel: string;
  /** Occurrences passées non faites, postérieures à la création. */
  missedDates: string[];
  /** Prochaine occurrence, jour courant compris s'il reste à faire. */
  nextDate: string | null;
  /** « Demain », « Dans 3 jours », ou `Aucune occurrence`. */
  nextLabel: string;
}

/** Ce qu'une routine reçoit des tables enfants et de sa propre RRULE. */
export interface RoutineContext {
  assignees: RoutineAssignee[];
  reminderAt: string | null;
  isDueToday: boolean;
  isDoneToday: boolean;
  streak: number;
  missedDates: string[];
  nextDate: string | null;
}

const emptyContext: RoutineContext = {
  assignees: [],
  reminderAt: null,
  isDueToday: false,
  isDoneToday: false,
  streak: 0,
  missedDates: [],
  nextDate: null,
};

const clockFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const formatClockTime = (iso: string) => clockFormatter.format(toLocalDate(iso));
export const memberFirstName = (name: string) => name.split(' ')[0]?.trim() || name;

const streakLabel = (streak: number) =>
  streak > 0 ? `${streak} jour${streak > 1 ? 's' : ''} d’affilée` : 'Série à relancer';

/** Conversion d'une ligne `routines` en type métier. */
export function toRoutine(row: RoutineRow, context: RoutineContext = emptyContext): Routine {
  const reminderTime = context.reminderAt ? formatClockTime(context.reminderAt) : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    recurrenceRule: row.recurrence_rule,
    frequencyLabel: describeRecurrence(row.recurrence_rule),
    preset: presetForRule(row.recurrence_rule),
    assignees: context.assignees,
    reminderAt: context.reminderAt,
    reminderLabel: reminderTime ? `Rappel ${reminderTime}` : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    isDueToday: context.isDueToday,
    isDoneToday: context.isDoneToday,
    streak: context.streak,
    streakLabel: streakLabel(context.streak),
    missedDates: context.missedDates,
    nextDate: context.nextDate,
    nextLabel: context.nextDate ? relativeDayLabel(context.nextDate) : 'Aucune occurrence',
  };
}

/** Index des occurrences enregistrées, par routine puis par jour. */
export function indexCompletions(completions: RoutineCompletionRow[]): Map<string, Map<string, RoutineCompletionRow>> {
  const index = new Map<string, Map<string, RoutineCompletionRow>>();
  completions.forEach((row) => {
    const byDate = index.get(row.routine_id) ?? new Map<string, RoutineCompletionRow>();
    byDate.set(row.occurrence_date, row);
    index.set(row.routine_id, byDate);
  });
  return index;
}

/**
 * Assemble `routines`, `routine_assignees`, `routine_reminders` et
 * `routine_completions` en routines métier, série et retard compris.
 */
export function buildRoutines(
  rows: RoutineRow[],
  assigneeRows: RoutineAssigneeRecord[],
  reminderRows: RoutineReminderRecord[],
  completionRows: RoutineCompletionRow[],
  members: HouseholdMemberRow[],
  today: string = todayIso(),
): Routine[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const completions = indexCompletions(completionRows);

  const assigneesByRoutine = new Map<string, RoutineAssigneeRecord[]>();
  assigneeRows.forEach((row) =>
    assigneesByRoutine.set(row.routine_id, [...(assigneesByRoutine.get(row.routine_id) ?? []), row]),
  );
  const remindersByRoutine = new Map<string, string>();
  reminderRows.forEach((row) => {
    const current = remindersByRoutine.get(row.routine_id);
    if (current === undefined || row.remind_at < current) remindersByRoutine.set(row.routine_id, row.remind_at);
  });

  return rows.map((row) => {
    const done = completions.get(row.id) ?? new Map<string, RoutineCompletionRow>();
    const statusOf = (date: string) => done.get(date)?.status;
    // Fenêtre de série : les 90 derniers jours, jour courant inclus.
    const pastDates = occurrencesBetweenIso(row.recurrence_rule, addDays(today, -(STREAK_DAYS - 1)), today);

    let streak = 0;
    for (let index = pastDates.length - 1; index >= 0; index -= 1) {
      if (statusOf(pastDates[index]) !== 'fait') break;
      streak += 1;
    }

    // Une occurrence antérieure à la création de la routine n'est pas un retard.
    const createdIso = toIsoDate(toLocalDate(row.created_at));
    const missedDates = pastDates.filter(
      (date) => date < today && date >= createdIso && statusOf(date) !== 'fait',
    );
    const isDueToday = pastDates.includes(today);
    const isDoneToday = statusOf(today) === 'fait';
    const nextDate =
      isDueToday && isDoneToday ? nextOccurrenceAfter(row.recurrence_rule, today) : nextOccurrence(row.recurrence_rule, today);

    return toRoutine(row, {
      assignees: (assigneesByRoutine.get(row.id) ?? [])
        .map((assignee) => ({ memberId: assignee.member_id, member: membersById.get(assignee.member_id) }))
        .filter((assignee): assignee is RoutineAssignee => Boolean(assignee.member))
        .sort((a, b) => a.member.display_name.localeCompare(b.member.display_name, 'fr')),
      reminderAt: remindersByRoutine.get(row.id) ?? null,
      isDueToday,
      isDoneToday,
      streak,
      missedDates,
      nextDate,
    });
  });
}

/** Routines du jour d'abord, les plus urgentes en tête, puis par nom. */
export function sortRoutines(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => {
    if (a.isDueToday !== b.isDueToday) return a.isDueToday ? -1 : 1;
    if (a.isDueToday && a.isDoneToday !== b.isDoneToday) return a.isDoneToday ? 1 : -1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Occurrences dues aujourd'hui, les plus anciennes séries ouvertes en tête. */
export function todayOccurrences(routines: Routine[]): Routine[] {
  return sortRoutines(routines.filter((routine) => routine.isDueToday));
}

export function filterRoutines(routines: Routine[], query: string): Routine[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return routines;
  return routines.filter(
    (routine) =>
      routine.name.toLowerCase().includes(needle) || (routine.description ?? '').toLowerCase().includes(needle),
  );
}

export interface RoutineMetrics {
  total: number;
  /** Occurrences attendues aujourd'hui. */
  dueTodayCount: number;
  /** Occurrences déjà cochées aujourd'hui. */
  doneTodayCount: number;
  bestStreak: number;
  /** Occurrences passées non faites, sur la fenêtre d'historique. */
  late: number;
}

export function routineMetrics(routines: Routine[]): RoutineMetrics {
  const due = routines.filter((routine) => routine.isDueToday);
  return {
    total: routines.length,
    dueTodayCount: due.length,
    doneTodayCount: due.filter((routine) => routine.isDoneToday).length,
    bestStreak: routines.reduce((best, routine) => Math.max(best, routine.streak), 0),
    late: routines.reduce((total, routine) => total + routine.missedDates.length, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Historique                                                          */
/* ------------------------------------------------------------------ */

export const historyPeriods: ReadonlyArray<{ value: number; label: string }> = [
  { value: 7, label: '7 derniers jours' },
  { value: 30, label: '30 derniers jours' },
];

export type HistoryPeriod = (typeof historyPeriods)[number]['value'];

export const occurrenceLabels: Record<OccurrenceState, string> = {
  fait: 'Terminée',
  en_retard: 'En retard',
  manque: 'Manquée',
  a_venir: 'À venir',
};

export const occurrenceTones: Record<OccurrenceState, 'accent' | 'coral' | 'amber' | 'muted'> = {
  fait: 'accent',
  en_retard: 'coral',
  manque: 'amber',
  a_venir: 'muted',
};

export interface HistoryEntry {
  /** Identité stable de la ligne (occurrence enregistrée ou occurrence à venir). */
  key: string;
  date: string;
  routineId: string;
  routineName: string;
  state: OccurrenceState;
  /** Membre ayant terminé l'occurrence, si l'écriture le renseigne. */
  authorName: string | null;
  /** Vrai pour une occurrence réellement enregistrée, donc supprimable. */
  canDelete: boolean;
}

/**
 * Historique du foyer sur une période : occurrences enregistrées, occurrences
 * passées à rattraper, puis la prochaine occurrence de chaque routine.
 */
export function routineHistory(
  routines: Routine[],
  completionRows: RoutineCompletionRow[],
  members: HouseholdMemberRow[],
  periodDays: number = HISTORY_DAYS,
  today: string = todayIso(),
): HistoryEntry[] {
  const fromIso = addDays(today, -(periodDays - 1));
  const membersById = new Map(members.map((member) => [member.id, member]));
  const authorName = (memberId: string | null) =>
    memberId === null ? null : (membersById.get(memberId)?.display_name ?? null);

  const past: HistoryEntry[] = [];
  const upcoming: HistoryEntry[] = [];

  routines.forEach((routine) => {
    completionRows
      .filter(
        (row) =>
          row.routine_id === routine.id && row.occurrence_date >= fromIso && row.occurrence_date <= today,
      )
      .forEach((row) =>
        past.push({
          key: row.id,
          date: row.occurrence_date,
          routineId: routine.id,
          routineName: routine.name,
          state: row.status,
          authorName: authorName(row.completed_by),
          canDelete: true,
        }),
      );

    routine.missedDates
      .filter((date) => date >= fromIso)
      .forEach((date) =>
        past.push({
          key: `${routine.id}|${date}`,
          date,
          routineId: routine.id,
          routineName: routine.name,
          state: 'en_retard',
          authorName: null,
          canDelete: false,
        }),
      );

    if (routine.nextDate !== null) {
      upcoming.push({
        key: `${routine.id}|${routine.nextDate}|a_venir`,
        date: routine.nextDate,
        routineId: routine.id,
        routineName: routine.name,
        state: 'a_venir',
        authorName: null,
        canDelete: false,
      });
    }
  });

  past.sort((a, b) => (a.date === b.date ? a.routineName.localeCompare(b.routineName, 'fr') : a.date < b.date ? 1 : -1));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return [...past, ...upcoming];
}

export interface DayStatus {
  state: OccurrenceState;
  /** Nombre d'occurrences attendues ce jour-là. */
  count: number;
}

export type DayStatusMap = Record<string, DayStatus>;

/** Priorité d'affichage d'une journée : le pire état l'emporte. */
const STATE_PRIORITY: Record<OccurrenceState, number> = { en_retard: 3, manque: 2, a_venir: 1, fait: 0 };

/**
 * État de chaque jour autour du jour courant, pour la carte mensuelle de
 * l'historique. Une journée sans occurrence n'apparaît pas.
 */
export function routineDayStatuses(
  routines: Routine[],
  completionRows: RoutineCompletionRow[],
  fromIso: string,
  toIso: string,
  today: string = todayIso(),
): DayStatusMap {
  const completions = indexCompletions(completionRows);
  const map: DayStatusMap = {};

  routines.forEach((routine) => {
    const done = completions.get(routine.id) ?? new Map<string, RoutineCompletionRow>();
    const createdIso = toIsoDate(toLocalDate(routine.createdAt));
    occurrencesBetweenIso(routine.recurrenceRule, fromIso, toIso).forEach((date) => {
      const status = done.get(date)?.status;
      let state: OccurrenceState;
      if (date > today) state = 'a_venir';
      else if (date === today) state = status === 'fait' ? 'fait' : 'manque';
      else if (status === 'fait') state = 'fait';
      // Avant la création de la routine, l'absence de trace n'est pas un retard.
      else state = date >= createdIso ? 'en_retard' : 'fait';

      const current = map[date];
      if (!current) {
        map[date] = { state, count: 1 };
        return;
      }
      map[date] = {
        state: STATE_PRIORITY[state] > STATE_PRIORITY[current.state] ? state : current.state,
        count: current.count + 1,
      };
    });
  });

  return map;
}
