import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDaysInMonth } from 'date-fns';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useSessionUser } from '@/hooks/use-auth';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import { useFrenchHolidays } from '@/hooks/use-french-holidays';
import { useRoutines } from '@/modules/routines/hooks/use-routines';
import { SHOPPING_ITEMS_TABLE } from '@/modules/courses/api';
import { todayIso, daysBetween, eventWallDate, eventWallTime } from '@/lib/utils';
import type { ModuleKey } from '@/lib/modules';
import type { BirthdayRow, DashboardWidgetRow, EventRow, ExpenseParticipantRow, ExpenseRow, HouseholdMemberRow, PostRow, ProfileRow, ShoppingListItemRow, TaskRow } from '@/types';
import {
  layoutWidgets,
  nextUpcomingEvent,
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
  /* Point du jour : tout ce qui est planifié aujourd'hui, avec horaires. */
  todayItems: TodayItem[];
  /* Activité */
  activity: ActivityEntry[];
  /* Ardoise */
  board: {
    total: number;
    monthLabel: string;
    members: { memberId: string; displayName: string; amount: number }[];
  };
  nextEvent: ReturnType<typeof nextUpcomingEvent>;
  nextShopping: { title: string; iso: string; relative: string } | null;
  /**
   * Compteur des tuiles « Mes applications » (le pastille bas-gauche du
   * vrai site melimelo). Dérivé EXCLUSIVEMENT des lectures déjà faites
   * pour les widgets — la seule lecture ajoutée est `shopping_list_items`,
   * la même table et la même clé que le module Courses, donc zéro requête
   * doublon. Absent = pas de compteur sur la tuile ; jamais un zéro
   * décoratif (règle du mur de zéros).
   */
  tileCounters: Partial<Record<ModuleKey, { value: number; label: string }>>;
}

export interface TodayItem {
  id: string;
  kind: 'tache-retard' | 'tache' | 'evenement';
  /** Heure locale HH:MM, ou null (retard, journée entière). */
  time: string | null;
  title: string;
  detail: string;
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
 * Le point du jour dérive de `tasks` + `events` : ces deux ressources sont
 * ré-interrogées chaque minute pour que l'accueil resté ouvert suive les
 * ajouts des autres membres sans rechargement manuel.
 */
export const POINT_DU_JOUR_REFETCH_MS = 60_000;

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

