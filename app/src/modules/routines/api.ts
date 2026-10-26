import { data } from '@/lib/data';
import { instantOfDatetimeLocal } from '@/lib/datetime';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import type { RoutineCompletionRow, RoutineFolderRow, RoutineRow } from '@/types';
import type { RoutineAssigneeRecord, RoutineFormValues, RoutineReminderRecord } from './types';

export const ROUTINES_TABLE = 'routines';
export const ROUTINE_FOLDERS_TABLE = 'routine_folders';
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
    folder_id: values.folderId === '' ? null : values.folderId,
  };
}

/** Dossiers de routines : création (propriétaire = soi), renommage. */
export async function createRoutineFolder(
  householdId: string,
  ownerMemberId: string,
  name: string,
  visibility: RoutineFolderRow['visibility'],
): Promise<RoutineFolderRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.create<RoutineFolderRow>(ROUTINE_FOLDERS_TABLE, {
    household_id: householdId,
    name: trimmed,
    visibility,
    owner_member_id: ownerMemberId,
  });
}

export async function renameRoutineFolder(id: string, name: string): Promise<RoutineFolderRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.update<RoutineFolderRow>(ROUTINE_FOLDERS_TABLE, id, { name: trimmed });
}

/**
 * Valeur d'un `datetime-local` convertie en instant ISO, chaîne vide = aucun
 * rappel. La conversion vit dans `@/lib/datetime` (D-05).
 */
export function toReminderIso(value: string): string | null {
  return instantOfDatetimeLocal(value);
}

/** Liste de `datetime-local` → instants ISO triés, avec doublon J-1 optionnel. */
export function toReminderIsos(values: string[], autoMinus1: boolean): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (iso: string) => {
    if (seen.has(iso)) return;
    seen.add(iso);
    result.push(iso);
  };
  values.forEach((value) => {
    const iso = toReminderIso(value);
    if (iso) push(iso);
  });
  if (autoMinus1) {
    // Les 24 h se soustraient à l'INSTANT (chaque entrée est déjà en ISO UTC),
    // jamais à la valeur locale saisie : sinon le doublon se décale du fuseau.
    [...result].forEach((iso) => push(new Date(new Date(iso).getTime() - 24 * 60 * 60 * 1000).toISOString()));
  }
  return result.sort();
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
 * Remplace les assignataires d'une routine en une transaction (0133). Une
 * routine vidée de ses assignataires remplace légitimement l'ensemble par zéro
 * ligne.
 */
export async function setRoutineAssignees(routineId: string, memberIds: string[]): Promise<void> {
  await data.replaceSet('routine_assignees', routineId, memberIds);
}

/** Rappels d'une routine : remplacés plutôt qu'accumulés (zéro, un ou plusieurs). */
export async function setRoutineReminder(routineId: string, remindAt: string | null): Promise<void> {
  await setRoutineReminders(routineId, remindAt === null ? [] : [remindAt]);
}

/** Remplace l'ensemble des rappels d'une routine, en une transaction (0133). */
export async function setRoutineReminders(routineId: string, remindAts: string[]): Promise<void> {
  await data.replaceSet('routine_reminders', routineId, remindAts);
}

/** Occurrence enregistrée d'un jour donné, si elle existe. */
export async function findCompletion(routineId: string, occurrenceDate: string): Promise<RoutineCompletionRow | null> {
  const rows = await data.list<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE, {
    routine_id: routineId,
    occurrence_date: occurrenceDate,
  });
  return rows[0] ?? null;
}

/**
 * Coche l'occurrence du jour au nom de son ATTRIBUTAIRE (D-08/D-11) : l'adulte
 * qui coche, ou l'enfant « cochée pour » par le menu « Cocher pour ».
 *
 * Mode Supabase : RPC `complete_routine_occurrence` (0146, SECURITY DEFINER) —
 * l'acteur est résolu côté serveur via auth.uid() (jamais un paramètre client,
 * ENF-03) et le garde D-13 y refuse hors-module avec 42501. Une écriture
 * directe `routine_completions` est proscrite ici : la RLS 0007 filtrerait en
 * silence la délégation parentale (l'adulte ne voit pas les lignes de l'enfant).
 * Mode démo : écriture locale directe conservée, upsert (maj sinon création).
 */
export async function markOccurrenceDone(input: {
  routineId: string;
  householdId: string;
  occurrenceDate: string;
  completedBy: string | null;
}): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    if (!input.completedBy) throw new Error('Aucun membre courant pour cocher cette routine.');
    const { error } = await supabase.rpc('complete_routine_occurrence', {
      p_routine_id: input.routineId,
      p_occurrence_date: input.occurrenceDate,
      p_member_id: input.completedBy,
    });
    if (error) throw new Error(error.message);
    return;
  }
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
    // Cascade : une routine sans assignataire ni rappel n'en supprime aucun —
    // tolérance déclarée (le défaut strict en ferait une erreur).
    data.removeWhere(ROUTINE_ASSIGNEES_TABLE, { routine_id: id }, { ifMissing: 'ignore' }),
    data.removeWhere(ROUTINE_REMINDERS_TABLE, { routine_id: id }, { ifMissing: 'ignore' }),
    ...completions.map((completion) => data.remove(ROUTINE_COMPLETIONS_TABLE, completion.id)),
  ]);
}
