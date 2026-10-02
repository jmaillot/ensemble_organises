import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { queryKeys, useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import { addDays, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, RoutineCompletionRow, RoutineFolderRow, RoutineRow } from '@/types';
import {
  ROUTINE_ASSIGNEES_TABLE,
  ROUTINE_COMPLETIONS_TABLE,
  ROUTINE_FOLDERS_TABLE,
  ROUTINE_REMINDERS_TABLE,
  ROUTINES_TABLE,
  createRoutineFolder,
  deleteOccurrence as deleteOccurrenceRow,
  deleteRoutineChildren,
  listRoutineAssignees,
  listRoutineReminders,
  markOccurrenceDone,
  markOccurrenceMissed,
  renameRoutineFolder,
  setRoutineAssignees,
  setRoutineReminders,
  toReminderIsos,
  toRoutinePayload,
} from '../api';
import {
  CALENDAR_MARGIN_DAYS,
  buildRoutines,
  filterRoutines,
  filterRoutinesByAssignee,
  filterRoutinesByFolder,
  routineDayStatuses,
  routineHistory,
  routineMetrics,
  ruleForSelection,
  todayOccurrences as todayOccurrencesOf,
  type DayStatusMap,
  type HistoryEntry,
  type HistoryPeriod,
  type Routine,
  type RoutineAssigneeFilter,
  type RoutineAssigneeRecord,
  type RoutineFormValues,
  type RoutineMetrics,
  type RoutineReminderRecord,
} from '../types';

export interface UseRoutinesResult extends RoutineMetrics {
  /** Toutes les routines du foyer, série et prochaine occurrence comprises. */
  routines: Routine[];
  /** Occurrences dues aujourd'hui, à cocher comme une checklist. */
  dueToday: Routine[];
  /** Routines de l'onglet courant, filtrées par la recherche et l'assigné. */
  visibleRoutines: Routine[];
  /** Historique de la période courante, passé puis à venir. */
  history: HistoryEntry[];
  /** État de chaque jour autour du jour courant, pour la carte mensuelle. */
  dayStatuses: DayStatusMap;
  members: HouseholdMemberRow[];
  currentMemberId: string;
  folders: RoutineFolderRow[];
  /** Onglet dossier : `null` = Général. */
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  assigneeFilter: RoutineAssigneeFilter;
  setAssigneeFilter: (filter: RoutineAssigneeFilter) => void;
  /** Faux pour le rôle `enfant` (lecture seule). */
  canWrite: boolean;
  createFolder: (name: string, visibility: RoutineFolderRow['visibility']) => Promise<RoutineFolderRow>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  period: HistoryPeriod;
  setPeriod: (period: HistoryPeriod) => void;
  query: string;
  setQuery: (query: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  /** Coche ou décoche l'occurrence du jour. */
  toggleOccurrence: (routine: Routine) => Promise<void>;
  saveRoutine: (routine: Routine | null, values: RoutineFormValues) => Promise<void>;
  removeRoutine: (routine: Routine) => Promise<void>;
  /** Retire une occurrence enregistrée de l'historique. */
  removeOccurrence: (entry: HistoryEntry) => Promise<void>;
}

/** Références stables : évite de recalculer les routines tant que rien n'est chargé. */
const NO_ASSIGNEES: RoutineAssigneeRecord[] = [];
const NO_REMINDERS: RoutineReminderRecord[] = [];

/** Données du module Routines : définitions, occurrences et historique. */
export function useRoutines(): UseRoutinesResult {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);
  const today = todayIso();
  const [period, setPeriod] = useState<HistoryPeriod>(7);
  const [query, setQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<RoutineAssigneeFilter>('tous');

  const foldersResource = useResource<RoutineFolderRow>(ROUTINE_FOLDERS_TABLE);
  const folders = useMemo(
    () => [...foldersResource.rows].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [foldersResource.rows],
  );

  const folderStorageKey = `eo:routines:folder:${householdId ?? 'none'}`;
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

  const { rows, isLoading, isFetching, isError, error, refetch, create, update, remove, isMutating } =
    useResource<RoutineRow>(ROUTINES_TABLE);
  // Les occurrences portent `household_id` : la ressource est donc scopée.
  const completionsResource = useResource<RoutineCompletionRow>(ROUTINE_COMPLETIONS_TABLE);

  const routineIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const assigneesQuery = useQuery({
    queryKey: [...queryKeys.tableAll(ROUTINE_ASSIGNEES_TABLE), routineIds],
    enabled: routineIds.length > 0,
    queryFn: () => listRoutineAssignees(routineIds),
  });
  const remindersQuery = useQuery({
    queryKey: [...queryKeys.tableAll(ROUTINE_REMINDERS_TABLE), routineIds],
    enabled: routineIds.length > 0,
    queryFn: () => listRoutineReminders(routineIds),
  });

  const assignees = assigneesQuery.data ?? NO_ASSIGNEES;
  const reminders = remindersQuery.data ?? NO_REMINDERS;
  const completions = completionsResource.rows;

  const routines = useMemo(
    () => buildRoutines(rows, assignees, reminders, completions, members, today),
    [assignees, completions, members, reminders, rows, today],
  );
  const dueToday = useMemo(() => todayOccurrencesOf(filterRoutinesByFolder(routines, activeFolderId)), [activeFolderId, routines]);
  const visibleRoutines = useMemo(
    () => filterRoutinesByAssignee(filterRoutines(filterRoutinesByFolder(routines, activeFolderId), query), assigneeFilter),
    [activeFolderId, assigneeFilter, query, routines],
  );
  const history = useMemo(
    () => routineHistory(routines, completions, members, period, today),
    [completions, members, period, routines, today],
  );
  const dayStatuses = useMemo(
    () =>
      routineDayStatuses(
        routines,
        completions,
        addDays(today, -CALENDAR_MARGIN_DAYS),
        addDays(today, CALENDAR_MARGIN_DAYS),
        today,
      ),
    [completions, routines, today],
  );
  const metrics = useMemo(() => routineMetrics(routines), [routines]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [ROUTINES_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [ROUTINE_FOLDERS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [ROUTINE_COMPLETIONS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(ROUTINE_ASSIGNEES_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(ROUTINE_REMINDERS_TABLE) }),
    ]);
  }, [queryClient]);

  const toggleOccurrence = useCallback(
    async (routine: Routine) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      if (routine.isDoneToday) {
        await markOccurrenceMissed({ routineId: routine.id, householdId, occurrenceDate: today });
      } else {
        await markOccurrenceDone({
          routineId: routine.id,
          householdId,
          occurrenceDate: today,
          completedBy: currentMember?.id ?? null,
        });
      }
      await refresh();
    },
    [canWrite, currentMember?.id, householdId, refresh, today],
  );

  const saveRoutine = useCallback(
    async (routine: Routine | null, values: RoutineFormValues) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const selection = {
        weeklyDays: values.weeklyDays,
        monthlyMode: values.monthlyMode,
        monthlyDay: values.monthlyDay,
        nthRank: values.nthRank,
        nthWeekday: values.nthWeekday,
        yearlyMode: values.yearlyMode,
        yearlyMonth: values.yearlyMonth,
        yearlyDay: values.yearlyDay,
        yearlyNthRank: values.yearlyNthRank,
        yearlyNthWeekday: values.yearlyNthWeekday,
      };
      const payload = toRoutinePayload(values, ruleForSelection(values.frequency, selection, values.customRule));
      const saved = routine
        ? await update(routine.id, payload)
        : await create({ ...payload, household_id: householdId, created_by: currentMember?.id ?? null });
      await Promise.all([
        setRoutineAssignees(saved.id, values.assigneeIds),
        setRoutineReminders(saved.id, toReminderIsos(values.reminders, values.autoMinus1)),
      ]);
      await refresh();
    },
    [canWrite, create, currentMember?.id, householdId, refresh, update],
  );

  const removeRoutine = useCallback(
    async (routine: Routine) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      // La ligne `routines` part par la ressource, ses tables enfants par l'API.
      await Promise.all([remove(routine.id), deleteRoutineChildren(routine.id)]);
      await refresh();
    },
    [canWrite, refresh, remove],
  );

  const createFolder = useCallback(
    async (name: string, visibility: RoutineFolderRow['visibility']) => {
      if (!householdId || !currentMember) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const folder = await createRoutineFolder(householdId, currentMember.id, name, visibility);
      await refresh();
      return folder;
    },
    [canWrite, currentMember, householdId, refresh],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await renameRoutineFolder(id, name);
      await refresh();
    },
    [canWrite, refresh],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await data.remove(ROUTINE_FOLDERS_TABLE, id);
      if (activeFolderId === id) setActiveFolderId(null);
      await refresh();
    },
    [activeFolderId, canWrite, refresh, setActiveFolderId],
  );

  const removeOccurrence = useCallback(
    async (entry: HistoryEntry) => {
      await deleteOccurrenceRow(entry.routineId, entry.date);
      await refresh();
    },
    [refresh],
  );

  return {
    routines,
    dueToday,
    visibleRoutines,
    history,
    dayStatuses,
    members,
    currentMemberId: currentMember?.id ?? '',
    folders,
    activeFolderId,
    setActiveFolderId,
    assigneeFilter,
    setAssigneeFilter,
    canWrite,
    createFolder,
    renameFolder,
    deleteFolder,
    period,
    setPeriod,
    query,
    setQuery,
    isLoading: isLoading || completionsResource.isLoading || assigneesQuery.isLoading || remindersQuery.isLoading,
    isFetching: isFetching || completionsResource.isFetching || assigneesQuery.isFetching || remindersQuery.isFetching,
    isError: isError || completionsResource.isError || assigneesQuery.isError || remindersQuery.isError,
    error: error ?? completionsResource.error ?? assigneesQuery.error ?? remindersQuery.error,
    isMutating,
    refetch,
    toggleOccurrence,
    saveRoutine,
    removeRoutine,
    removeOccurrence,
    ...metrics,
  };
}