  const tasks = useResource<TaskRow>('tasks', { refetchInterval: POINT_DU_JOUR_REFETCH_MS });
  const events = useResource<EventRow>('events', { refetchInterval: POINT_DU_JOUR_REFETCH_MS });
  const birthdays = useResource<BirthdayRow>('birthdays');
  const expenses = useResource<ExpenseRow>('expenses');
  const posts = useResource<PostRow>('posts');
  // Compteur de la tuile Courses : même table, même clé que le module —
  // la lecture du tableau de bord et celle de la page Courses partagent
  // leur cache, aucune ne se répète.
  const shoppingItems = useResource<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE);
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
    await Promise.all(
      next.map(async (preference, index) => {
        // Une seule écriture, fusionnée par le serveur sur la cible
        // `(member_id, widget_type)` (`dashboard_widgets_member_type_key`,
        // 0004). Décider `update` ou `create` d'après `widgets.rows` laissait
        // une fenêtre où la lecture est vide sans que la base le soit (course
        // au premier rendu, lecture en échec) : chaque préférence passait alors
        // par `create`, ce qui heurtait la contrainte en mode Supabase
        // (`23505`, rejet avalé par l'appelant) et ajoutait une seconde ligne
        // par `(member_id, widget_type)` en mode démo.
        //
        // Aucun `id` : `dashboard_widgets.id` a un défaut
        // (`private.new_id('widget')`) et un `id` étranger à la ligne existante
        // ferait échouer la fusion sur la clé primaire au lieu de la cible.
        await data.upsert(
          'dashboard_widgets',
          {
            household_id: householdId,
            member_id: currentMember.id,
            widget_type: preference.kind,
            position_x: index,
            position_y: 0,
            width: preference.visible ? (preference.kind === 'routines' ? 2 : 1) : 0,
            height: 1,
          } as never,
          { onConflict: 'member_id,widget_type' },
        );
      }),
    );
    await widgets.refetch();
  }, [currentMember, householdId, widgets]);

  const eventDates = useMemo(() => new Set(events.rows.map((event) => eventWallDate(event.start_at))), [events.rows]);
  const eventCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events.rows) {
      const iso = eventWallDate(event.start_at);
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    for (const birthday of birthdays.rows) {
      const iso = `${year}-${birthday.birth_date.slice(5)}`;
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
    return counts;
  }, [birthdays.rows, events.rows, year]);

  // Phase 15 (régime 15-01, comme le module Tâches) : les lignes propres à
  // un voyage (`trip_id` renseigné) ne comptent ni dans les tâches ouvertes
  // ni dans le point du jour — elles vivent dans la fiche du voyage.
  const householdTasks = useMemo(() => tasks.rows.filter((task) => task.trip_id == null), [tasks.rows]);

  const openTasks = useMemo(
    () =>
      householdTasks
        .filter((task) => task.status !== 'fait')
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')),
    [householdTasks],
  );

  const todayItems = useMemo(() => buildTodayItems(tasks.rows, events.rows), [tasks.rows, events.rows]);

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

  const cityFromStore = useHouseholdStore((state) => state.city);
  const setCityInStore = useHouseholdStore((state) => state.setCity);
  const sessionUser = useSessionUser();

  // Source de vérité : `profiles.city`. Le store reste le repli (démo, hors
  // ligne, premier rendu avant la réponse).
  const { data: profileRows } = useQuery({
    queryKey: ['dashboard', 'profile-city', sessionUser?.id ?? 'demo'],
    enabled: Boolean(sessionUser?.id),
    queryFn: () => data.list<ProfileRow>('profiles', { id: sessionUser?.id ?? '' }),
  });
  const city = profileRows?.[0]?.city?.trim() || cityFromStore;
  const setCity = useCallback(
    async (next: string) => {
      setCityInStore(next);
      if (!sessionUser?.id) return;
      try {
        await data.update('profiles', sessionUser.id, { city: next } as never);
      } catch {
        // Hors ligne ou refus : l'écriture échoue et RIEN ne la rejoue (D-10 a
        // retiré la file de rejeu). Le store garde la valeur jusqu'au
        // rechargement, et c'est tout : elle n'est pas enregistrée côté serveur.
      }
    },
    [sessionUser?.id, setCityInStore],
  );

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
      const payerId = expense.paid_by_guest ?? expense.paid_by ?? '';
      entries.push({
        id: `expense-${expense.id}`,
        actor: memberName(payerId),
        actorColor: memberColor(payerId),
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

  const board = useBoardSummary(expenses.rows, participants, members);

  const nextEvent = useMemo(() => nextUpcomingEvent(events.rows), [events.rows]);

  // Compteurs des tuiles : dérivés des lectures ci-dessus, jamais un zéro
  // décoratif — un compteur absent vaut mieux qu'une pastille « 0 » qui
  // ressemble à un dysfonctionnement (règle du mur de zéros). Les tâches
  // propres à un voyage sont exclues, comme partout ailleurs (15-01).
  const tileCounters = useMemo<Partial<Record<ModuleKey, { value: number; label: string }>>>(() => {
    const monthNow = new Date().toISOString().slice(0, 7);
    const counters: Partial<Record<ModuleKey, { value: number; label: string }>> = {};
    const pendingShopping = shoppingItems.rows.filter((item) => !item.checked).length;
    if (pendingShopping > 0) counters.courses = { value: pendingShopping, label: 'articles à acheter' };
    if (openTasks.length > 0) counters.taches = { value: openTasks.length, label: 'tâches ouvertes' };
    const upcomingEvents = events.rows.filter((event) => eventWallDate(event.start_at) >= todayIso()).length;
    if (upcomingEvents > 0) counters.calendrier = { value: upcomingEvents, label: 'événements à venir' };
    const routinesLeft = routineProgress.total - routineProgress.done;
    if (routinesLeft > 0) counters.routines = { value: routinesLeft, label: 'routines à faire aujourd’hui' };
    if (birthdays.rows.length > 0) counters.anniversaires = { value: birthdays.rows.length, label: 'anniversaires suivis' };
    const monthExpenses = expenses.rows.filter((expense) => expense.expense_date?.slice(0, 7) === monthNow).length;
    if (monthExpenses > 0) counters.ardoise = { value: monthExpenses, label: 'dépenses ce mois-ci' };
    if (posts.rows.length > 0) counters.cercle = { value: posts.rows.length, label: 'publications du foyer' };
    return counters;
  }, [birthdays.rows, events.rows, expenses.rows, openTasks.length, posts.rows, routineProgress.done, routineProgress.total, shoppingItems.rows]);

  const nextShopping = useMemo(() => {
    const event = events.rows
      .filter((row) => /cours/i.test(row.title))
      .map((row) => ({ row, iso: eventWallDate(row.start_at) }))
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
    todayItems,
    activity,
    board,
    nextEvent,
    nextShopping,
    tileCounters,
  };
}

/* ------------------------------------------------------------------ */
/* Utilitaires locaux                                                 */
/* ------------------------------------------------------------------ */

/**
 * Prochain anniversaire, 29 février inclus. Le jour est borné par le mois de
 * l'année visée (`getDaysInMonth`) : un 29 février tombe sur le 28 en année non
 * bissextile. La concaténation d'origine rendait une date qui n'existe pas,
 * relue par `Date` comme le 1er mars (et `NaN` dans les moteurs qui la refusent) —
 * l'écart que WR-12 décrit.
 */
export function nextBirthdayIso(birthDate: string, fromYear: number) {
  const [month, day] = birthDate.split('-').slice(1).map(Number);
  const today = todayIso();
  const inThisYear = birthdayInYear(fromYear, month, day);
  if (inThisYear >= today) return inThisYear;
  return birthdayInYear(fromYear + 1, month, day);
}

/** `AAAA-MM-JJ` du jour d'anniversaire, borné par la longueur réelle du mois. */
function birthdayInYear(year: number, month: number, day: number) {
  const bounded = Math.min(day, getDaysInMonth(new Date(year, month - 1, 1)));
  return `${year}-${String(month).padStart(2, '0')}-${String(bounded).padStart(2, '0')}`;
}

function relativeWhen(iso: string) {
  const deltaMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (deltaMinutes < 1) return new Date().toISOString();
  if (deltaMinutes < 60) return new Date(Date.now() - deltaMinutes * 60_000).toISOString();
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return new Date(Date.now() - hours * 3_600_000).toISOString();
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/**
 * Tout ce qui est planifié à la date du jour : tâches en retard, tâches dues
 * aujourd'hui, événements du jour avec leur horaire. Triés retards d'abord,
 * puis par heure (les journées entières en dernier).
 * L'heure et la date des événements sont lues en heure murale (`slice`),
 * comme le calendrier : un `timestamptz` renvoyé avec offset ne doit pas
 * subir une seconde conversion locale (+2h à Paris).
 * Les tâches propres à un voyage (`trip_id` renseigné) y PARAISSENT (simple
 * rappel visuel) : seuls les COMPTEURS « À faire » les excluent (régime
 * 15-01, module Tâches et widget).
 */
export function buildTodayItems(taskRows: TaskRow[], eventRows: EventRow[], today: string = todayIso()): TodayItem[] {
  const items: TodayItem[] = [];
  for (const task of taskRows) {
    if (task.status === 'fait' || !task.due_date) continue;
    if (task.due_date < today) {
      items.push({
        id: `task-${task.id}`,
        kind: 'tache-retard',
        time: null,
        title: task.name,
        detail: `En retard depuis le ${task.due_date.split('-').reverse().join('/')}`,
      });
    } else if (task.due_date === today) {
      items.push({ id: `task-${task.id}`, kind: 'tache', time: null, title: task.name, detail: 'Échéance aujourd’hui' });
    }
  }
  for (const event of eventRows) {
    if (eventWallDate(event.start_at) !== today) continue;
    // `time` porte déjà l'horaire : `detail` affiche le lieu (ou reste vide)
    // pour ne pas répéter « 21:30 Courses · À 21:30 ».
    const time = event.all_day ? null : eventWallTime(event.start_at);
    const location = event.location?.trim() ?? '';
    items.push({
      id: `event-${event.id}`,
      kind: 'evenement',
      time,
      title: event.title,
      detail: event.all_day ? 'Toute la journée' : location,
    });
  }
  const rank = (item: TodayItem) => (item.kind === 'tache-retard' ? 0 : item.time ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || (a.time ?? '').localeCompare(b.time ?? ''));
}

/**
 * Résumé de l'Ardoise pour l'accueil : totaux locaux (sommes directes, pas de
 * calcul de répartition), soldes par membre en calcul local sur toutes les
 * ardoises du foyer. Le détail par ardoise (serveur) vit sur la page Ardoise.
 */
function useBoardSummary(
  expenseRows: ExpenseRow[],
  participants: ExpenseParticipantRow[] | undefined,
  members: HouseholdMemberRow[],
) {
  return useMemo(() => {
    const total = expenseRows.reduce((sum, expense) => sum + expense.amount, 0);
    const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date());
    const balances = new Map<string, number>();
    for (const member of members) balances.set(member.id, 0);
    for (const expense of expenseRows) {
      const shares = (participants ?? []).filter((participant) => participant.expense_id === expense.id);
      const equal = shares.length === 0 ? members.length : shares.length;
      if (expense.paid_by) {
        balances.set(expense.paid_by, (balances.get(expense.paid_by) ?? 0) + expense.amount);
      }
      if (shares.length === 0) {
        for (const member of members) balances.set(member.id, (balances.get(member.id) ?? 0) - expense.amount / equal);
        continue;
      }
      const shared = shares.reduce((sum, share) => sum + share.share_amount, 0) || expense.amount;
      for (const share of shares) {
        if (!share.member_id) continue;
        const amount = shared === expense.amount ? expense.amount / equal : share.share_amount;
        balances.set(share.member_id, (balances.get(share.member_id) ?? 0) - amount);
      }
    }
    return {
      total,
      monthLabel,
      members: members
        .filter((member) => member.role !== 'enfant')
        .map((member) => ({ memberId: member.id, displayName: member.display_name, amount: balances.get(member.id) ?? 0 })),
    };
  }, [expenseRows, participants, members]);
}
