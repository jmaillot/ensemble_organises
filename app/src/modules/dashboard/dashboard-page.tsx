import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
import { Button } from '@/components/ui/button';
import { CountBadge, SectionHeading } from '@/components/shared/module-shell';
import { AppTile } from '@/components/shared/app-tile';
import { useCurrentMember, useDisabledModules, useHouseholdStore } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import { filterModuleEntries, modules } from '@/lib/modules';
import type { TaskRow } from '@/types';
import { cn } from '@/lib/utils';
import { useDashboard } from './hooks/use-dashboard';
import type { TodayItem } from './hooks/use-dashboard';
import { useWeather } from './hooks/use-weather';
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
import { firstName, formatDashboardEyebrow, formatNextEventDay, formatNextEventWhen } from './types';
import { eventWallTime } from '@/lib/utils';
import { reorderPreferences, resetPreferences, toggleWidget, type WidgetKind } from './types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useSessionUser();
  const householdName = useHouseholdStore((state) => state.householdName);
  const [isEditing, setIsEditing] = useState(false);
  const dashboard = useDashboard();
  // Rôle `enfant` (phase 14, D-05 + relais 14-01) : les tuiles des 5 modules
  // hors périmètre disparaissent, et la colonne latérale qui lit les dépenses
  // (totaux Ardoise, activité) avec elles — présentation seulement, le
  // serveur renvoie de toute façon 0 ligne à un enfant.
  const isChild = useCurrentMember()?.role === 'enfant';
  // Menu des applications (0140) : les espaces éteints par le foyer sortent
  // de la grille des tuiles — même signal que le masquage enfant (D-05).
  const disabledModules = useDisabledModules();
  const visibleTiles = filterModuleEntries(
    modules.filter((entry) => entry.tile),
    { isChild, disabledModules },
  );

  // Souris : déplacement immédiat. Tactile : appui long (le défilement
  // garde la priorité sur un toucher bref) ; `touch-action: none` sur les
  // poignées empêche le navigateur de voler le geste une fois le délai passé.
  // Clavier : inchangé, via les poignées focusables.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleKinds = useMemo(() => dashboard.placements.map((placement) => placement.kind), [dashboard.placements]);
  // `??` ne rattrape pas une chaîne vide : un displayName vidé (profil sans
  // nom, session persistée) affichait « Bonjour  ». Le repli est neutre —
  // aucun prénom codé en dur, la salutation s'arrête au « Bonjour » (audit
  // du 24/10/2026).
  const displayName = user?.displayName?.trim() ?? '';
  // Pendant un drag, le curseur passe en « main fermée » sur toute la grille :
  // au tactile la carte soulevée suffit, à la souris il faut le curseur.
  const [draggingKind, setDraggingKind] = useState<WidgetKind | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingKind(event.active.id as WidgetKind);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingKind(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = active.id as WidgetKind;
    const to = over.id as WidgetKind;
    void dashboard.setWidgetOrder(reorderPreferences(dashboard.widgets, from, to));
  };

  const openTasks = dashboard.openTasks;
  const nextEvent = dashboard.nextEvent;
  const nextEventDay = nextEvent ? formatNextEventDay(nextEvent) : null;
  // Le point du jour mélange deux natures : les tâches (retards, échéances)
  // et les événements (horaires). Deux colonnes plutôt qu'une liste unique.
  const todayTasks = dashboard.todayItems.filter((item) => item.kind !== 'evenement');
  const todayEvents = dashboard.todayItems.filter((item) => item.kind === 'evenement');
  const todayGroups = [
    { title: 'Tâches', listLabel: 'Tâches du jour', items: todayTasks },
    { title: 'Événements', listLabel: 'Événements du jour', items: todayEvents },
  ].filter((group) => group.items.length > 0);

  return (
    <section className="mx-auto w-[min(1480px,100%)]" data-module="accueil">
      <header className="mb-6 flex items-end justify-between gap-6 max-[650px]:block">
        <div>
          <p className="eyebrow mb-2">{formatDashboardEyebrow(new Date(), householdName)}</p>
          <h1 className="mb-2 text-[clamp(34px,4.2vw,54px)] leading-[1.02]">
            {displayName ? `Bonjour ${firstName(displayName)}` : 'Bonjour'}
            <span className="text-coral">.</span>
          </h1>
          <p className="lede mb-0 text-[15px]">
            Voici ce qui mérite votre attention aujourd’hui, sans perdre de vue ce qui compte.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 max-[650px]:mt-4 max-[650px]:justify-start">
          {/* L'accueil n'a pas de ModuleShell : son bouton de mode d'emploi
              est posé ici, avec le même libellé et la même icône que
              partout ailleurs. */}
          <Button
            variant="secondary"
            size="icon"
            icon="info"
            aria-label="Comment ça marche"
            onClick={() => navigate('/accueil/aide')}
          />
          <Button
            variant="secondary"
            icon="grid"
            onClick={() => setIsEditing((value) => !value)}
            aria-pressed={isEditing}
          >
            {isEditing ? 'Terminer la personnalisation' : 'Personnaliser l’accueil'}
          </Button>
        </div>
      </header>

      {/* Le héro de l'accueil est la seule surface pleine sapin de la page
          (hero-surface, réservé aux cartes héro) : c'est le geste d'ouverture
          de melimelo — l'écran s'ouvre sur l'encre profonde — et il était
          resté au benchmark (critique UI 2026-10-23). L'accent de titre
          reprend sa grammaire : une finale en Fraunces italique beurre. */}
      {/* Marge du héro resserrée (31→24px) : la grille « Tout le foyer »
          doit entrer dans le premier écran (audit du 24/10/2026). */}
      <section className="hero-surface pulse-banner relative mb-6 flex items-center justify-between gap-[26px] overflow-hidden rounded-[22px] p-[22px] text-surface max-[650px]:block max-[650px]:p-[18px]">
        <span aria-hidden="true" className="pulse-ring" />
        <div className="relative z-1">
          <p className="eyebrow mb-1.5 text-on-dark">Le point du jour</p>
          <h2 className="mb-1.5 text-xl tracking-[-0.02em]">
            {openTasks.length === 0 ? (
              <>
                Le foyer est à jour,{' '}
                <em className="font-display font-medium italic text-butter">profitez-en.</em>
              </>
            ) : dashboard.todayItems.length > 0 ? (
              <>
                {dashboard.todayItems.length} point{dashboard.todayItems.length > 1 ? 's' : ''},{' '}
                <em className="font-display font-medium italic text-butter">à garder en tête.</em>
              </>
            ) : (
              <>
                {openTasks.length} tâche{openTasks.length > 1 ? 's' : ''}{' '}
                <em className="font-display font-medium italic text-butter">en attente.</em>
              </>
            )}
          </h2>
          {dashboard.todayItems.length === 0 ? (
            // La phrase « Les courses sont presque prêtes » était posée en dur :
            // elle affirmait un état des listes que ce résumé ne lit pas — sur un
            // foyer vide, elle mentait dès la première ouverture (critique UI
            // 2026-10-23, P1 ; même règle que AGENTS.md §2.7 I : une absence
            // affirmée est une affirmation). Le résumé ne dit plus que ce qu'il
            // lit vraiment : les échéances et le prochain rendez-vous.
            <p className="m-0 text-[13px] text-on-dark">
              {nextEvent
                ? `Prochain rendez-vous : ${nextEvent.title}, ${formatNextEventWhen(nextEvent)}.`
                : 'Aucune échéance aujourd’hui : la journée est à vous.'}
            </p>
          ) : (
            <div className={cn('grid gap-4', todayGroups.length > 1 && 'min-[650px]:grid-cols-2')}>
              {todayGroups.map((group) => (
                <TodayGroup key={group.listLabel} title={group.title} listLabel={group.listLabel} items={group.items} />
              ))}
            </div>
          )}
        </div>
        <div className="relative z-1 mt-0 min-w-[132px] border-l-0 border-t border-white/25 pt-3.5 pl-0 min-[650px]:mt-0 min-[650px]:border-t-0 min-[650px]:border-l min-[650px]:pt-0 min-[650px]:pl-5">
          <span className="block text-[11px] text-on-dark">Prochain rendez-vous</span>
          <strong className="my-0.5 block font-display text-[25px] tracking-[-0.04em]">
            {nextEvent
              ? nextEvent.all_day
                ? 'Journée'
                : eventWallTime(nextEvent.start_at)
              : '—'}
          </strong>
          <small className="text-[11px] text-on-dark">
            {nextEvent ? `${nextEvent.title}${nextEventDay ? ` · ${nextEventDay}` : ''}` : 'Rien de planifié'}
          </small>
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
            /* L'instruction de glisser ne se lit pas sur une grille à peine
               peuplée : elle décrit un geste qu'on n'a pas encore de raison de
               faire (critique UI 2026-10-23, persona Marie). */
            description={
              dashboard.placements.length > 1 ? 'Glissez les poignées pour réorganiser (appui long sur mobile).' : undefined
            }
            action={<CountBadge value={dashboard.placements.length} label="widgets affichés" />}
          />

          {dashboard.placements.length === 0 ? (
            <p className="panel-surface mb-7 rounded-[20px] p-[19px] text-xs text-muted">
              Tous les widgets sont masqués. Utilisez « Personnaliser l’accueil » pour en réactiver.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToParentElement]}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setDraggingKind(null)}
            >
              <SortableContext
                items={visibleKinds}
                strategy={rectSortingStrategy}
              >
                <div
                  className={cn(
                    'grid gap-3.5',
                    WIDGET_COLUMNS === 2 ? 'sm:grid-cols-2' : 'grid-cols-1',
                    draggingKind !== null && 'widgets-dragging',
                  )}
                >
                  {dashboard.placements.map((placement) => (
                    <SortableWidget
                      key={placement.kind}
                      kind={placement.kind}
                      isEditing={isEditing}
                      dashboard={dashboard}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <section className="mt-7">
            <SectionHeading
              title="Tout le foyer"
              description="Un espace pour chaque petite et grande organisation."
              action={<CountBadge value={visibleTiles.length} label="espaces" />}
            />
            <ul
              aria-label="Espaces du foyer"
              className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-[1180px]:grid-cols-3 max-[650px]:grid-cols-3 max-[650px]:gap-2.5"
            >
              {visibleTiles
                .map((entry) => (
                  <li key={entry.key} className="min-w-0">
                    <AppTile
                      label={entry.label}
                      tint={entry.tint}
                      module={entry.key}
                      to={`/${entry.key}`}
                      counter={dashboard.tileCounters[entry.key]}
                    />
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-3.5 max-[920px]:grid-cols-2 max-[650px]:grid-cols-1">
          {isChild ? null : (
            <>
              <BoardSummaryCard
                total={dashboard.board.total}
                monthLabel={dashboard.board.monthLabel}
                balances={dashboard.board.members}
              />
              <ActivityCard entries={dashboard.activity} />
            </>
          )}
          <BirthdayPreview
            birthdays={dashboard.upcomingBirthdays}
            onOpen={() => navigate('/anniversaires')}
          />
          <ShoppingCard shopping={dashboard.nextShopping} />
        </aside>
      </div>
    </section>
  );
}

function SortableWidget({
  kind,
  isEditing,
  dashboard,
}: {
  kind: WidgetKind;
  isEditing: boolean;
  dashboard: ReturnType<typeof useDashboard>;
}) {
  const placement = dashboard.placements.find((entry) => entry.kind === kind)!;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: kind,
  });

  // Poignées permanentes : le drag est possible en place, sans mode édition.
  const common = {
    placement,
    isEditing,
    dragHandleProps: {
      ...attributes,
      ...listeners,
      ref: setActivatorNodeRef as unknown as React.Ref<HTMLButtonElement>,
      'aria-label': `Réordonner : ${kind}`,
    } as React.ButtonHTMLAttributes<HTMLButtonElement>,
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
    if (kind === 'meteo') return <MeteoSlot {...common} city={dashboard.city} />;
    if (kind === 'anniversaires') return <BirthdaysWidget {...common} birthdays={dashboard.upcomingBirthdays} />;
    return <RoutinesWidget {...common} progress={dashboard.routineProgress} />;
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('min-w-0', isDragging && 'relative z-10 cursor-grabbing opacity-55')}
      data-widget={kind}
    >
      {body()}
    </div>
  );
}

/** Conteneur météo : le hook vit dans un composant, jamais dans `body()`. */
function MeteoSlot({
  placement,
  isEditing,
  dragHandleProps,
  city,
}: {
  placement: React.ComponentProps<typeof WeatherWidget>['placement'];
  isEditing: boolean;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  city: string;
}) {
  const weather = useWeather(city);
  return <WeatherWidget placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} city={city} weather={weather} />;
}

