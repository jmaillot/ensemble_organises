import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import { useFrenchHolidays } from '@/hooks/use-french-holidays';
import { useRoutines } from '@/modules/routines/hooks/use-routines';
import { todayIso, toLocalDate, toIsoDate, daysBetween } from '@/lib/utils';
import type { BirthdayRow, DashboardWidgetRow, EventRow, ExpenseParticipantRow, ExpenseRow, PostRow, TaskRow } from '@/types';
import {
  layoutWidgets,
  nextEventOfDay,
  resetPreferences,
  toWidgetPreferences,
  type WidgetPlacement,
  type WidgetPreference,
} from '../types';

export interface DashboardData {
  /* Widgets */
  widgets: WidgetPreference[];
  placements: WidgetPlacement[];
  setWidgetOrder: (preferences: WidgetPreference[]) => void;
  /* Calendrier */
  events: EventRow[];
  eventDates: Set<string>;
  eventCountByDate: Map<string, number>;
  holidays: ReturnType<typeof useFrenchHolidays>;
  /* Tâches */
  openTasks: TaskRow[];
  taskCount: number;
  toggleTask: (task: TaskRow) => Promise<void>;
  isUpdatingTask: boolean;
  /* Anniversaires */
  upcomingBirthdays: { row: BirthdayRow; daysUntil: number }[];
  /* Routines */
  routineProgress: { done: number; total: number; nextLabel: string; ratio: number };
  /* Météo */
  city: string;
  setCity: (city: string) => void;
  /* Activité */
  activity: ActivityEntry[];
  /* Ardoise */
  board: {
    total: number;
    monthLabel: string;
    members: { memberId: string; displayName: string; amount: number }[];
  };
  nextEvent: ReturnType<typeof nextEventOfDay>;
  nextShopping: { title: string; iso: string; relative: string } | null;
}

export interface ActivityEntry {
  id: string;
  actor: string;
  actorColor: string;
  kind: 'tache' | 'evenement' | 'depense' | 'publication' | 'anniversaire';
  text: string;
  when: string;
}

/**
 * Une seule interrogation par ressource, un rendu dérivé : l'accueil ne fait
 * jamais de requête à la demande depuis ses widgets.
 */
