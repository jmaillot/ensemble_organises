import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import { toCalendarBirthday, toCalendarEvent, toColorTag } from '../types';
import type { CalendarBirthday, CalendarEvent, CalendarTask, EventFormValues, EventReminder } from '../types';
import { deleteEvent, listEventReminders, resolveCommunCalendarId, saveEvent } from '../api';
import { listTaskAssignees } from '@/modules/taches/api';
import type { EventInput } from '../api';
import type { QueryClient } from '@tanstack/react-query';
import type { BirthdayRow, EventCalendarRow, EventCategoryRow, EventRow, TaskRow } from '@/types';
import { toTask } from '@/modules/taches/types';

export interface SaveEventVariables {
  id: string | null;
  values: EventFormValues;
}

/**
 * Invalide toutes les requêtes qui portent l'une des tables, quelle que soit
 * leur forme de clé (`[table, …]` pour une ressource, `['all', table, …]`
 * pour une jointure).
 */
export function invalidateTables(queryClient: QueryClient, tables: string[]) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const [first, second] = query.queryKey as [unknown, unknown];
      return tables.includes(String(first)) || (typeof second === 'string' && tables.includes(second));
    },
  });
}

export interface CalendrierResource {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  birthdays: CalendarBirthday[];
  categories: EventCategoryRow[];
  calendars: EventCalendarRow[];
  /** Rappel de chaque événement, indexé par `event_id`. */
  reminders: Record<string, EventReminder>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveEvent: (variables: SaveEventVariables) => Promise<string>;
  removeEvent: (id: string) => Promise<void>;
}

/**
 * Données du module Calendrier : événements, tâches et rappels du foyer,
 * complétés par les anniversaires afin de les afficher à côté des rendez-vous.
 */
export function useCalendrier(): CalendrierResource {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);

  const eventsResource = useResource<EventRow>('events');
  const tasksResource = useResource<TaskRow>('tasks');
  const birthdaysResource = useResource<BirthdayRow>('birthdays');
  const categoriesResource = useResource<EventCategoryRow>('event_categories');
  const calendarsResource = useResource<EventCalendarRow>('event_calendars');

  const eventIds = useMemo(() => eventsResource.rows.map((row) => row.id), [eventsResource.rows]);
  const taskIds = useMemo(() => tasksResource.rows.map((row) => row.id), [tasksResource.rows]);
  const remindersQuery = useQuery({
    queryKey: ['all', 'event_reminders', eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => listEventReminders(eventIds),
  });
  const assigneesQuery = useQuery({
    queryKey: ['all', 'task_assignees', taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => listTaskAssignees(taskIds),
  });

  const refresh = useCallback(
    () => invalidateTables(queryClient, ['events', 'tasks', 'task_assignees', 'event_reminders', 'event_categories', 'event_calendars']),
    [queryClient],
  );

  // Écoute les écritures venues d’un autre onglet ou du temps réel.
  useEffect(() => {
    const unsubscribeEvents = data.subscribe('events', refresh);
    const unsubscribeTasks = data.subscribe('tasks', refresh);
    const unsubscribeAssignees = data.subscribe('task_assignees', refresh);
    const unsubscribeCategories = data.subscribe('event_categories', refresh);
    const unsubscribeCalendars = data.subscribe('event_calendars', refresh);
    return () => {
      unsubscribeEvents();
      unsubscribeTasks();
      unsubscribeAssignees();
      unsubscribeCategories();
      unsubscribeCalendars();
    };
  }, [refresh]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: SaveEventVariables) => {
      const member = members.find((entry) => entry.id === values.memberId);
      const existing = id ? eventsResource.rows.find((row) => row.id === id) : null;
      const calendarId =
        values.calendarId !== ''
          ? values.calendarId
          : (existing?.calendar_id ?? (householdId ? await resolveCommunCalendarId(householdId) : null));
      const input: EventInput = {
        ...values,
        householdId: householdId ?? '',
        createdBy: currentMember?.id ?? null,
        color: member ? toColorTag(member.color_tag) : 'coral',
        calendarId,
        categoryId: values.categoryId === '' ? null : (values.categoryId ?? existing?.category_id ?? null),
      };
      const row = await saveEvent(id, input);
      return row.id;
    },
    onSuccess: refresh,
  });

  const removeMutation = useMutation({ mutationFn: (id: string) => deleteEvent(id), onSuccess: refresh });

  const events = useMemo(
    () => eventsResource.rows.map((row) => toCalendarEvent(row, members, categoriesResource.rows)).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [eventsResource.rows, members, categoriesResource.rows],
  );

  const birthdays = useMemo(
    () => birthdaysResource.rows.map((row) => toCalendarBirthday(row, members)),
    [birthdaysResource.rows, members],
  );

  const tasks = useMemo<CalendarTask[]>(() => {
    const membersById = new Map(members.map((member) => [member.id, member]));
    return tasksResource.rows.map((row) => {
      const assignees = (assigneesQuery.data ?? [])
        .filter((assignee) => assignee.task_id === row.id)
        .map((assignee) => ({ memberId: assignee.member_id, member: membersById.get(assignee.member_id) }))
        .filter((assignee): assignee is { memberId: string; member: (typeof members)[number] } =>
          Boolean(assignee.member),
        );
      const task = toTask(row, { priority: 'normale', assignees, reminderAt: null });
      return {
        id: task.id,
        name: task.name,
        dueDate: task.dueDate,
        status: task.status,
        isLate: task.isLate,
        lateDays: task.lateDays,
        assignees: task.assignees,
      };
    });
  }, [tasksResource.rows, assigneesQuery.data, members]);

  const reminders = useMemo(() => {
    const map: Record<string, EventReminder> = {};
    (remindersQuery.data ?? []).forEach((row) => {
      map[row.event_id] = { id: row.id, eventId: row.event_id, remindAt: row.remind_at };
    });
    return map;
  }, [remindersQuery.data]);

  return {
    events,
    tasks,
    birthdays,
    categories: categoriesResource.rows,
    calendars: calendarsResource.rows,
    reminders,
    isLoading: eventsResource.isLoading || tasksResource.isLoading || birthdaysResource.isLoading,
    isError: eventsResource.isError || tasksResource.isError || birthdaysResource.isError,
    error: eventsResource.error ?? tasksResource.error ?? birthdaysResource.error,
    refetch: eventsResource.refetch,
    isMutating: saveMutation.isPending || removeMutation.isPending,
    saveEvent: (variables) => saveMutation.mutateAsync(variables),
    removeEvent: async (id) => {
      await removeMutation.mutateAsync(id);
    },
  };
}
