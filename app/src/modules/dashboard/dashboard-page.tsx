import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CountBadge, SectionHeading } from '@/components/shared/module-shell';
import { ModuleTile } from '@/components/shared/module-tile';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import { modules } from '@/lib/modules';
import type { TaskRow } from '@/types';
import { cn } from '@/lib/utils';
import { useDashboard } from './hooks/use-dashboard';
import {
  ActivityCard,
  BirthdaysWidget,
  BoardSummaryCard,
  CalendarWidget,
  CustomizePanel,
  RoutinesWidget,
  ShoppingCard,
  TasksWidget,
  WeatherWidget,
  WIDGET_COLUMNS,
} from './components/widgets';
import { firstName, formatDashboardEyebrow } from './types';
import { reorderPreferences, resetPreferences, toggleWidget, type WidgetKind } from './types';

const taskSchema = z.object({
  name: z.string().trim().min(2, 'Donnez un nom à la tâche.'),
  dueDate: z.string(),
  assignee: z.string().min(1, 'Choisissez un membre.'),
});

type TaskFormValues = z.infer<typeof taskSchema>;

export default function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSessionUser();
  const members = useMembers();
  const householdName = useHouseholdStore((state) => state.householdName);
  const [isEditing, setIsEditing] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const dashboard = useDashboard();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleKinds = useMemo(() => dashboard.placements.map((placement) => placement.kind), [dashboard.placements]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = active.id as WidgetKind;
    const to = over.id as WidgetKind;
    void dashboard.setWidgetOrder(reorderPreferences(dashboard.widgets, from, to));
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { name: '', dueDate: new Date().toISOString().slice(0, 10), assignee: '' },
  });

  const onSubmit = (values: TaskFormValues) => {
    // La création détaillée appartient au module À faire : l'accueil ouvre la
    // même fiche, pré-remplie, plutôt que de dupliquer la logique d'écriture.
    sessionStorage.setItem('ensemble-organises:draft-task', JSON.stringify(values));
    setTaskDialogOpen(false);
    reset();
    toast('Brouillon transmis au module À faire.');
    navigate('/taches');
  };

  const openTasks = dashboard.openTasks;
  const dueToday = openTasks.filter((task) => task.due_date === new Date().toISOString().slice(0, 10));
  const nextEvent = dashboard.nextEvent;

  return (
    <section className="mx-auto w-[min(1480px,100%)]" data-module="accueil">
      <header className="mb-6 flex items-end justify-between gap-6 max-[650px]:block">
        <div>
          <p className="eyebrow mb-2">{formatDashboardEyebrow(new Date(), householdName)}</p>
          <h1 className="mb-2 text-[clamp(30px,3.2vw,47px)] leading-[1.02]">
            Bonjour {firstName(user?.displayName ?? 'Camille')}
            <span className="text-coral">.</span>
          </h1>
          <p className="lede mb-0 text-[15px]">
            Voici ce qui mérite votre attention aujourd’hui, sans perdre de vue ce qui compte.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 max-[650px]:mt-4 max-[650px]:justify-start">
          <Button
            variant="secondary"
            icon="grid"
            onClick={() => setIsEditing((value) => !value)}
            aria-pressed={isEditing}
          >
            {isEditing ? 'Terminer la personnalisation' : 'Personnaliser l’accueil'}
          </Button>
          <Button icon="plus" onClick={() => setTaskDialogOpen(true)}>
            Ajouter une tâche
          </Button>
        </div>
      </header>

      <section className="pulse-banner relative mb-[31px] flex items-center justify-between gap-[26px] overflow-hidden rounded-[22px] border border-accent/25 bg-accent-soft p-[22px] max-[650px]:block max-[650px]:p-[18px]">
        <span aria-hidden="true" className="pulse-ring" />
        <div className="relative z-1">
          <p className="eyebrow mb-1.5">Le point du jour</p>
          <h2 className="mb-1.5 text-xl tracking-[-0.02em]">
            {openTasks.length === 0
              ? 'Le foyer est à jour, profitez-en.'
              : dueToday.length > 0
                ? `${dueToday.length} échéance${dueToday.length > 1 ? 's' : ''} à garder en tête.`
                : `${openTasks.length} tâche${openTasks.length > 1 ? 's' : ''} en attente.`}
          </h2>
          <p className="m-0 text-[13px] text-ink-soft">
            {nextEvent
              ? `Le rendez-vous de ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(nextEvent.start_at))} approche.`
              : 'Aucune échéance aujourd’hui : la journée est à vous.'}{' '}
            Les courses, elles, sont presque prêtes.
          </p>
        </div>
        <div className="relative z-1 mt-0 min-w-[132px] border-l-0 border-t border-accent/25 pt-3.5 pl-0 min-[650px]:mt-0 min-[650px]:border-t-0 min-[650px]:border-l min-[650px]:pt-0 min-[650px]:pl-5">
          <span className="block text-[11px] text-muted">Prochain rendez-vous</span>
          <strong className="my-0.5 block font-display text-[25px] tracking-[-0.04em]">
            {nextEvent
              ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(nextEvent.start_at))
              : '—'}
          </strong>
          <small className="text-[11px] text-muted">{nextEvent ? nextEvent.title : 'Rien de planifié'}</small>
        </div>
      </section>

      {isEditing ? (
        <div className="mb-6">
          <CustomizePanel
            preferences={dashboard.widgets}
            onToggle={(kind) => void dashboard.setWidgetOrder(toggleWidget(dashboard.widgets, kind as WidgetKind))}
            onReset={() => void dashboard.setWidgetOrder(resetPreferences())}
            onClose={() => setIsEditing(false)}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_290px] items-start gap-6 max-[920px]:grid-cols-1">
        <div className="min-w-0">
          <SectionHeading
            title="Les essentiels du jour"
            description={isEditing ? 'Glissez les poignées pour réorganiser.' : 'Glissez les widgets pour les réorganiser.'}
            action={<CountBadge value={dashboard.placements.length} label="widgets affichés" />}
          />

          {dashboard.placements.length === 0 ? (
            <p className="panel-surface mb-[34px] rounded-[16px] p-[19px] text-xs text-muted">
              Tous les widgets sont masqués. Utilisez « Personnaliser l’accueil » pour en réactiver.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleKinds}
                strategy={rectSortingStrategy}
                disabled={!isEditing}
              >
                <div
                  className={cn(
                    'grid gap-3.5',
                    WIDGET_COLUMNS === 2 ? 'sm:grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  {dashboard.placements.map((placement) => (
                    <SortableWidget
                      key={placement.kind}
                      kind={placement.kind}
                      isEditing={isEditing}
                      onHide={() => void dashboard.setWidgetOrder(toggleWidget(dashboard.widgets, placement.kind))}
                      dashboard={dashboard}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <section className="mt-[34px]">
            <SectionHeading
              title="Tout le foyer"
              description="Un espace pour chaque petite et grande organisation."
              action={<CountBadge value={modules.filter((entry) => entry.tile).length} label="espaces" />}
            />
            <ul
              aria-label="Espaces du foyer"
              className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-[1180px]:grid-cols-3 max-[650px]:grid-cols-1"
            >
              {modules
                .filter((entry) => entry.tile)
                .map((entry) => (
                  <li key={entry.key} className="min-w-0">
                    <ModuleTile entry={entry} />
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-3.5 max-[920px]:grid-cols-2 max-[650px]:grid-cols-1">
          <BoardSummaryCard
            total={dashboard.board.total}
            monthLabel={dashboard.board.monthLabel}
            balances={dashboard.board.members}
          />
          <ActivityCard entries={dashboard.activity} />
          <BirthdayPreview
            birthdays={dashboard.upcomingBirthdays}
            onOpen={() => navigate('/anniversaires')}
          />
          <ShoppingCard shopping={dashboard.nextShopping} />
        </aside>
      </div>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">À faire</p>
            <DialogTitle>Ajouter une tâche</DialogTitle>
            <DialogDescription>
              Une échéance claire, un responsable, et c’est tout. Le formulaire complet reste dans le module À faire.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3.5" noValidate>
            <Field label="Nom de la tâche" error={errors.name?.message}>
              {(props) => <Input placeholder="Ex. Choisir le menu du week-end" {...props} {...register('name')} />}
            </Field>
            <Field label="Échéance" error={errors.dueDate?.message}>
              {(props) => <Input type="date" {...props} {...register('dueDate')} />}
            </Field>
            <Field label="Assigner à" error={errors.assignee?.message}>
              {(props) => (
                <Select {...props} {...register('assignee')}>
                  <option value="">Choisir un membre</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setTaskDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" icon="arrow">
                Continuer
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SortableWidget({
  kind,
  isEditing,
  onHide,
  dashboard,
}: {
  kind: WidgetKind;
  isEditing: boolean;
  onHide: () => void;
  dashboard: ReturnType<typeof useDashboard>;
}) {
  const placement = dashboard.placements.find((entry) => entry.kind === kind)!;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: kind,
    disabled: !isEditing,
  });

  const dragHandleProps = isEditing
    ? { ...attributes, ...listeners, ref: setActivatorNodeRef as unknown as React.Ref<HTMLButtonElement> }
    : undefined;

  const common = {
    placement,
    isEditing,
    dragHandleProps: dragHandleProps
      ? { ...attributes, ...listeners, 'aria-label': `Réordonner : ${kind}` } as React.ButtonHTMLAttributes<HTMLButtonElement>
      : undefined,
    onHide,
  };

  const body = () => {
    if (kind === 'calendrier') {
      return <CalendarWidget {...common} events={dashboard.events} holidays={dashboard.holidays} />;
    }
    if (kind === 'taches') {
      return (
        <TasksWidget
          {...common}
          tasks={dashboard.openTasks}
          onToggleTask={(task: TaskRow) => void dashboard.toggleTask(task)}
          isUpdating={dashboard.isUpdatingTask}
        />
      );
    }
    if (kind === 'meteo') return <WeatherWidget {...common} city={dashboard.city} />;
    if (kind === 'anniversaires') return <BirthdaysWidget {...common} birthdays={dashboard.upcomingBirthdays} />;
    return <RoutinesWidget {...common} progress={dashboard.routineProgress} />;
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('min-w-0', isDragging && 'relative z-10 opacity-55')}
      data-widget={kind}
    >
      {body()}
    </div>
  );
}

function BirthdayPreview({
  birthdays,
  onOpen,
}: {
  birthdays: { row: { id: string; name: string; birth_date: string }; daysUntil: number }[];
  onOpen: () => void;
}) {
  return (
    <section className="side-card panel-surface rounded-[16px] p-[17px]">
      <div className="mb-3 flex items-start justify-between gap-2.5">
        <div>
          <h3 className="mb-1 font-display text-base tracking-[-0.035em]">Anniversaires</h3>
          <p className="m-0 text-xs text-muted">Les prochains du foyer.</p>
        </div>
        <Button size="sm" variant="quiet" onClick={onOpen} iconEnd="arrow">
          Voir
        </Button>
      </div>
      {birthdays.length === 0 ? (
        <p className="text-xs text-muted">Aucun anniversaire suivi.</p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {birthdays.slice(0, 3).map(({ row, daysUntil }) => (
            <li key={row.id} className="flex items-center justify-between gap-2 border-t border-border py-[10px] text-[12px] first-of-type:border-t-0 first-of-type:pt-0">
              <span className="truncate">{row.name}</span>
              <strong className="shrink-0 text-accent-strong">
                {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? 'Demain' : `Dans ${daysUntil} jours`}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
