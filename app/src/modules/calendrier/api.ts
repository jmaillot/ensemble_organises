import { data } from '@/lib/data';
import type { EventReminderRow, EventRow, MemberColorTag } from '@/types';
import type { EventFormValues } from './types';

const EVENTS = 'events';
const REMINDERS = 'event_reminders';

/** Payload complet accepté par les écritures d'un événement. */
export interface EventInput extends EventFormValues {
  householdId: string;
  createdBy: string | null;
  color: MemberColorTag | null;
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
  };
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