export function useDashboard(): DashboardData {
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);
  const members = useHouseholdStore((state) => state.members);
  const year = new Date().getFullYear();
  const holidays = useFrenchHolidays(year);

  const tasks = useResource<TaskRow>('tasks');
  const events = useResource<EventRow>('events');
  const birthdays = useResource<BirthdayRow>('birthdays');
  const expenses = useResource<ExpenseRow>('expenses');
  const posts = useResource<PostRow>('posts');
  const widgets = useResource<{ widget_type: string; position_x: number; position_y: number; width: number; member_id: string }>(
    'dashboard_widgets',
    { filter: { member_id: currentMember?.id ?? '__none__' } },
    );
  const routines = useRoutines();

  const { data: participants } = useQuery({
    queryKey: ['dashboard', 'expense_participants', householdId],
    enabled: Boolean(householdId),
    queryFn: async () => {
      const expensesData = await data.list<ExpenseRow>('expenses', { household_id: householdId ?? '' });
      const ids = expensesData.map((expense) => expense.id);
      if (ids.length === 0) return [] as ExpenseParticipantRow[];
      return data.list<ExpenseParticipantRow>('expense_participants', { expense_id: ids });
    },
  });

  // L'état local rend la personnalisation instantanée ; la lecture ne sert
  // qu'à réamorcer les préférences au premier rendu.
  const [preferences, setPreferences] = useState<WidgetPreference[]>(resetPreferences());

  useEffect(() => {
    if (widgets.isLoading) return;
    setPreferences(toWidgetPreferences(widgets.rows as DashboardWidgetRow[]));
  }, [widgets.isLoading, widgets.rows]);

  const setWidgetOrder = useCallback(async (next: WidgetPreference[]) => {
    if (!currentMember || !householdId) return;
    setPreferences(next);
    const existing = widgets.rows as { id?: string; widget_type: string; position_x: number }[];
    await Promise.all(
      next.map(async (preference, index) => {
        const current = existing.find((row) => row.widget_type === preference.kind);
        if (current?.id) {
          await data.update('dashboard_widgets', current.id, {
            position_x: index,
            position_y: 0,
            width: preference.visible ? (preference.kind === 'routines' ? 2 : 1) : 0,
          } as never);
          return;
        }
        await data.create('dashboard_widgets', {
          // Identifiant déterministe : un second enregistrement du même widget
          // remplace la ligne au lieu de s'ajouter.
          id: `widget-${currentMember.id}-${preference.kind}`,
          household_id: householdId,
          member_id: currentMember.id,
          widget_type: preference.kind,
          position_x: index,
          position_y: 0,
          width: preference.visible ? (preference.kind === 'routines' ? 2 : 1) : 0,
          height: 1,
        } as never);
      }),
    );
    await widgets.refetch();
  }, [currentMember, householdId, widgets]);

  const eventDates = useMemo(() => new Set(events.rows.map((event) => toIsoDate(toLocalDate(event.start_at)))), [events.rows]);
  const eventCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events.rows) {
      const iso = toIsoDate(toLocalDate(event.start_at));
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    for (const birthday of birthdays.rows) {
      const iso = `${year}-${birthday.birth_date.slice(5)}`;
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    return counts;
  }, [birthdays.rows, events.rows, year]);

  const openTasks = useMemo(
    () =>
      tasks.rows
        .filter((task) => task.status !== 'fait')
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
    [tasks.rows],
  );

  const upcomingBirthdays = useMemo(() => {
    const today = todayIso();
    return birthdays.rows
      .map((row) => {
        const next = nextBirthdayIso(row.birth_date, year);
        return { row, daysUntil: Math.max(0, daysBetween(today, next)) };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [birthdays.rows, year]);

  const routineProgress = useMemo(() => {
    const due = routines.dueToday;
    const done = due.filter((routine) => routine.isDoneToday).length;
    const next = routines.routines.find((routine) => !routine.isDoneToday) ?? routines.routines[0];
    return {
      done,
      total: due.length,
      nextLabel: next ? next.name : 'aucune routine prévue',
      ratio: due.length === 0 ? 0 : Math.round((done / due.length) * 100),
    };
  }, [routines.dueToday, routines.routines]);

  const city = useHouseholdStore((state) => state.city);
  const setCity = useHouseholdStore((state) => state.setCity);

  const activity = useMemo<ActivityEntry[]>(() => {
    const memberName = (id: string) => members.find((member) => member.id === id)?.display_name ?? 'Un membre';
    const memberColor = (id: string) => members.find((member) => member.id === id)?.color_tag ?? 'accent';
    const entries: ActivityEntry[] = [];
    for (const task of tasks.rows.slice(0, 3)) {
      entries.push({
        id: `task-${task.id}`,
        actor: memberName(task.created_by ?? ''),
        actorColor: memberColor(task.created_by ?? ''),
        kind: 'tache',
        text: `a ajouté la tâche « ${task.name} »`,
        when: relativeWhen(task.created_at),
      });
    }
    for (const event of events.rows.slice(0, 2)) {
      entries.push({
        id: `event-${event.id}`,
        actor: memberName(event.created_by ?? ''),
        actorColor: memberColor(event.created_by ?? ''),
        kind: 'evenement',
        text: `a planifié « ${event.title} »`,
        when: relativeWhen(event.created_at),
      });
    }
    for (const expense of expenses.rows.slice(0, 2)) {
      entries.push({
        id: `expense-${expense.id}`,
        actor: memberName(expense.paid_by),
        actorColor: memberColor(expense.paid_by),
        kind: 'depense',
        text: `a ajouté une dépense de ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(expense.amount)}`,
        when: relativeWhen(expense.created_at),
      });
    }
    for (const post of posts.rows.slice(0, 2)) {
      entries.push({
        id: `post-${post.id}`,
        actor: memberName(post.author_id),
        actorColor: memberColor(post.author_id),
        kind: 'publication',
        text: 'a publié dans le Cercle',
        when: relativeWhen(post.created_at),
      });
    }
    return entries.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 6);
  }, [events.rows, expenses.rows, members, posts.rows, tasks.rows]);

  const board = useMemo(() => {
    const balances = new Map<string, number>();
    for (const member of members) balances.set(member.id, 0);
    for (const expense of expenses.rows) {
      const shares = (participants ?? []).filter((participant) => participant.expense_id === expense.id);
      const equal = shares.length === 0 ? members.length : shares.length;
      balances.set(expense.paid_by, (balances.get(expense.paid_by) ?? 0) + expense.amount);
      if (shares.length === 0) {
        for (const member of members) balances.set(member.id, (balances.get(member.id) ?? 0) - expense.amount / equal);
        continue;
      }
      const total = shares.reduce((sum, share) => sum + share.share_amount, 0) || expense.amount;
      for (const share of shares) {
        if (!share.member_id) continue;
        const amount = total === expense.amount ? expense.amount / equal : share.share_amount;
        balances.set(share.member_id, (balances.get(share.member_id) ?? 0) - amount);
      }
    }
    return {
      total: expenses.rows.reduce((sum, expense) => sum + expense.amount, 0),
      monthLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date()),
      members: members
        .filter((member) => member.role !== 'enfant')
        .map((member) => ({ memberId: member.id, displayName: member.display_name, amount: balances.get(member.id) ?? 0 })),
    };
  }, [expenses.rows, members, participants]);

  const nextEvent = useMemo(() => nextEventOfDay(events.rows), [events.rows]);

  const nextShopping = useMemo(() => {
    const event = events.rows
      .filter((row) => /cours/i.test(row.title))
      .map((row) => ({ row, iso: toIsoDate(toLocalDate(row.start_at)) }))
      .filter((entry) => daysBetween(todayIso(), entry.iso) >= 0)
      .sort((a, b) => a.iso.localeCompare(b.iso))[0];
    if (!event) return null;
    const days = daysBetween(todayIso(), event.iso);
    return {
      title: event.row.title,
      iso: event.iso,
      relative: days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : `dans ${days} jours`,
    };
  }, [events.rows]);

  return {
    widgets: preferences,
    placements: layoutWidgets(preferences),
    events: events.rows,
    setWidgetOrder,
    eventDates,
    eventCountByDate,
    holidays,
    openTasks,
    taskCount: tasks.rows.length,
    toggleTask: async (task: TaskRow) => {
      await tasks.update(task.id, { status: task.status === 'fait' ? 'a_faire' : 'fait' });
    },
    isUpdatingTask: tasks.isMutating,
    upcomingBirthdays,
    routineProgress,
    city,
    setCity,
    activity,
    board,
    nextEvent,
    nextShopping,
  };
}

/* ------------------------------------------------------------------ */
/* Utilitaires locaux                                                 */
/* ------------------------------------------------------------------ */

/** Prochain anniversaire, 29 février inclus. */
export function nextBirthdayIso(birthDate: string, fromYear: number) {
  const [month, day] = birthDate.split('-').slice(1).map(Number);
  const today = todayIso();
  const inThisYear = `${fromYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (inThisYear >= today) return inThisYear;
  const next = `${fromYear + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return next;
}

function relativeWhen(iso: string) {
  const deltaMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (deltaMinutes < 1) return new Date().toISOString();
  if (deltaMinutes < 60) return new Date(Date.now() - deltaMinutes * 60_000).toISOString();
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return new Date(Date.now() - hours * 3_600_000).toISOString();
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
