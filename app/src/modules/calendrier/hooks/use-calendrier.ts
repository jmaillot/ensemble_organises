import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import { toCalendarBirthday, toCalendarEvent, toColorTag } from '../types';
import type { CalendarBirthday, CalendarEvent, EventFormValues, EventReminder } from '../types';
import { deleteEvent, listEventReminders, saveEvent } from '../api';
import type { EventInput } from '../api';
import type { QueryClient } from '@tanstack/react-query';
import type { BirthdayRow, EventRow } from '@/types';

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
  birthdays: CalendarBirthday[];
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
 * Données du module Calendrier : événements et rappels du foyer, complétés par
 * les anniversaires afin de les afficher à côté des rendez-vous.
 */
export function useCalendrier(): CalendrierResource {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);

  const eventsResource = useResource<EventRow>('events');
  const birthdaysResource = useResource<BirthdayRow>('birthdays');

  const eventIds = useMemo(() => eventsResource.rows.map((row) => row.id), [eventsResource.rows]);
  const remindersQuery = useQuery({
    queryKey: ['all', 'event_reminders', eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => listEventReminders(eventIds),
  });

  const refresh = useCallback(
    () => invalidateTables(queryClient, ['events', 'event_reminders']),
    [queryClient],
  );

  // Écoute les écritures venues d’un autre onglet ou du temps réel.
  useEffect(() => {
    const unsubscribe = data.subscribe('events', refresh);
    return unsubscribe;
  }, [refresh]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: SaveEventVariables) => {
      const member = members.find((entry) => entry.id === values.memberId);
      const input: EventInput = {
        ...values,
        householdId: householdId ?? '',
        createdBy: currentMember?.id ?? null,
        color: member ? toColorTag(member.color_tag) : 'coral',
      };
      const row = await saveEvent(id, input);
      return row.id;
    },
    onSuccess: refresh,
  });

  const removeMutation = useMutation({ mutationFn: (id: string) => deleteEvent(id), onSuccess: refresh });

  const events = useMemo(
    () => eventsResource.rows.map((row) => toCalendarEvent(row, members)).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [eventsResource.rows, members],
  );

  const birthdays = useMemo(
    () => birthdaysResource.rows.map((row) => toCalendarBirthday(row, members)),
    [birthdaysResource.rows, members],
  );

  const reminders = useMemo(() => {
    const map: Record<string, EventReminder> = {};
    (remindersQuery.data ?? []).forEach((row) => {
      map[row.event_id] = { id: row.id, eventId: row.event_id, remindAt: row.remind_at };
    });
    return map;
  }, [remindersQuery.data]);

  return {
    events,
    birthdays,
    reminders,
    isLoading: eventsResource.isLoading || birthdaysResource.isLoading,
    isError: eventsResource.isError || birthdaysResource.isError,
    error: eventsResource.error ?? birthdaysResource.error,
    refetch: eventsResource.refetch,
    isMutating: saveMutation.isPending || removeMutation.isPending,
    saveEvent: (variables) => saveMutation.mutateAsync(variables),
    removeEvent: async (id) => {
      await removeMutation.mutateAsync(id);
    },
  };
}
