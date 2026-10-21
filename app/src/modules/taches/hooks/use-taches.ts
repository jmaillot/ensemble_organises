import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useCurrentMember, useHouseholdStore, useIsAdmin, useMembers } from '@/stores/household-store';
import type { HouseholdMemberRow, TaskListRow, TaskRow } from '@/types';
import {
  TASK_ASSIGNEES_TABLE,
  TASK_LISTS_TABLE,
  TASK_REMINDERS_TABLE,
  TASKS_TABLE,
  createTaskList,
  listTaskAssignees,
  listTaskReminders,
  renameTaskList,
  setTaskAssignees,
  setTaskReminder,
  toReminderIso,
  toTaskPayload,
  updateTaskOrders,
} from '../api';
import {
  buildTasks,
  filterByAssignee,
  filterByFolder,
  filterTasks,
  manualRanks,
  nextPriorityOrder,
  reminderTasks,
  sortTasks,
  taskMetrics,
  type AssigneeFilter,
  type Task,
  type TaskFilter,
  type TaskFormValues,
  type TaskMetrics,
} from '../types';

export interface UseTachesResult extends TaskMetrics {
  /** Toutes les tâches du foyer, priorité déduite du rang manuel comprise. */
  tasks: Task[];
  /** Tâches de l'onglet et des filtres courants, triées pour l'affichage. */
  visibleTasks: Task[];
  /** Tâches portant un rappel, pour le panneau « Rappels du jour ». */
  reminders: Task[];
  /** La lecture des assignations n'a pas encore rendu (ou a échoué). */
  assigneesUnknown: boolean;
  members: HouseholdMemberRow[];
  currentMemberId: string;
  folders: TaskListRow[];
  /** Onglet dossier : `null` = Général. */
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  assigneeFilter: AssigneeFilter;
  setAssigneeFilter: (filter: AssigneeFilter) => void;
  /** Faux pour le rôle `enfant` (lecture seule). */
  canWrite: boolean;
  /**
   * Vrai pour le rôle `admin` du foyer. Capacité distincte de `canWrite` : un
   * membre peut écrire (créer, renommer, cocher) mais la **suppression** est
   * admin-seule côté serveur (`tasks_delete_admin`).
   */
  isAdmin: boolean;
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
  /** Recharge les dossiers (après création/renommage/suppression). */
  refreshFolders: () => Promise<void>;
  /** Crée un dossier (propriétaire = membre courant). */
  createFolder: (name: string, visibility: TaskListRow['visibility']) => Promise<TaskListRow>;
  /** Renomme un dossier. */
  renameFolder: (id: string, name: string) => Promise<void>;
  /**
   * Supprime un dossier : un perso emporte son contenu, un dossier foyer range
   * le sien dans Général.
   */
  deleteFolder: (id: string) => Promise<void>;
  /**
   * Capacité de suppression, **par dossier** (`0134`) : le propriétaire peut
   * supprimer son dossier perso, un dossier foyer reste réservé à l'admin.
   */
  canDeleteFolder: (folder: Pick<TaskListRow, 'visibility' | 'owner_member_id'>) => boolean;
}

