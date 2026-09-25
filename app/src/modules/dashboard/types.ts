import type { DashboardWidgetRow, DashboardWidgetType } from '@/types';
import { toLocalDate, todayIso } from '@/lib/utils';

/** Type de widget et son état d'affichage. */
export type WidgetKind = DashboardWidgetType;

export interface WidgetPreference {
  kind: WidgetKind;
  visible: boolean;
}

export interface Widget {
  kind: WidgetKind;
  label: string;
  icon: 'calendar' | 'checkCircle' | 'sun' | 'heart' | 'wand';
  visible: boolean;
}

export const WIDGET_META: Record<WidgetKind, { label: string; icon: Widget['icon'] }> = {
  calendrier: { label: 'Calendrier', icon: 'calendar' },
  taches: { label: 'Tâches', icon: 'checkCircle' },
  meteo: { label: 'Météo', icon: 'sun' },
  anniversaires: { label: 'Anniversaires', icon: 'heart' },
  routines: { label: 'Routines', icon: 'wand' },
};

/** Ordre par défaut quand un membre n'a encore rien personnalisé. */
export const DEFAULT_WIDGET_ORDER: WidgetKind[] = [
  'calendrier',
  'taches',
  'meteo',
  'anniversaires',
  'routines',
];

/** Colonnes de la grille : deux widgets par ligne sur grand écran. */
export const WIDGET_COLUMNS = 2;

export interface WidgetPlacement {
  kind: WidgetKind;
  /** Rang dans la grille (rang % colonnes = colonne). */
  index: number;
  width: 1 | 2;
  row: number;
}

export function toWidgetPreferences(rows: DashboardWidgetRow[]): WidgetPreference[] {
  if (rows.length === 0) {
    return DEFAULT_WIDGET_ORDER.map((kind) => ({ kind, visible: true }));
  }
  // La grille stocke (position_x, position_y) : l'ordre de lecture est celui
  // d'une ligne puis d'une colonne, sinon deux widgets de la même colonne se
  // retrouvent mal ordonnés.
  const ordered = [...rows].sort((a, b) => a.position_y - b.position_y || a.position_x - b.position_x);
  // Un seul widget par type : une ligne en double ne doit jamais produire deux
  // cartes identiques.
  const seen = new Set<WidgetKind>();
  return ordered
    .filter((row) => {
      if (seen.has(row.widget_type)) return false;
      seen.add(row.widget_type);
      return true;
    })
    .map((row) => ({ kind: row.widget_type, visible: row.width > 0 }));
}

/**
 * Placement dans la grille des widgets. Le widget « routines » du jeu de
 * démonstration occupe toute la largeur (width = 2), comme dans l'export.
 */
export function layoutWidgets(preferences: WidgetPreference[]): WidgetPlacement[] {
  const visible = preferences.filter((preference) => preference.visible);
  let cursor = 0;
  return visible.map((preference, position) => {
    const width: 1 | 2 = preference.kind === 'routines' ? 2 : 1;
    const placement: WidgetPlacement = { kind: preference.kind, index: position, width, row: 0 };
    cursor += width;
    if (cursor % WIDGET_COLUMNS === 0) placement.row = cursor / WIDGET_COLUMNS - 1;
    else placement.row = Math.floor(cursor / WIDGET_COLUMNS);
    return placement;
  });
}

export function reorderPreferences(
  preferences: WidgetPreference[],
  from: WidgetKind,
  to: WidgetKind,
): WidgetPreference[] {
  if (from === to) return preferences;
  const fromIndex = preferences.findIndex((preference) => preference.kind === from);
  const toIndex = preferences.findIndex((preference) => preference.kind === to);
  if (fromIndex < 0 || toIndex < 0) return preferences;
  const next = [...preferences];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function toggleWidget(preferences: WidgetPreference[], kind: WidgetKind): WidgetPreference[] {
  return preferences.map((preference) =>
    preference.kind === kind ? { ...preference, visible: !preference.visible } : preference,
  );
}

/** Range la liste dans l'ordre par défaut ( widgets visibles d'abord ). */
export function resetPreferences(): WidgetPreference[] {
  return DEFAULT_WIDGET_ORDER.map((kind) => ({ kind, visible: true }));
}

/* ------------------------------------------------------------------ */
/* Petits calculs d'affichage réutilisés par les widgets                */
/* ------------------------------------------------------------------ */

export interface MiniCalendarDay {
  iso: string;
  number: number;
  isOutside: boolean;
  hasEvent: boolean;
  isHoliday: boolean;
  isToday: boolean;
}

/** Grille du mini-calendrier du widget (semaine commencing le lundi). */
export function buildMiniCalendar(
  cursor: Date,
  eventDates: Set<string>,
  holidayDates: Set<string>,
): { days: MiniCalendarDay[]; monthLabel: string } {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const today = todayIso();
  const days: MiniCalendarDay[] = [];
  for (let index = 0; index < cells; index += 1) {
    const dayNumber = index - firstWeekday + 1;
    const date = new Date(year, month, dayNumber);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({
      iso,
      number: date.getDate(),
      isOutside: dayNumber < 1 || dayNumber > daysInMonth,
      hasEvent: eventDates.has(iso),
      isHoliday: holidayDates.has(iso),
      isToday: iso === today,
    });
  }
  return { days, monthLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(cursor) };
}

export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** Formats de l'en-tête de l'accueil. */
export function formatDashboardEyebrow(now: Date, householdName: string) {
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${householdName}`;
}

export function firstName(displayName: string) {
  return displayName.split(' ')[0] ?? displayName;
}

/** Prochain rendez-vous du jour, s'il y en a un. */
export function nextEventOfDay<T extends { start_at: string; title: string; location: string | null }>(
  events: T[],
  now = new Date(),
): T | null {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const sameDay = events
    .filter((event) => toLocalDate(event.start_at).toDateString() === now.toDateString())
    .map((event) => {
      const start = toLocalDate(event.start_at);
      return { event, minutes: start.getHours() * 60 + start.getMinutes() };
    })
    .sort((a, b) => a.minutes - b.minutes);
  const upcoming = sameDay.find((entry) => entry.minutes >= minutesNow);
  return (upcoming ?? sameDay[0])?.event ?? null;
}
