import { useMemo, useRef, useState } from 'react';
import { ModuleShell, MetricRow, Panel, SectionHeading } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useToast } from '@/components/ui/toast';
import { useCalendarGrid } from '@/hooks/use-calendar';
import { formatMonthLabel } from '@/lib/utils';
import { RoutineCard } from './components/routine-card';
import { HistoryCalendar, RoutineHistory } from './components/routine-history';
import { RoutineFormDialog } from './components/routine-form-dialog';
import { useRoutines } from './hooks/use-routines';
import { memberFirstName, type HistoryEntry, type Routine } from './types';

export default function RoutinesPage() {
  const toast = useToast();
  const {
    routines,
    dueToday,
    visibleRoutines,
    history,
    dayStatuses,
    currentMemberId,
    period,
    setPeriod,
    query,
    setQuery,
    isLoading,
    isError,
    error,
    isMutating,
    refetch,
    toggleOccurrence,
    saveRoutine,
    removeRoutine,
    removeOccurrence,
    total,
    dueTodayCount,
    doneTodayCount,
    bestStreak,
    late,
  } = useRoutines();
  const [dialog, setDialog] = useState<{ open: boolean; routine: Routine | null }>({ open: false, routine: null });
  const [pendingDelete, setPendingDelete] = useState<Routine | null>(null);
  const [pendingOccurrence, setPendingOccurrence] = useState<HistoryEntry | null>(null);
  const routinesPanelRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const grid = useCalendarGrid(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthLabel = useMemo(() => formatMonthLabel(new Date(grid.year, grid.month, 1)), [grid.month, grid.year]);
  const openCreate = () => setDialog({ open: true, routine: null });
  const openEdit = (routine: Routine) => setDialog({ open: true, routine });
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }));

  const report = (error: unknown, fallback: string) => {
    toast(error instanceof Error ? error.message : fallback, 'error');
  };

  return (
    <ModuleShell
      module="routines"
      actions={
        <Button icon="plus" onClick={openCreate}>
          Nouvelle routine
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Routines', value: total, caption: 'rituels suivis' },
          { label: 'Aujourd’hui', value: `${doneTodayCount}/${dueTodayCount}`, caption: 'déjà cochées' },
          { label: 'Meilleure série', value: bestStreak, caption: 'jours d’affilée' },
          {
            label: 'En retard',
            value: late,
            caption: late > 1 ? 'occurrences à rattraper' : late === 1 ? 'occurrence à rattraper' : 'rien à rattraper',
          },
        ]}
      />

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Les routines du foyer n’ont pas pu être chargées.'}
          onRetry={refetch}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] items-start gap-[18px] max-[920px]:grid-cols-1 [&>*]:min-w-0">
          <div className="grid min-w-0 grid-cols-1 gap-[18px]">
            <section>
              <SectionHeading
                title="Le rythme du foyer"
                description="Les séries se construisent avec les petits gestes répétés."
              />
              <p className="sr-only" aria-live="polite">
                {dueTodayCount > 0
                  ? `${doneTodayCount} occurrence${doneTodayCount > 1 ? 's' : ''} cochée${doneTodayCount > 1 ? 's' : ''} sur ${dueTodayCount} aujourd’hui.`
                  : 'Aucune routine prévue aujourd’hui.'}
              </p>

              {isLoading ? (
                <LoadingRows rows={3} />
              ) : routines.length === 0 ? (
                <EmptyState
                  icon="wand"
                  title="Aucune routine dans le foyer"
                  description="Les séries se construisent avec les petits gestes répétés. Créez un premier rituel récurrent pour lancer la dynamique."
                  actionLabel="Créer une routine"
                  onAction={openCreate}
                />
              ) : dueToday.length === 0 ? (
                <EmptyState
                  icon="checkCircle"
                  title="Rien à cocher aujourd’hui"
                  description="Aucune routine n’est prévue pour aujourd’hui. Les prochaines occurrences apparaîtront ici au moment venu."
                  actionLabel="Créer une routine"
                  onAction={openCreate}
                  secondaryActionLabel="Voir toutes les routines"
                  onSecondaryAction={() => routinesPanelRef.current?.scrollIntoView({ block: 'start' })}
                />
              ) : (
                <div
                  role="list"
                  aria-label="Occurrences du jour"
                  className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1"
                >
                  {dueToday.map((routine) => (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      showStreakBadge
                      onToggle={(target) => {
                        void toggleOccurrence(target).catch((toggleError: unknown) =>
                          report(toggleError, 'L’occurrence n’a pas pu être enregistrée.'),
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

            <div ref={routinesPanelRef} className="min-w-0">
              <Panel
                id="routines-panel"
                title="Toutes les routines"
                description="Fréquence, prochaine occurrence et série de chaque rituel."
                action={
                  <SearchInput
                    aria-label="Rechercher une routine"
                    placeholder="Rechercher une routine"
                    className="w-auto min-w-[200px]"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                }
              >
                {isLoading ? (
                  <LoadingRows rows={3} />
                ) : visibleRoutines.length === 0 ? (
                  <p className="m-0 text-xs text-muted">
                    Aucune routine ne correspond à « {query.trim()} ». Modifiez la recherche ou créez un nouveau rituel.
                  </p>
                ) : (
                  <div role="list" aria-label="Routines du foyer" className="grid">
                    {visibleRoutines.map((routine) => (
                      <div
                        key={routine.id}
                        role="listitem"
                        className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-[150px] flex-1">
                          <p className="m-0 text-[13px] font-[760]">{routine.name}</p>
                          <small className="text-[10px] text-muted">
                            {routine.frequencyLabel} · {routine.nextLabel}
                          </small>
                        </div>

                        <div className="flex items-center gap-1.5" aria-hidden="true">
                          {routine.assignees.map((assignee) => (
                            <MemberAvatar key={assignee.memberId} member={assignee.member} size="sm" />
                          ))}
                        </div>
                        {routine.assignees.length > 0 ? (
                          <span className="sr-only">
                            Assignée à{' '}
                            {routine.assignees.map((assignee) => memberFirstName(assignee.member.display_name)).join(', ')}
                          </span>
                        ) : null}

                        <span className="text-[11px] text-muted">{routine.streakLabel}</span>

                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(routine)}
                            aria-label={`Modifier la routine ${routine.name}`}
                            className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
                          >
                            <Icon name="edit" size="sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(routine)}
                            aria-label={`Supprimer la routine ${routine.name}`}
                            className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
                          >
                            <Icon name="trash" size="sm" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-[18px]">
            <RoutineHistory
              entries={history}
              period={period}
              onPeriodChange={setPeriod}
              isLoading={isLoading}
              onDeleteOccurrence={setPendingOccurrence}
            />
            <HistoryCalendar
              days={grid.days}
              monthLabel={monthLabel}
              today={grid.isToday}
              statuses={dayStatuses}
              onPrevious={() => grid.shift(-1)}
              onNext={() => grid.shift(1)}
              onToday={grid.goToToday}
            />
          </div>
        </div>
      )}

      <RoutineFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        routine={dialog.routine}
        currentMemberId={currentMemberId}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.routine;
          try {
            await saveRoutine(editing, values);
            closeDialog();
            toast(editing ? 'Routine mise à jour.' : 'Routine ajoutée au rythme du foyer.');
          } catch (submissionError) {
            report(submissionError, 'La routine n’a pas pu être enregistrée.');
          }
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.name ?? ''} » ?`}
        description="La routine, ses assignataires, son rappel et toutes ses occurrences seront retirés du foyer."
        confirmLabel="Supprimer la routine"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeRoutine(target)
            .then(() => toast('Routine supprimée.'))
            .catch((removalError: unknown) => report(removalError, 'La routine n’a pas pu être supprimée.'));
        }}
      />

      <ConfirmDialog
        open={pendingOccurrence !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOccurrence(null);
        }}
        title="Retirer cette occurrence ?"
        description={
          pendingOccurrence
            ? `La trace « ${pendingOccurrence.routineName} » du ${pendingOccurrence.date} disparaîtra de l’historique.`
            : 'La trace disparaîtra de l’historique.'
        }
        confirmLabel="Retirer l’occurrence"
        onConfirm={() => {
          const target = pendingOccurrence;
          setPendingOccurrence(null);
          if (!target) return;
          void removeOccurrence(target)
            .then(() => toast('Occurrence retirée de l’historique.'))
            .catch((removalError: unknown) => report(removalError, 'L’occurrence n’a pas pu être retirée.'));
        }}
      />
    </ModuleShell>
  );
}