/** Données du module Tâches : tâches, assignataires, rappels et réordonnancement. */
export function useTaches(): UseTachesResult {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);
  const [filter, setFilter] = useState<TaskFilter>('ouvertes');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('tous');
  const foldersResource = useResource<TaskListRow>(TASK_LISTS_TABLE);
  const folders = useMemo(
    () => [...foldersResource.rows].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [foldersResource.rows],
  );

  // Onglet dossier persistant par foyer ; replié sur Général si le dossier disparaît.
  const folderStorageKey = `eo:taches:folder:${householdId ?? 'none'}`;
  const [storedFolderId, setStoredFolderId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(folderStorageKey);
    } catch {
      return null;
    }
  });
  const activeFolderId =
    storedFolderId !== null && folders.some((folder) => folder.id === storedFolderId) ? storedFolderId : null;
  const setActiveFolderId = useCallback(
    (id: string | null) => {
      setStoredFolderId(id);
      try {
        if (id === null) window.localStorage.removeItem(folderStorageKey);
        else window.localStorage.setItem(folderStorageKey, id);
      } catch {
        // Stockage indisponible : l'onglet reste en mémoire pour la session.
      }
    },
    [folderStorageKey],
  );

  const canWrite = currentMember?.role !== 'enfant';
  const isAdmin = useIsAdmin();

  /**
   * Suppression par dossier, et non par rôle seul : un dossier perso
   * n'appartient qu'à son propriétaire (l'admin ne le voit même plus), un
   * dossier foyer reste à l'admin. Le serveur applique la même règle.
   */
  const canDeleteFolder = useCallback(
    (folder: Pick<TaskListRow, 'visibility' | 'owner_member_id'>) =>
      folder.visibility === 'perso' ? folder.owner_member_id === currentMember?.id : isAdmin,
    [currentMember?.id, isAdmin],
  );
  const { rows: allRows, isLoading, isFetching, isError, error, refetch, create, update, remove, isMutating } =
    useResource<TaskRow>(TASKS_TABLE);

  /**
   * Phase 15 : les tâches propres à un voyage (`trip_id` renseigné) ne
   * vivent pas dans la liste du foyer — régime historique `trip_id NULL`
   * (15-01). Les fourches voyage (15-03) liront le même magasin par voyage.
   */
  const rows = useMemo(() => allRows.filter((row) => row.trip_id == null), [allRows]);

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

  // « On ne sait pas » tant que la lecture des assignations n'a pas rendu : la
  // liste montre alors un rond d'attente au lieu de laisser croire que personne
  // n'est assigné (TODO #16).
  const assigneesUnknown = !assigneesQuery.isSuccess;

  const tasks = useMemo(
    () => buildTasks(rows, assigneesQuery.data ?? [], remindersQuery.data ?? [], members, assigneesUnknown),
    [assigneesQuery.data, assigneesUnknown, members, remindersQuery.data, rows],
  );
  const visibleTasks = useMemo(
    () => sortTasks(filterByAssignee(filterByFolder(filterTasks(tasks, filter), activeFolderId), assigneeFilter)),
    [activeFolderId, assigneeFilter, filter, tasks],
  );
  /**
   * Rappels du jour (D-07) : la borne est l'instant du rendu, comme le reste de
   * la page — le panneau ne se rafraîchit pas tout seul.
   */
  const reminders = useMemo(() => reminderTasks(tasks, new Date()), [tasks]);
  const metrics = useMemo(() => taskMetrics(tasks), [tasks]);

  /** Recharge les tables enfants après une écriture. */
  const refreshChildren = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(TASK_ASSIGNEES_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(TASK_REMINDERS_TABLE) }),
      queryClient.invalidateQueries({ queryKey: [TASK_LISTS_TABLE] }),
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
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await update(task.id, { status: task.status === 'fait' ? 'a_faire' : 'fait' });
    },
    [canWrite, update],
  );

  const saveTask = useCallback(
    async (task: Task | null, values: TaskFormValues) => {
      if (!task && !householdId) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
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
        : await create({
            ...payload,
            household_id: householdId ?? '',
            created_by: currentMember?.id ?? null,
          });

      await Promise.all([
        setTaskAssignees(saved.id, values.assigneeIds),
        setTaskReminder(saved.id, toReminderIso(values.reminderAt)),
      ]);
      await refresh();
    },
    [canWrite, create, currentMember?.id, householdId, refresh, tasks, update],
  );

  const removeTask = useCallback(
    async (task: Task) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      if (!isAdmin) throw new Error('Seul un administrateur du foyer peut supprimer.');
      await Promise.all([
        remove(task.id),
        // IndexedDB n'a pas de cascade : on nettoie les tables enfants.
        setTaskAssignees(task.id, []),
        setTaskReminder(task.id, null),
      ]);
      await refresh();
    },
    [canWrite, isAdmin, refresh, remove],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      // `orderedIds` vient de l'onglet courant : les tâches déplacées occupent
      // les places des tâches visibles, les autres dossiers gardent leurs rangs.
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
    assigneesUnknown,
    members,
    currentMemberId: currentMember?.id ?? '',
    folders,
    activeFolderId,
    setActiveFolderId,
    filter,
    setFilter,
    assigneeFilter,
    setAssigneeFilter,
    canWrite,
    isAdmin,
    canDeleteFolder,
    refreshFolders: async () => {
      await queryClient.invalidateQueries({ queryKey: [TASK_LISTS_TABLE] });
    },
    createFolder: async (name, visibility) => {
      if (!householdId || !currentMember) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const folder = await createTaskList(householdId, currentMember.id, name, visibility);
      await queryClient.invalidateQueries({ queryKey: [TASK_LISTS_TABLE] });
      return folder;
    },
    renameFolder: async (id, name) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await renameTaskList(id, name);
      await queryClient.invalidateQueries({ queryKey: [TASK_LISTS_TABLE] });
    },
    deleteFolder: async (id) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const folder = folders.find((entry) => entry.id === id);
      if (!folder) throw new Error('Dossier introuvable.');
      // Le refus est dit ici pour l'usage ; la RPC `delete_folder` le refait
      // côté serveur, où il fait autorité.
      if (!canDeleteFolder(folder)) {
        throw new Error(
          folder.visibility === 'perso'
            ? 'Seul le propriétaire peut supprimer ce dossier perso.'
            : 'Seul un administrateur du foyer peut supprimer ce dossier.',
        );
      }
      await data.deleteFolder('taches', id);
      if (activeFolderId === id) setActiveFolderId(null);
      await queryClient.invalidateQueries({ queryKey: [TASK_LISTS_TABLE] });
      await queryClient.invalidateQueries({ queryKey: [TASKS_TABLE] });
    },
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
