import { data } from '@/lib/data';
import type { EventCalendarRow, EventCategoryRow, EventReminderRow, EventRow, MemberColorTag } from '@/types';
import type { EventFormValues } from './types';

const EVENTS = 'events';
const REMINDERS = 'event_reminders';
const CALENDARS = 'event_calendars';
const CATEGORIES = 'event_categories';

/** Payload complet accepté par les écritures d'un événement. */
export interface EventInput extends Omit<EventFormValues, 'categoryId' | 'calendarId'> {
  householdId: string;
  createdBy: string | null;
  color: MemberColorTag | null;
  calendarId: string | null;
  categoryId: string | null;
}

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Compose l'ISO local stockée dans `events.start_at` / `end_at`. */
export function composeDateTime(date: string, time: string, allDay: boolean) {
  if (allDay || time.trim() === '') return `${date}T00:00:00`;
  return `${date}T${time}:00`;
}

function toRowValues(input: EventInput) {
  return {
    household_id: input.householdId,
    title: input.title.trim(),
    description: emptyToNull(input.description),
    start_at: composeDateTime(input.date, input.startTime, input.allDay),
    end_at: input.allDay ? null : composeDateTime(input.date, input.endTime || input.startTime, false),
    all_day: input.allDay,
    location: emptyToNull(input.location),
    color: input.color,
    created_by: input.createdBy,
    ...(input.calendarId ? { calendar_id: input.calendarId } : {}),
    ...(input.categoryId ? { category_id: input.categoryId } : { category_id: null }),
  };
}

export async function listCalendars(): Promise<EventCalendarRow[]> {
  return data.list<EventCalendarRow>(CALENDARS);
}

export async function listCategories(): Promise<EventCategoryRow[]> {
  return data.list<EventCategoryRow>(CATEGORIES);
}

/** Id du calendrier Commun du foyer, ou null si absent (le trigger SQL le créera). */
export async function resolveCommunCalendarId(householdId: string): Promise<string | null> {
  const calendars = await listCalendars();
  return calendars.find((cal) => cal.household_id === householdId && cal.name === 'Commun')?.id ?? null;
}

export async function createPersonalCalendar(householdId: string, ownerMemberId: string, name: string): Promise<EventCalendarRow> {  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 40) throw new Error('Nom de calendrier invalide (1 à 40 caractères).');
  return data.create<EventCalendarRow>(CALENDARS, {
    household_id: householdId,
    name: trimmed,
    visibility: 'perso',
    owner_member_id: ownerMemberId,
  });
}

const CATEGORY_COLORS = ['#E8930C', '#D64545', '#3E7CB1', '#4CAF50', '#7C5CBF', '#E86AA0'] as const;

export { CATEGORY_COLORS };

export async function createCategory(
  householdId: string,
  createdBy: string | null,
  name: string,
  color: string,
): Promise<EventCategoryRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 40) throw new Error('Nom de catégorie invalide (1 à 40 caractères).');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Couleur de catégorie invalide.');
  return data.create<EventCategoryRow>(CATEGORIES, {
    household_id: householdId,
    name: trimmed,
    color,
    created_by: createdBy,
  });
}

export async function listEventReminders(eventIds: string[]): Promise<EventReminderRow[]> {
  if (eventIds.length === 0) return [];
  return data.list<EventReminderRow>(REMINDERS, { event_id: eventIds });
}

export async function createEventRow(input: EventInput): Promise<EventRow> {
  return data.create<EventRow>(EVENTS, toRowValues(input));
}

export async function updateEventRow(id: string, input: EventInput): Promise<EventRow> {
  return data.update<EventRow>(EVENTS, id, toRowValues(input));
}

/** Un rappel par événement : on remplace l'existant plutôt que de l'accumuler. */
export async function replaceEventReminder(eventId: string, remindAt: string | null): Promise<void> {
  const existing = await listEventReminders([eventId]);
  await Promise.all(existing.map((reminder) => data.remove(REMINDERS, reminder.id)));
  if (remindAt) await data.create<EventReminderRow>(REMINDERS, { event_id: eventId, remind_at: remindAt });
}

/** Création ou mise à jour, rappel compris. */
export async function saveEvent(id: string | null, input: EventInput): Promise<EventRow> {
  const row = id ? await updateEventRow(id, input) : await createEventRow(input);
  await replaceEventReminder(row.id, input.remindAt.trim() === '' ? null : `${input.remindAt.trim()}:00`);
  return row;
}

/** Suppression d'un événement et de ses rappels associés. */
export async function deleteEvent(id: string): Promise<void> {
  const reminders = await listEventReminders([id]);
  await Promise.all(reminders.map((reminder) => data.remove(REMINDERS, reminder.id)));
  await data.remove(EVENTS, id);
}
