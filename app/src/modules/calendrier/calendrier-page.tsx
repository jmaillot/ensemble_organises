import { useMemo, useState } from 'react';
import { ModuleShell, MetricRow, Panel, CountBadge } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useCalendarGrid } from '@/hooks/use-calendar';
import { useFrenchHolidays } from '@/hooks/use-french-holidays';
import { formatLongDate, formatMonthLabel, formatShortDate, pad, pluralize } from '@/lib/utils';
import { CalendarGrid } from './components/calendar-grid';
import { AgendaList } from './components/agenda-list';
import { EventFormDialog } from './components/event-form-dialog';
import { useCalendrier } from './hooks/use-calendrier';
import { buildAgenda, buildDayMarkers } from './types';
import type { CalendarEvent } from './types';

const titleCase = (value: string) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : value);

export default function CalendrierPage() {
  const toast = useToast();
  const { events, birthdays, reminders, isLoading, isError, error, refetch, isMutating, saveEvent, removeEvent } =
    useCalendrier();
  // Curseur calé sur le 1er du mois courant : la grille démarre bien le lundi.
  const today = new Date();
  const grid = useCalendarGrid(new Date(today.getFullYear(), today.getMonth(), 1));
  const holidays = useFrenchHolidays(grid.year);
  const [dialog, setDialog] = useState<{ open: boolean; event: CalendarEvent | null; date: string }>({
    open: false,
    event: null,
    date: grid.selected,
  });
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);

  const selected = grid.selected;

  const agenda = useMemo(
    () => buildAgenda(selected, { events, birthdays, holidays }),
    [selected, events, birthdays, holidays],
  );
  const markers = useMemo(
    () => buildDayMarkers(grid.days, { events, birthdays, holidays }),
    [grid.days, events, birthdays, holidays],
  );
  const eventsThisMonth = useMemo(
    () => events.filter((event) => event.date.startsWith(`${grid.year}-${pad(grid.month + 1)}`)).length,
    [events, grid.year, grid.month],
  );

  const openCreate = (date: string) => setDialog({ open: true, event: null, date });
  const openEdit = (event: CalendarEvent) => setDialog({ open: true, event, date: event.date });

  const handleShift = (delta: number) => {
    const next = new Date(grid.year, grid.month + delta, 1);
    grid.shift(delta);
    grid.setSelected(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`);
  };

  return (
    <ModuleShell
      module="calendrier"
      actions={
        <Button icon="plus" onClick={() => openCreate(selected)}>
          Ajouter un événement
        </Button>
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

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Le calendrier du foyer n’a pas pu être chargé.'}
          onRetry={refetch}
        />
      ) : (
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

          <Panel
            id="calendar-agenda-panel"
            title={titleCase(formatLongDate(selected))}
            description="Les événements de cette journée."
            action={<CountBadge value={agenda.length} label="éléments dans l’agenda" />}
          >
            <div aria-live="polite">
              <AgendaList
                date={selected}
                items={agenda}
                isLoading={isLoading}
                onAdd={() => openCreate(selected)}
                onEdit={openEdit}
                onDelete={(event) => setPendingDelete(event)}
              />
            </div>
            {isLoading || agenda.length === 0 ? null : (
              <Button
                variant="secondary"
                icon="plus"
                fullWidth
                className="mt-4"
                onClick={() => openCreate(selected)}
              >
                Ajouter à cette journée
              </Button>
            )}
            <p className="mt-3 text-[11px] text-muted">
              {pluralize(events.length, 'événement')}
              {events.length > 1 ? 's' : ''} dans le foyer. Maintenez une date dans la grille pour créer un événement
              directement.
            </p>
          </Panel>
        </div>
      )}

      {isLoading && !isError ? <LoadingRows rows={2} className="mt-4" /> : null}

      <EventFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        event={dialog.event}
        defaultDate={dialog.date}
        remindAt={dialog.event ? (reminders[dialog.event.id]?.remindAt ?? null) : null}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.event;
          try {
            await saveEvent({ id: editing?.id ?? null, values });
            setDialog((current) => ({ ...current, open: false }));
            toast(editing ? 'Modification enregistrée.' : 'Ajouté au foyer.');
          } catch (error) {
            toast(error instanceof Error ? error.message : 'L’événement n’a pas pu être enregistré.', 'error');
          }
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
