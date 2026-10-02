import { data } from '@/lib/data';
import type { TaskListRow, TaskRow } from '@/types';
import type { TaskAssigneeRecord, TaskFormValues, TaskReminderRecord } from './types';

export const TASKS_TABLE = 'tasks';
export const TASK_LISTS_TABLE = 'task_lists';
export const TASK_ASSIGNEES_TABLE = 'task_assignees';
export const TASK_REMINDERS_TABLE = 'task_reminders';

export type TaskPayload = Partial<TaskRow>;

/** Transforme la saisie du dialogue en ligne `tasks`. */
export function toTaskPayload(
  values: TaskFormValues,
  extra: { priorityOrder: number; status: TaskRow['status'] },
): TaskPayload {
  return {
    name: values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    due_date: values.dueDate === '' ? null : values.dueDate,
    priority_order: extra.priorityOrder,
    status: extra.status,
    folder_id: values.folderId === '' ? null : values.folderId,
  };
}

/** Valeur d'un `datetime-local` convertie en ISO, chaîne vide = aucun rappel. */
export function toReminderIso(value: string): string | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Assignataires d'un ensemble de tâches (table de jointure, sans `household_id`). */
export async function listTaskAssignees(taskIds: string[]): Promise<TaskAssigneeRecord[]> {
  if (taskIds.length === 0) return [];
  return data.list<TaskAssigneeRecord>(TASK_ASSIGNEES_TABLE, { task_id: taskIds });
}

/** Rappels des tâches demandées. */
export async function listTaskReminders(taskIds: string[]): Promise<TaskReminderRecord[]> {
  if (taskIds.length === 0) return [];
  return data.list<TaskReminderRecord>(TASK_REMINDERS_TABLE, { task_id: taskIds });
}

/**
 * Remplace les assignataires d'une tâche. La table n'a pas de colonne `id` :
 * on repart donc de la liste existante au lieu d'alterner ajouts et retraits.
 */
export async function setTaskAssignees(taskId: string, memberIds: string[]): Promise<void> {
  await data.removeWhere(TASK_ASSIGNEES_TABLE, { task_id: taskId });
  await Promise.all(
    memberIds.map((memberId) => data.create<TaskAssigneeRecord>(TASK_ASSIGNEES_TABLE, { task_id: taskId, member_id: memberId })),
  );
}

/** Un seul rappel par tâche : il est remplacé plutôt qu'accumulé. */
export async function setTaskReminder(taskId: string, remindAt: string | null): Promise<void> {
  await data.removeWhere(TASK_REMINDERS_TABLE, { task_id: taskId });
  if (remindAt !== null) {
    await data.create<TaskReminderRecord>(TASK_REMINDERS_TABLE, { task_id: taskId, remind_at: remindAt });
  }
}

/** Persiste le réordonnancement manuel issu du glisser-déposer. */
export async function updateTaskOrders(orders: Record<string, number>): Promise<void> {
  await Promise.all(
    Object.entries(orders).map(([id, priorityOrder]) =>
      data.update<TaskRow>(TASKS_TABLE, id, { priority_order: priorityOrder }),
    ),
  );
}

/** Dossiers de tâches : création (propriétaire = soi), renommage, déplacement, suppression. */
export async function createTaskList(
  householdId: string,
  ownerMemberId: string,
  name: string,
  visibility: TaskListRow['visibility'],
): Promise<TaskListRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.create<TaskListRow>(TASK_LISTS_TABLE, {
    household_id: householdId,
    name: trimmed,
    visibility,
    owner_member_id: ownerMemberId,
  });
}

export async function renameTaskList(id: string, name: string): Promise<TaskListRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.update<TaskListRow>(TASK_LISTS_TABLE, id, { name: trimmed });
}

export async function moveTask(id: string, folderId: string | null): Promise<TaskRow> {
  return data.update<TaskRow>(TASKS_TABLE, id, { folder_id: folderId });
}
