import { data } from '@/lib/data';
import type { RoutineCompletionRow, RoutineRow } from '@/types';
import type { RoutineAssigneeRecord, RoutineFormValues, RoutineReminderRecord } from './types';

export const ROUTINES_TABLE = 'routines';
export const ROUTINE_ASSIGNEES_TABLE = 'routine_assignees';
export const ROUTINE_REMINDERS_TABLE = 'routine_reminders';
export const ROUTINE_COMPLETIONS_TABLE = 'routine_completions';

export type RoutinePayload = Partial<RoutineRow>;

/** Ce qu'une écriture de routine reçoit du formulaire. */
export interface RoutineInput {
  householdId: string;
  createdBy: string | null;
}

/** Transforme la saisie du dialogue en ligne `routines`. */
export function toRoutinePayload(values: RoutineFormValues, recurrenceRule: string): RoutinePayload {
  return {
    name: values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    recurrence_rule: recurrenceRule,
  };
}

/** Valeur d'un `datetime-local` convertie en ISO, chaîne vide = aucun rappel. */
export function toReminderIso(value: string): string | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Assignataires d'un ensemble de routines (table de jointure, sans `id`). */
export async function listRoutineAssignees(routineIds: string[]): Promise<RoutineAssigneeRecord[]> {
  if (routineIds.length === 0) return [];
  return data.list<RoutineAssigneeRecord>(ROUTINE_ASSIGNEES_TABLE, { routine_id: routineIds });
}

/** Rappels des routines demandées. */
export async function listRoutineReminders(routineIds: string[]): Promise<RoutineReminderRecord[]> {
  if (routineIds.length === 0) return [];
  return data.list<RoutineReminderRecord>(ROUTINE_REMINDERS_TABLE, { routine_id: routineIds });
}

/** Occurrences enregistrées pour un ensemble de routines. */
export async function listRoutineCompletions(routineIds: string[]): Promise<RoutineCompletionRow[]> {
  if (routineIds.length === 0) return [];
  return data.list<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, { routine_id: routineIds });
}

/**
 * Remplace les assignataires d'une routine. La table n'a pas de colonne `id` :
 * on repart donc de la liste existante au lieu d'alterner ajouts et retraits.
 */
export async function setRoutineAssignees(routineId: string, memberIds: string[]): Promise<void> {
  await data.removeWhere(ROUTINE_ASSIGNEES_TABLE, { routine_id: routineId });
  await Promise.all(
    memberIds.map((memberId) => data.create<RoutineAssigneeRecord>(ROUTINE_ASSIGNEES_TABLE, { routine_id: routineId, member_id: memberId })),
  );
}

/** Un seul rappel par routine : il est remplacé plutôt qu'accumulé. */
export async function setRoutineReminder(routineId: string, remindAt: string | null): Promise<void> {
  await data.removeWhere(ROUTINE_REMINDERS_TABLE, { routine_id: routineId });
  if (remindAt !== null) {
    await data.create<RoutineReminderRecord>(ROUTINE_REMINDERS_TABLE, { routine_id: routineId, remind_at: remindAt });
  }
}

/** Occurrence enregistrée d'un jour donné, si elle existe. */
export async function findCompletion(routineId: string, occurrenceDate: string): Promise<RoutineCompletionRow | null> {
  const rows = await data.list<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, {
    routine_id: routineId,
    occurrence_date: occurrenceDate,
  });
  return rows[0] ?? null;
}

/** Coche l'occurrence du jour : mise à jour si elle existe, création sinon. */
export async function markOccurrenceDone(input: {
  routineId: string;
  householdId: string;
  occurrenceDate: string;
  completedBy: string | null;
}): Promise<void> {
  const values = {
    household_id: input.householdId,
    completed_by: input.completedBy,
    completed_at: new Date().toISOString(),
    status: 'fait',
  } satisfies Partial<RoutineCompletionRow>;
  const existing = await findCompletion(input.routineId, input.occurrenceDate);
  if (existing) {
    await data.update<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, existing.id, values);
    return;
  }
  await data.create<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, {
    routine_id: input.routineId,
    occurrence_date: input.occurrenceDate,
    ...values,
  });
}

/**
 * Décoche l'occurrence du jour : la trace reste visible avec le statut
 * `manque`, ce qui alimente l'historique plutôt que de l'effacer.
 */
export async function markOccurrenceMissed(input: {
  routineId: string;
  householdId: string;
  occurrenceDate: string;
}): Promise<void> {
  const existing = await findCompletion(input.routineId, input.occurrenceDate);
  if (!existing) return;
  await data.update<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, existing.id, {
    status: 'manque',
    completed_by: null,
    completed_at: null,
  });
}

/** Retire définitivement une occurrence de l'historique. */
export async function deleteOccurrence(routineId: string, occurrenceDate: string): Promise<void> {
  const existing = await findCompletion(routineId, occurrenceDate);
  if (existing) await data.remove(ROUTINE_COMPLETIONS_TABLE, existing.id);
}

/**
 * Nettoyage en cascade : IndexedDB n'a pas de clés étrangères, les assignataires,
 * rappels et occurrences d'une routine disparaissent avec elle. La ligne
 * `routines` elle-même est supprimée par la ressource du module.
 */
export async function deleteRoutineChildren(id: string): Promise<void> {
  const completions = await listRoutineCompletions([id]);
  await Promise.all([
    data.removeWhere(ROUTINE_ASSIGNEES_TABLE, { routine_id: id }),
    data.removeWhere(ROUTINE_REMINDERS_TABLE, { routine_id: id }),
    ...completions.map((completion) => data.remove(ROUTINE_COMPLETIONS_TABLE, completion.id)),
  ]);
}