/** Colonne du point du jour : tâches ou événements, 5 lignes max puis le reste. */
const TODAY_GROUP_LIMIT = 5;

function TodayGroup({ title, listLabel, items }: { title: string; listLabel: string; items: TodayItem[] }) {
  const visible = items.slice(0, TODAY_GROUP_LIMIT);
  const extra = items.length - visible.length;
  return (
    <div className="min-w-0">
      {/* Toutes les teintes sont « sur sapin » : le groupe ne vit que dans la
          carte héro du point du jour — les jetons d'encre (muted, ink-soft,
          fg) y étaient quasi invisibles, encre sombre sur fond sombre
          (retour du 23 octobre). on-dark mesure 5,59:1, surface 11,1:1. */}
      <h3 className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-on-dark uppercase">{title}</h3>
      <ul className="m-0 grid min-w-0 list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0" aria-label={listLabel}>
        {visible.map((item) => (
          <li key={item.id} className="flex min-w-0 items-baseline gap-2 text-[13px] text-on-dark">
            <span className="shrink-0 font-extrabold text-surface tabular-nums">{item.time ?? '•'}</span>
            <span className="line-clamp-2 min-w-0 min-[651px]:line-clamp-1">
              <strong className="font-semibold text-surface">{item.title}</strong>
              {item.detail ? <span> · {item.detail}</span> : null}
            </span>
          </li>
        ))}
        {extra > 0 ? (
          <li className="text-[12px] text-on-dark">…et {extra} autre{extra > 1 ? 's' : ''}.</li>
        ) : null}
      </ul>
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
    <section className="side-card panel-surface rounded-[22px] p-[18px]">
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
