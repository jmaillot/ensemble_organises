import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import type { HouseholdMemberRow, TaskRow } from '@/types';
import {
  TASK_ASSIGNEES_TABLE,
  TASK_REMINDERS_TABLE,
  TASKS_TABLE,
  listTaskAssignees,
  listTaskReminders,
  setTaskAssignees,
  setTaskReminder,
  toReminderIso,
  toTaskPayload,
  updateTaskOrders,
} from '../api';
import {
  buildTasks,
  filterTasks,
  manualRanks,
  nextPriorityOrder,
  reminderTasks,
  sortTasks,
  taskMetrics,
  type Task,
  type TaskFilter,
  type TaskFormValues,
  type TaskMetrics,
} from '../types';

export interface UseTachesResult extends TaskMetrics {
  /** Toutes les tâches du foyer, priorité déduite du rang manuel comprise. */
  tasks: Task[];
  /** Tâches du filtre courant, triées pour l'affichage. */
  visibleTasks: Task[];
  /** Tâches portant un rappel, pour le panneau « Rappels du jour ». */
  reminders: Task[];
  members: HouseholdMemberRow[];
  currentMemberId: string;
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  /** Bascule optimiste « à faire » / « terminée ». */
  toggleStatus: (task: Task) => Promise<void>;
  saveTask: (task: Task | null, values: TaskFormValues) => Promise<void>;
  removeTask: (task: Task) => Promise<void>;
  /** Enregistre l'ordre issu du glisser-déposer. */
  reorder: (orderedIds: string[]) => Promise<void>;
}

/** Données du module Tâches : tâches, assignataires, rappels et réordonnancement. */
export function useTaches(): UseTachesResult {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);
  const [filter, setFilter] = useState<TaskFilter>('ouvertes');
  const { rows, isLoading, isFetching, isError, error, refetch, create, update, remove, isMutating } =
    useResource<TaskRow>(TASKS_TABLE);

  // `rows` est une référence stable tant que le cache ne change pas.
  const taskIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const assigneesQuery = useQuery({
    queryKey: [...queryKeys.tableAll(TASK_ASSIGNEES_TABLE), taskIds],
    enabled: taskIds.length > 0,
    queryFn: () => listTaskAssignees(taskIds),
  });
  const remindersQuery = useQuery({
    queryKey: [...queryKeys.tableAll(TASK_REMINDERS_TABLE), taskIds],
    enabled: taskIds.length > 0,
    queryFn: () => listTaskReminders(taskIds),
  });

  const tasks = useMemo(
    () => buildTasks(rows, assigneesQuery.data ?? [], remindersQuery.data ?? [], members),
    [assigneesQuery.data, members, remindersQuery.data, rows],
  );
  const visibleTasks = useMemo(() => sortTasks(filterTasks(tasks, filter)), [filter, tasks]);
  const reminders = useMemo(() => reminderTasks(tasks), [tasks]);
  const metrics = useMemo(() => taskMetrics(tasks), [tasks]);

  /** Recharge les tables enfants après une écriture. */
  const refreshChildren = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(TASK_ASSIGNEES_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(TASK_REMINDERS_TABLE) }),
    ]);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    // `useResource` n'invalide que la clé `['all', table]`, distincte de la clé
    // de sa requête (`[table, householdId, filter]`) : on invalide la table
    // elle-même pour que la liste reflète immédiatement l'écriture.
    await Promise.all([queryClient.invalidateQueries({ queryKey: [TASKS_TABLE] }), refreshChildren()]);
  }, [queryClient, refreshChildren]);

  const toggleStatus = useCallback(
    async (task: Task) => {
      await update(task.id, { status: task.status === 'fait' ? 'a_faire' : 'fait' });
    },
    [update],
  );

  const saveTask = useCallback(
    async (task: Task | null, values: TaskFormValues) => {
      if (!task && !householdId) throw new Error('Aucun foyer sélectionné.');
      const priorityOrder =
        task && task.priority === values.priority
          ? task.priorityOrder
          : nextPriorityOrder(
              tasks.map((entry) => entry.priorityOrder),
              values.priority,
            );
      const payload = toTaskPayload(values, { priorityOrder, status: task?.status ?? 'a_faire' });
      const saved = task
        ? await update(task.id, payload)
        : await create({ ...payload, household_id: householdId ?? '', created_by: currentMember?.id ?? null });

      await Promise.all([
        setTaskAssignees(saved.id, values.assigneeIds),
        setTaskReminder(saved.id, toReminderIso(values.reminderAt)),
      ]);
      await refresh();
    },
    [create, currentMember?.id, householdId, refresh, tasks, update],
  );

  const removeTask = useCallback(
    async (task: Task) => {
      await Promise.all([
        remove(task.id),
        // IndexedDB n'a pas de cascade : on nettoie les tables enfants.
        setTaskAssignees(task.id, []),
        setTaskReminder(task.id, null),
      ]);
      await refresh();
    },
    [refresh, remove],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const ranks = manualRanks(tasks, orderedIds);
      const changed = Object.fromEntries(
        Object.entries(ranks).filter(([id, rank]) => tasks.find((task) => task.id === id)?.priorityOrder !== rank),
      );
      if (Object.keys(changed).length === 0) return;
      await updateTaskOrders(changed);
      await refresh();
    },
    [refresh, tasks],
  );

  return {
    tasks,
    visibleTasks,
    reminders,
    members,
    currentMemberId: currentMember?.id ?? '',
    filter,
    setFilter,
    isLoading: isLoading || assigneesQuery.isLoading || remindersQuery.isLoading,
    isFetching: isFetching || assigneesQuery.isFetching || remindersQuery.isFetching,
    isError: isError || assigneesQuery.isError || remindersQuery.isError,
    error: error ?? assigneesQuery.error ?? remindersQuery.error,
    isMutating,
    refetch,
    toggleStatus,
    saveTask,
    removeTask,
    reorder,
    ...metrics,
  };
}
