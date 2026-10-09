import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ModuleShell, MetricRow, Panel, CountBadge } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, LoadingRows, OfflineEmptyState } from '@/components/ui/empty-state';
import { useOnline } from '@/hooks/use-online';
import { DataError } from '@/lib/data';
import { Field } from '@/components/ui/field';
import { Select, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useCalendarGrid } from '@/hooks/use-calendar';
import { useMembers, useIsAdmin, useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import { addDays, formatLongDate, formatMonthLabel, formatShortDate, pad, pluralize, todayIso } from '@/lib/utils';
import { CalendarGrid } from './components/calendar-grid';
import { AgendaList } from './components/agenda-list';
import { EventFormDialog } from './components/event-form-dialog';
import { useCalendrier } from './hooks/use-calendrier';
import { useRefDays } from './hooks/use-ref-days';
import { useSchoolZone } from './hooks/use-school-zone';
import { createPersonalCalendar, createCategory, deleteCalendar, moveCalendarEvents, CATEGORY_COLORS } from './api';
import { suggestZoneForCity } from './lib/zone-resolver';
import { buildAgenda, buildDayMarkers, isExitingPerso } from './types';
import type { CalendarEvent, EventFormValues } from './types';
import type { EventCalendarRow } from '@/types';

const titleCase = (value: string) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : value);

type CalendarView = 'mois' | 'semaine' | 'jour' | 'liste';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'mois', label: 'Mois' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'jour', label: 'Jour' },
  { value: 'liste', label: 'Liste' },
];

const VIEW_STORAGE_KEY = 'eo:calendrier:view';

function readStoredView(): CalendarView {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.some((view) => view.value === stored) ? (stored as CalendarView) : 'mois';
  } catch {
    return 'mois';
  }
}

/** Lundi de la semaine du jour donné (ISO). */
function weekStartOf(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  return addDays(iso, -mondayOffset);
}

