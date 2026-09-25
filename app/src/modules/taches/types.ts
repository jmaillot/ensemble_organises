import { daysBetween, relativeDayLabel, toLocalDate, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, TaskAssigneeRow, TaskPriority, TaskReminderRow, TaskRow, TaskStatus } from '@/types';

export type { TaskPriority, TaskStatus };

/**
 * Filtres du panneau « Vos prochaines tâches » : les valeurs restent sans
 * accent, les libellés portent ceux de l'export.
 */
export type TaskFilter = 'ouvertes' | 'toutes' | 'terminees';

export const taskFilters: ReadonlyArray<{ value: TaskFilter; label: string }> = [
  { value: 'ouvertes', label: 'À faire par échéance' },
  { value: 'toutes', label: 'Toutes les tâches' },
  { value: 'terminees', label: 'Terminées' },
];

export const taskStatusLabels: Record<TaskStatus, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  fait: 'Terminée',
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  haute: 'Haute',
  normale: 'Normale',
  basse: 'Basse',
};

export interface TaskAssignee {
  memberId: string;
  member: HouseholdMemberRow;
}

/** Type métier d'une tâche, ses assignataires et son rappel compris. */
export interface Task {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  /** Rang manuel persisté dans `tasks.priority_order`. */
  priorityOrder: number;
  /** Priorité déduite du rang manuel : plus la tâche est haute, plus elle est urgente. */
  priority: TaskPriority;
  assignees: TaskAssignee[];
  reminderAt: string | null;
  createdBy: string | null;
  createdAt: string;
  isLate: boolean;
  /** Nombre de jours de retard, 0 si la tâche n'est pas en retard. */
  lateDays: number;
  /** « En retard de 2 j », « Demain », ou une date. */
  dueLabel: string;
  /** Heure du rappel au format « 18:30 », ou `null` si la tâche n'en a pas. */
  reminderTime: string | null;
  /** « Rappel 18:30 », ou `null` si aucun rappel. */
  reminderLabel: string | null;
}

export interface TaskFormValues {
  name: string;
  dueDate: string;
  description: string;
  priority: TaskPriority;
  assigneeIds: string[];
  /** Valeur d'un `datetime-local`, chaîne vide pour « pas de rappel ». */
  reminderAt: string;
}

/** Ce qu'une tâche reçoit des tables enfants (`task_assignees`, `task_reminders`). */
export interface TaskContext {
  priority: TaskPriority;
  assignees: TaskAssignee[];
  reminderAt: string | null;
}

const emptyContext: TaskContext = { priority: 'normale', assignees: [], reminderAt: null };

/** `task_assignees` n'a pas de colonne `id` : clé primaire composite. */
export type TaskAssigneeRecord = { id: string } & Pick<TaskAssigneeRow, 'task_id' | 'member_id'>;
export type TaskReminderRecord = { id: string } & TaskReminderRow;

const clockFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const formatClockTime = (iso: string) => clockFormatter.format(toLocalDate(iso));

export const memberFirstName = (name: string) => name.split(' ')[0]?.trim() || name;

/** Conversion d'une ligne `tasks` en type métier. */
export function toTask(row: TaskRow, context: TaskContext = emptyContext): Task {
  const done = row.status === 'fait';
  const lateDays = !done && row.due_date ? Math.max(0, -daysBetween(todayIso(), row.due_date)) : 0;
  const reminderTime = context.reminderAt ? formatClockTime(context.reminderAt) : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dueDate: row.due_date,
    status: row.status,
    priorityOrder: row.priority_order,
    priority: context.priority,
    assignees: context.assignees,
    reminderAt: context.reminderAt,
    createdBy: row.created_by,
    createdAt: row.created_at,
    isLate: lateDays > 0,
    lateDays,
    dueLabel: row.due_date
      ? lateDays > 0
        ? `En retard de ${lateDays} j`
        : relativeDayLabel(row.due_date)
      : 'Sans échéance',
    reminderTime,
    reminderLabel: reminderTime ? `Rappel ${reminderTime}` : null,
  };
}

/**
 * Priorité déduite du rang manuel : le premier tiers de la liste est « haute »,
 * le dernier tiers « basse ». C'est ce qui permet à la fois le glisser-déposer
 * et le sélecteur de priorité de n'écrire qu'une seule colonne, `priority_order`.
 */
export function priorityFromRank(index: number, total: number): TaskPriority {
  if (total <= 1) return 'haute';
  const ratio = index / (total - 1);
  if (ratio <= 1 / 3) return 'haute';
  if (ratio <= 2 / 3) return 'normale';
  return 'basse';
}

/** Assemble les lignes `tasks` et leurs tables enfants en tâches métier. */
export function buildTasks(
  rows: TaskRow[],
  assigneeRows: TaskAssigneeRecord[],
  reminderRows: TaskReminderRecord[],
  members: HouseholdMemberRow[],
): Task[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const assigneesByTask = new Map<string, TaskAssigneeRow[]>();
  assigneeRows.forEach((row) => {
    assigneesByTask.set(row.task_id, [...(assigneesByTask.get(row.task_id) ?? []), row]);
  });
  const remindersByTask = new Map<string, string>();
  reminderRows.forEach((row) => {
    const current = remindersByTask.get(row.task_id);
    if (current === undefined || row.remind_at < current) remindersByTask.set(row.task_id, row.remind_at);
  });

  const byPriority = [...rows].sort((a, b) => a.priority_order - b.priority_order);
  const contexts = new Map<string, TaskContext>();
  byPriority.forEach((row, index) => {
    contexts.set(row.id, {
      priority: priorityFromRank(index, byPriority.length),
      assignees: (assigneesByTask.get(row.id) ?? [])
        .map((assignee) => ({ memberId: assignee.member_id, member: membersById.get(assignee.member_id) }))
        .filter((assignee): assignee is TaskAssignee => Boolean(assignee.member))
        .sort((a, b) => a.member.display_name.localeCompare(b.member.display_name, 'fr')),
      reminderAt: remindersByTask.get(row.id) ?? null,
    });
  });

  return rows.map((row) => toTask(row, contexts.get(row.id) ?? emptyContext));
}

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === 'toutes') return tasks;
  if (filter === 'terminees') return tasks.filter((task) => task.status === 'fait');
  return tasks.filter((task) => task.status !== 'fait');
}

/** Échéance croissante, tâches en retard naturellement en tête, tâches faites en dernier. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const doneA = a.status === 'fait';
    const doneB = b.status === 'fait';
    if (doneA !== doneB) return doneA ? 1 : -1;
    const dueA = a.dueDate ?? '9999-12-31';
    const dueB = b.dueDate ?? '9999-12-31';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    return a.priorityOrder - b.priorityOrder;
  });
}

/** Rang à attribuer à une tâche selon la priorité choisie dans le formulaire. */
export function nextPriorityOrder(orders: number[], priority: TaskPriority): number {
  if (orders.length === 0) return 0;
  const min = Math.min(...orders);
  const max = Math.max(...orders);
  if (priority === 'haute') return min - 1;
  if (priority === 'basse') return max + 1;
  return Math.round((min + max) / 2);
}

/**
 * Ranks à persister après un glisser-déposer : les tâches déplacées occupent les
 * places des tâches visibles, les autres gardent la leur.
 */
export function manualRanks(tasks: Task[], orderedIds: string[]): Record<string, number> {
  const ordered = [...tasks].sort((a, b) => a.priorityOrder - b.priorityOrder);
  const wanted = new Set(orderedIds);
  const next = [...ordered];
  const slots: number[] = [];
  ordered.forEach((task, index) => {
    if (wanted.has(task.id)) slots.push(index);
  });
  orderedIds.forEach((id, index) => {
    const task = ordered.find((entry) => entry.id === id);
    const slot = slots[index];
    if (task && slot !== undefined) next[slot] = task;
  });
  return Object.fromEntries(next.map((task, index) => [task.id, index]));
}

export interface TaskMetrics {
  open: number;
  total: number;
  highPriority: number;
  /** Membres réellement assignés à au moins une tâche du foyer. */
  assigneeCount: number;
}

export function taskMetrics(tasks: Task[]): TaskMetrics {
  return {
    open: tasks.filter((task) => task.status !== 'fait').length,
    total: tasks.length,
    highPriority: tasks.filter((task) => task.status !== 'fait' && task.priority === 'haute').length,
    assigneeCount: new Set(tasks.flatMap((task) => task.assignees.map((assignee) => assignee.memberId))).size,
  };
}

/** Tâches accompagnées d'un rappel, de la plus proche à la plus lointaine. */
export function reminderTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.reminderAt !== null)
    .sort((a, b) => (a.reminderAt ?? '').localeCompare(b.reminderAt ?? ''));
}