export default function CalendrierPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { events, tasks, birthdays, categories, calendars, reminders, isLoading, isError, error, refetch, isMutating, saveEvent, removeEvent } =
    useCalendrier();
  const members = useMembers();
  const isAdmin = useIsAdmin();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);
  const city = useHouseholdStore((state) => state.city);
  const [isDetectingZone, setIsDetectingZone] = useState(false);
  // Curseur calé sur le 1er du mois courant : la grille démarre bien le lundi.
  const today = new Date();
  const grid = useCalendarGrid(new Date(today.getFullYear(), today.getMonth(), 1));
  const { zone, isLoading: isZoneLoading, isSaving: isZoneSaving, saveZone } = useSchoolZone();
  const { holidays, vacations, isError: isRefError } = useRefDays(grid.year, zone);
  const [dialog, setDialog] = useState<{ open: boolean; event: CalendarEvent | null; date: string }>({
    open: false,
    event: null,
    date: grid.selected,
  });
  const online = useOnline();
  // Cache vide hors ligne (D-07, 09-05) : même prédicat que le motif 09-03,
  // adopté au niveau de la page.
  const isEmptyCacheOffline = !online && events.length === 0 && (isLoading || isError);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  // Sortie du secret (D-04) : déplacement Perso → Commun en attente de confirmation.
  const [pendingMove, setPendingMove] = useState<{ event: CalendarEvent; values: EventFormValues } | null>(null);
  const [view, setView] = useState<CalendarView>(readStoredView);
  const [categoryFilter, setCategoryFilter] = useState('toutes');
  const [memberFilter, setMemberFilter] = useState('tous');
  const [calendarFilter, setCalendarFilter] = useState('tous');
  const [showBirthdays, setShowBirthdays] = useState(true);
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarName, setCalendarName] = useState('');
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false);
  const [pendingCalendarDelete, setPendingCalendarDelete] = useState<EventCalendarRow | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState<string>(CATEGORY_COLORS[0]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const selected = grid.selected;

  // Perso de l'utilisateur courant (0090 : un seul par adulte, supprimable
  // par son owner). Tant qu'il existe, la création est masquée : un second
  // Perso violerait l'unicité par owner.
  const ownPerso = useMemo(
    () => calendars.find((calendar) => calendar.visibility === 'perso' && calendar.owner_member_id === currentMember?.id) ?? null,
    [calendars, currentMember?.id],
  );
  const ownPersoEventCount = useMemo(
    () => (ownPerso ? events.filter((event) => event.calendarId === ownPerso.id).length : 0),
    [events, ownPerso],
  );

  const confirmCalendarDelete = async () => {
    const target = pendingCalendarDelete;
    setPendingCalendarDelete(null);
    if (!target) return;
    try {
      const eventCount = events.filter((event) => event.calendarId === target.id).length;
      if (eventCount > 0) {
        const commun = calendars.find((calendar) => calendar.visibility === 'commun') ?? null;
        // Sortie du secret collective (même exigence que D-04) : le dialogue
        // de confirmation ci-dessous l'annonce explicitement avant exécution.
        if (!commun) throw new Error('Aucun calendrier Commun pour accueillir les événements.');
        await moveCalendarEvents(target.id, commun.id);
      }
      await deleteCalendar(target.id);
      if (calendarFilter === target.id) setCalendarFilter('tous');
      refetch();
      toast(
        eventCount > 0
          ? `Calendrier « ${target.name} » supprimé, ${eventCount} événement${eventCount > 1 ? 's' : ''} déplacé${eventCount > 1 ? 's' : ''} vers Commun.`
          : `Calendrier « ${target.name} » supprimé.`,
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Le calendrier n’a pas pu être supprimé.', 'error');
    }
  };

  const changeView = (next: CalendarView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Stockage indisponible : la vue reste en mémoire pour la session.
    }
  };

  // Filtres combinés catégorie × membre × calendrier, appliqués aux événements du foyer.
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          (categoryFilter === 'toutes' ||
            (categoryFilter === 'sans' ? event.categoryId === null : event.categoryId === categoryFilter)) &&
          (memberFilter === 'tous' || event.author?.id === memberFilter) &&
          (calendarFilter === 'tous' || event.calendarId === calendarFilter),
      ),
    [events, categoryFilter, memberFilter, calendarFilter],
  );
  const visibleBirthdays = showBirthdays ? birthdays : [];
  // Couches de référence toujours visibles, en fond non cliquable (D-10) :
  // aucun interrupteur ne peut les masquer.
  const visibleHolidays = holidays;
  const visibleVacations = vacations;

  const agenda = useMemo(
    () => buildAgenda(selected, { events: visibleEvents, tasks, birthdays: visibleBirthdays, holidays: visibleHolidays, vacations: visibleVacations, today: todayIso() }),
    [selected, visibleEvents, tasks, visibleBirthdays, visibleHolidays, visibleVacations],
  );
  const markers = useMemo(
    () => buildDayMarkers(grid.days, { events: visibleEvents, tasks, birthdays: visibleBirthdays, holidays: visibleHolidays, vacations: visibleVacations }, todayIso()),
    [grid.days, visibleEvents, tasks, visibleBirthdays, visibleHolidays, visibleVacations],
  );
  const eventsThisMonth = useMemo(
    () => visibleEvents.filter((event) => event.date.startsWith(`${grid.year}-${pad(grid.month + 1)}`)).length,
    [visibleEvents, grid.year, grid.month],
  );

  const weekDays = useMemo(() => {
    const monday = weekStartOf(selected);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [selected]);

  // Liste : 30 jours à venir depuis la sélection, seuls les jours occupés.
  const listSections = useMemo(() => {
    const currentToday = todayIso();
    return Array.from({ length: 30 }, (_, index) => addDays(selected, index))
      .map((iso) => ({
        iso,
        items: buildAgenda(iso, { events: visibleEvents, tasks, birthdays: visibleBirthdays, holidays: visibleHolidays, vacations: visibleVacations, today: currentToday }),
      }))
      .filter((section) => section.items.length > 0);
  }, [selected, visibleEvents, tasks, visibleBirthdays, visibleHolidays, visibleVacations]);

  const openCreate = (date: string) => setDialog({ open: true, event: null, date });
  const openEdit = (event: CalendarEvent) => setDialog({ open: true, event, date: event.date });

  // Les enfants taguent sans créer (D-06) : aucun bouton de création affiché.
  const isChild = currentMember?.role === 'enfant';

  const persistEvent = async (editing: CalendarEvent | null, values: EventFormValues) => {
    try {
      await saveEvent({ id: editing?.id ?? null, values });
      setDialog((current) => ({ ...current, open: false }));
      toast(editing ? 'Modification enregistrée.' : 'Ajouté au foyer.');
    } catch (error) {
      // Mise en file hors ligne (D-07) : promesse de rejeu, jamais d'erreur.
      if (error instanceof DataError && error.queuedForSync) {
        setDialog((current) => ({ ...current, open: false }));
        toast('Événement ajouté — il sera synchronisé au retour du réseau.');
        return;
      }
      toast(error instanceof Error ? error.message : 'L’événement n’a pas pu être enregistré.', 'error');
    }
  };

  const handleShift = (delta: number) => {
    const next = new Date(grid.year, grid.month + delta, 1);
    grid.shift(delta);
    grid.setSelected(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`);
  };

  const agendaPanel = (
    <Panel
      id="calendar-agenda-panel"
      title={titleCase(formatLongDate(selected))}
      description="Les événements et tâches de cette journée."
      action={<CountBadge value={agenda.length} label="éléments dans l’agenda" />}
    >
      <div aria-live="polite">
        <AgendaList
          date={selected}
          items={agenda}
          isLoading={isLoading}
          onEdit={openEdit}
          onDelete={(event) => setPendingDelete(event)}
          onOpenTask={() => navigate('/taches')}
        />
      </div>
      {isLoading ? null : isChild ? null : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => openCreate(selected)}
          >
            Ajouter un événement
          </Button>
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => navigate('/taches', { state: { dueDate: selected } })}
          >
            Ajouter une tâche
          </Button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">
        {pluralize(events.length, 'événement')}
        {events.length > 1 ? 's' : ''} dans le foyer. Maintenez une date dans la grille pour créer un événement
        directement.
      </p>
    </Panel>
  );

  return (
    <ModuleShell
      module="calendrier"
      actions={
        isChild ? undefined : (
          <>
            <Button icon="plus" onClick={() => openCreate(selected)}>
              Ajouter un événement
            </Button>
            <Button icon="plus" onClick={() => navigate('/taches', { state: { dueDate: selected } })}>
              Ajouter une tâche
            </Button>
          </>
        )
      }
    >
      <MetricRow
        items={[
          { label: 'Ce mois', value: eventsThisMonth, caption: 'événements prévus' },
          { label: 'Sélection', value: formatShortDate(selected), caption: 'jour affiché' },
          { label: 'Anniversaires', value: birthdays.length, caption: 'dans le calendrier' },
          { label: 'Jours fériés', value: holidays.length, caption: 'pour cette année' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Vues du calendrier" className="flex flex-wrap gap-1.5">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => changeView(option.value)}
              className={
                view === option.value
                  ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
                  : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filtrer par catégorie"
          className="w-auto min-w-[170px]"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="toutes">Toutes catégories</option>
          <option value="sans">Sans catégorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrer par membre"
          className="w-auto min-w-[170px]"
          value={memberFilter}
          onChange={(event) => setMemberFilter(event.target.value)}
        >
          <option value="tous">Tout le foyer</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrer par calendrier"
          className="w-auto min-w-[170px]"
          value={calendarFilter}
          onChange={(event) => setCalendarFilter(event.target.value)}
        >
          <option value="tous">Tous calendriers</option>
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.name}
              {calendar.visibility === 'perso' ? ' (perso)' : ''}
            </option>
          ))}
        </Select>
        {ownPerso === null ? (
          <button
            type="button"
            onClick={() => {
              setCalendarName('');
              setCalendarDialogOpen(true);
            }}
            hidden={isChild}
            className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg"
          >
            + Calendrier perso
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPendingCalendarDelete(ownPerso)}
            hidden={isChild}
            title={
              ownPersoEventCount > 0
                ? `${ownPersoEventCount} événement${ownPersoEventCount > 1 ? 's' : ''} seront déplacés vers Commun`
                : 'Supprimer ce calendrier perso'
            }
            className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-coral"
          >
            Supprimer « {ownPerso.name} »
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setCategoryName('');
            setCategoryColor(CATEGORY_COLORS[0]);
            setCategoryDialogOpen(true);
          }}
          hidden={isChild}
          className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg"
        >
          + Catégorie
        </button>
        <button
          type="button"
          aria-pressed={showBirthdays}
          onClick={() => setShowBirthdays((current) => !current)}
          className={
            showBirthdays
              ? 'rounded-full bg-accent-faint px-3.5 py-2 text-[12px] font-extrabold text-accent-strong'
              : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
          }
        >
          Anniversaires
        </button>
        {isAdmin ? (
          <>
            <Select
              aria-label="Zone scolaire du foyer"
              className="w-auto min-w-[150px]"
              value={zone ?? ''}
              disabled={isZoneLoading || isZoneSaving}
              onChange={(event) => {
                const next = event.target.value === '' ? null : (event.target.value as 'A' | 'B' | 'C');
                void saveZone(next)
                  .then(() => toast(next ? `Zone ${next} enregistrée.` : 'Zone effacée.'))
                  .catch((saveError: unknown) =>
                    toast(saveError instanceof Error ? saveError.message : 'La zone n’a pas pu être enregistrée.', 'error'),
                  );
              }}
            >
              <option value="">Zone : à choisir</option>
              <option value="A">Zone A</option>
              <option value="B">Zone B</option>
              <option value="C">Zone C</option>
            </Select>
            <button
              type="button"
              disabled={isDetectingZone || city.trim() === ''}
              title={city.trim() === '' ? 'Indiquez une ville dans votre profil.' : `Détecter depuis ${city}.`}
              onClick={() => {
                setIsDetectingZone(true);
                void suggestZoneForCity(city)
                  .then(({ zone: detected, postcode }) => saveZone(detected).then(() => ({ detected, postcode })))
                  .then(({ detected, postcode }) => toast(`Zone ${detected} détectée (${postcode}).`))
                  .catch((detectError: unknown) =>
                    toast(detectError instanceof Error ? detectError.message : 'Zone non détectée.', 'error'),
                  )
                  .finally(() => setIsDetectingZone(false));
              }}
              className="rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg disabled:opacity-50"
            >
              {isDetectingZone ? 'Détection…' : 'Détecter la zone'}
            </button>
          </>
        ) : null}
      </div>

      {zone === null ? (
        <p className="mb-4 text-[12px] text-muted" role="status">
          Choisissez la zone scolaire du foyer (A, B ou C) pour afficher les vacances.
          {isAdmin ? '' : ' Un administrateur du foyer peut la régler ici.'}
        </p>
      ) : null}
      {isRefError ? (
        <p className="mb-4 text-[12px] text-muted" role="status">
          Référentiel jours fériés / vacances indisponible : seuls les événements du foyer sont affichés.
        </p>
      ) : null}

      {isEmptyCacheOffline ? (
        <OfflineEmptyState onRetry={refetch} />
      ) : isError ? (
        <ErrorState
          message={error?.message ?? 'Le calendrier du foyer n’a pas pu être chargé.'}
          onRetry={refetch}
        />
      ) : view === 'mois' ? (
        <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)] gap-[18px] max-[920px]:grid-cols-1">
          <CalendarGrid
            days={grid.days}
            monthLabel={formatMonthLabel(new Date(grid.year, grid.month, 1))}
            selected={selected}
            today={grid.isToday}
            markers={markers}
            onSelect={grid.setSelected}
            onLongPress={openCreate}
            onPrevious={() => handleShift(-1)}
            onNext={() => handleShift(1)}
            onToday={grid.goToToday}
          />

          {agendaPanel}
        </div>
      ) : view === 'semaine' ? (
        <div className="grid gap-[18px]">
          <Panel
            id="calendar-week-panel"
            title={`Semaine du ${formatShortDate(weekDays[0])}`}
            description="Sept jours, un coup d’œil."
          >
            <div className="grid grid-cols-7 gap-1.5 max-[650px]:grid-cols-7" role="group" aria-label="Jours de la semaine">
              {weekDays.map((iso) => {
                const count = buildAgenda(iso, { events: visibleEvents, tasks, birthdays: visibleBirthdays, holidays: visibleHolidays, vacations: visibleVacations, today: todayIso() }).length;
                const isSelected = iso === selected;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => grid.setSelected(iso)}
                    aria-pressed={isSelected}
                    aria-label={`${titleCase(formatLongDate(iso))}, ${count} élément${count > 1 ? 's' : ''}`}
                    className={
                      isSelected
                        ? 'grid place-items-center gap-0.5 rounded-[11px] bg-accent px-1 py-2 text-white'
                        : 'grid place-items-center gap-0.5 rounded-[11px] border border-border bg-surface px-1 py-2 hover:border-accent'
                    }
                  >
                    <span className="text-[10px] font-bold uppercase opacity-80">
                      {titleCase(formatLongDate(iso)).slice(0, 3)}
                    </span>
                    <span className="text-[15px] font-extrabold">{Number(iso.slice(8, 10))}</span>
                    <span className={count > 0 ? 'size-[5px] rounded-full bg-current' : 'size-[5px] rounded-full bg-transparent'} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </Panel>
          {agendaPanel}
        </div>
      ) : view === 'jour' ? (
        <div className="grid gap-[18px]">
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" icon="arrow" onClick={() => grid.setSelected(addDays(selected, -1))}>
              Jour précédent
            </Button>
            <Button variant="secondary" onClick={() => grid.setSelected(todayIso())}>
              Aujourd’hui
            </Button>
            <Button variant="secondary" icon="arrow" onClick={() => grid.setSelected(addDays(selected, 1))}>
              Jour suivant
            </Button>
          </div>
          {agendaPanel}
        </div>
      ) : (
        <div className="grid gap-[18px]">
          <p className="text-[12px] text-muted" role="status">
            {listSections.length === 0
              ? 'Rien à venir sur les 30 prochains jours avec ces filtres.'
              : `${listSections.length} jour${listSections.length > 1 ? 's' : ''} occupé${listSections.length > 1 ? 's' : ''} sur les 30 prochains jours.`}
          </p>
          {listSections.map((section) => (
            <Panel
              key={section.iso}
              id={`calendar-list-${section.iso}`}
              title={titleCase(formatLongDate(section.iso))}
              description={`${section.items.length} élément${section.items.length > 1 ? 's' : ''}`}
              action={<CountBadge value={section.items.length} label={`éléments le ${section.iso}`} />}
            >
              <AgendaList
                date={section.iso}
                items={section.items}
                isLoading={isLoading}
                onEdit={openEdit}
                onDelete={(event) => setPendingDelete(event)}
                onOpenTask={() => navigate('/taches')}
              />
            </Panel>
          ))}
        </div>
      )}

      {isLoading && !isError && !isEmptyCacheOffline ? <LoadingRows rows={2} className="mt-4" /> : null}

      <EventFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        event={dialog.event}
        defaultDate={dialog.date}
        remindAt={dialog.event ? (reminders[dialog.event.id]?.remindAt ?? null) : null}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.event;
          // Sortie du secret (D-04) : un déplacement Perso → Commun exige une
          // confirmation explicite avant d'être enregistré.
          if (
            editing &&
            values.calendarId !== '' &&
            isExitingPerso(calendars, editing.calendarId, values.calendarId)
          ) {
            setPendingMove({ event: editing, values });
            return;
          }
          await persistEvent(editing, values);
        }}
      />

      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow mb-2">Calendrier</p>
            <DialogTitle>Nouveau calendrier perso</DialogTitle>
            <DialogDescription>
              Visible uniquement par vous (et les admins en lecture). Vos événements perso n’apparaissent que dans ce calendrier.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!householdId || !currentMember) {
                toast('Aucun foyer sélectionné.', 'error');
                return;
              }
              setIsCreatingCalendar(true);
              void createPersonalCalendar(householdId, currentMember.id, calendarName)
                .then((calendar) => {
                  setCalendarDialogOpen(false);
                  setCalendarFilter(calendar.id);
                  refetch();
                  toast(`Calendrier « ${calendar.name} » créé.`);
                })
                .catch((createError: unknown) => {
                  // Mise en file hors ligne (D-07) : promesse de rejeu.
                  if (createError instanceof DataError && createError.queuedForSync) {
                    setCalendarDialogOpen(false);
                    toast(`Calendrier « ${calendarName.trim()} » créé — il sera synchronisé au retour du réseau.`);
                    return;
                  }
                  toast(createError instanceof Error ? createError.message : 'Le calendrier n’a pas pu être créé.', 'error');
                })
                .finally(() => setIsCreatingCalendar(false));
            }}
          >
            <Field label="Nom du calendrier">
              {(props) => (
                <Input
                  {...props}
                  value={calendarName}
                  onChange={(change) => setCalendarName(change.target.value)}
                  placeholder="Ex. Sport perso"
                  autoComplete="off"
                  maxLength={40}
                />
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setCalendarDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" icon="plus" disabled={isCreatingCalendar || calendarName.trim() === ''}>
                Créer le calendrier
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow mb-2">Calendrier</p>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
            <DialogDescription>
              Repas, devoirs, sorties… une pastille colorée pour repérer les événements du foyer.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!householdId) {
                toast('Aucun foyer sélectionné.', 'error');
                return;
              }
              setIsCreatingCategory(true);
              void createCategory(householdId, currentMember?.id ?? null, categoryName, categoryColor)
                .then((category) => {
                  setCategoryDialogOpen(false);
                  setCategoryFilter(category.id);
                  refetch();
                  toast(`Catégorie « ${category.name} » créée.`);
                })
                .catch((createError: unknown) => {
                  // Mise en file hors ligne (D-07) : promesse de rejeu.
                  if (createError instanceof DataError && createError.queuedForSync) {
                    setCategoryDialogOpen(false);
                    toast(`Catégorie « ${categoryName.trim()} » créée — elle sera synchronisée au retour du réseau.`);
                    return;
                  }
                  toast(createError instanceof Error ? createError.message : 'La catégorie n’a pas pu être créée.', 'error');
                })
                .finally(() => setIsCreatingCategory(false));
            }}
          >
            <Field label="Nom de la catégorie">
              {(props) => (
                <Input
                  {...props}
                  value={categoryName}
                  onChange={(change) => setCategoryName(change.target.value)}
                  placeholder="Ex. Devoirs"
                  autoComplete="off"
                  maxLength={40}
                />
              )}
            </Field>
            <div>
              <span id="category-color-label" className="mb-1.5 block text-[12px] font-bold">
                Couleur
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="category-color-label">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={categoryColor === color}
                    aria-label={color}
                    title={color}
                    onClick={() => setCategoryColor(color)}
                    style={{ backgroundColor: color }}
                    className={
                      categoryColor === color
                        ? 'size-[34px] rounded-full outline-3 outline-offset-2 outline-accent-strong'
                        : 'size-[34px] rounded-full border border-border'
                    }
                  />
                ))}
              </div>
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setCategoryDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" icon="plus" disabled={isCreatingCategory || categoryName.trim() === ''}>
                Créer la catégorie
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingMove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null);
        }}
        title="Rendre visible à tout le foyer ?"
        description="Cet événement quittera votre calendrier perso : tous les membres du foyer pourront le voir. Cette action est réversible en le déplaçant à nouveau."
        confirmLabel="Rendre visible"
        destructive={false}
        onConfirm={() => {
          const move = pendingMove;
          setPendingMove(null);
          if (!move) return;
          void persistEvent(move.event, move.values);
        }}
      />

      <ConfirmDialog
        open={pendingCalendarDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCalendarDelete(null);
        }}
        title={`Supprimer « ${pendingCalendarDelete?.name ?? ''} » ?`}
        description={
          ownPersoEventCount > 0
            ? `${ownPersoEventCount} événement${ownPersoEventCount > 1 ? 's' : ''} de ce calendrier seront déplacés vers le calendrier Commun et deviendront visibles par tout le foyer.`
            : 'Ce calendrier perso sera définitivement supprimé.'
        }
        confirmLabel="Supprimer le calendrier"
        onConfirm={() => {
          void confirmCalendarDelete();
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.title ?? ''} » ?`}
        description="L’événement et son rappel seront retirés du calendrier du foyer."
        confirmLabel="Supprimer l’événement"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeEvent(target.id)
            .then(() => toast('Événement supprimé.'))
            .catch((error: unknown) =>
              toast(error instanceof Error ? error.message : 'L’événement n’a pas pu être supprimé.', 'error'),
            );
        }}
      />
    </ModuleShell>
  );
}
