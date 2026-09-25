import { Icon, type IconName } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Checkbox } from '@/components/ui/primitives';
import { Progress } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatEuro, initials, relativeDayLabel, toLocalDate } from '@/lib/utils';
import type { BirthdayRow, EventRow, TaskRow } from '@/types';
import { priorityFromRank } from '@/modules/taches/types';
import { PriorityTag } from '@/components/shared/module-shell';
import type { FrenchHoliday } from '@/hooks/use-french-holidays';
import { WIDGET_COLUMNS, WEEKDAY_INITIALS, buildMiniCalendar, type WidgetPlacement } from '../types';

export interface WidgetCardProps {
  placement: WidgetPlacement;
  isEditing: boolean;
  children: React.ReactNode;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onHide?: () => void;
}

/** En-tête commun des widgets : libellé, icône, poignée et menu. */
export function WidgetCard({ placement, isEditing, onHide, dragHandleProps, children }: WidgetCardProps) {
  const labels: Record<WidgetPlacement['kind'], { label: string; icon: IconName }> = {
    calendrier: { label: 'Calendrier', icon: 'calendar' },
    taches: { label: 'Tâches', icon: 'checkCircle' },
    meteo: { label: 'Météo', icon: 'sun' },
    anniversaires: { label: 'Anniversaires', icon: 'heart' },
    routines: { label: 'Routines', icon: 'wand' },
  };
  const { label, icon } = labels[placement.kind];
  return (
    <article
      className={cn(
        'widget-shell panel-surface relative min-h-[190px] overflow-hidden rounded-[16px] p-[18px]',
        isEditing && 'cursor-grab ring-2 ring-accent/40',
        placement.width === 2 && 'sm:col-span-2',
      )}
      aria-label={`Widget ${label}`}
    >
      <div className="mb-4 flex items-start justify-between gap-2.5">
        <span className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.09em] text-muted uppercase">
          <Icon name={icon} size="sm" className="text-accent-strong" />
          {label}
        </span>
        {isEditing ? (
          <button
            type="button"
            {...dragHandleProps}
            className="grid size-8 shrink-0 cursor-grab place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
            aria-label={`Réordonner : ${label}`}
          >
            <Icon name="drag" size="sm" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onHide}
            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
            aria-label={`Masquer le widget ${label}`}
          >
            <Icon name="more" size="sm" />
          </button>
        )}
      </div>
      {children}
    </article>
  );
}

/** Base commune aux widgets : la carte elle-même fournit le `children`. */
type WidgetBase = Omit<WidgetCardProps, 'children'>;

export function CalendarWidget({
  placement,
  isEditing,
  events,
  holidays,
  dragHandleProps,
  onHide,
}: WidgetBase & { events: EventRow[]; holidays: FrenchHoliday[] }) {
  const cursor = new Date();
  const eventDates = new Set(events.map((event) => toLocalDate(event.start_at).toISOString().slice(0, 10)));
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const { days, monthLabel } = buildMiniCalendar(cursor, eventDates, holidayDates);
  return (
    <WidgetCard placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} onHide={onHide}>
      <p className="mb-2.5 text-[11px] font-semibold text-muted capitalize">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-[5px]">
        {WEEKDAY_INITIALS.map((day, index) => (
          <span key={`${day}-${index}`} className="grid min-h-[27px] place-items-center text-[9px] font-extrabold text-muted" aria-hidden="true">
            {day}
          </span>
        ))}
        {days.map((day) => (
          <span
            key={day.iso}
            className={cn(
              'relative grid min-h-[27px] place-items-center rounded-[8px] text-[11px] text-muted',
              day.isOutside && 'opacity-40',
              (day.hasEvent || day.isHoliday) && 'font-bold text-fg after:absolute after:bottom-[3px] after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-coral',
              day.isHoliday && 'after:bg-amber',
              day.isToday && 'bg-accent-strong font-extrabold text-surface after:bg-surface',
            )}
            title={day.iso}
          >
            {day.number}
          </span>
        ))}
      </div>
    </WidgetCard>
  );
}

export function TasksWidget({
  placement,
  isEditing,
  tasks,
  onToggleTask,
  isUpdating,
  dragHandleProps,
  onHide,
}: WidgetBase & { tasks: TaskRow[]; onToggleTask: (task: TaskRow) => void; isUpdating: boolean }) {
  return (
    <WidgetCard placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} onHide={onHide}>
      {tasks.length === 0 ? (
        <div className="grid place-items-center py-4 text-center">
          <p className="mb-3 text-xs text-muted">Aucune tâche à faire. Le foyer est à jour.</p>
          <Skeleton className="h-1 w-full" />
        </div>
      ) : (
        <div className="grid gap-[11px]">
          {tasks.slice(0, 3).map((task, index) => {
            const priority = priorityFromRank(index, tasks.length);
            return (
            <div key={task.id} className="grid grid-cols-[19px_minmax(0,1fr)_auto] items-center gap-2">
              <Checkbox
                checked={false}
                disabled={isUpdating}
                onCheckedChange={() => onToggleTask(task)}
                aria-label={`Terminer : ${task.name}`}
                className="size-[19px]"
              />
              <div className="min-w-0">
                <strong className="block truncate text-[12px] font-bold">{task.name}</strong>
                <small className="block truncate text-[10px] text-muted">
                  {task.due_date ? relativeDayLabel(task.due_date) : 'Sans échéance'}
                </small>
              </div>
              {priority === 'haute' ? <PriorityTag priority="haute" /> : null}
            </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

export function WeatherWidget({
  placement,
  isEditing,
  city,
  dragHandleProps,
  onHide,
}: WidgetBase & { city: string }) {
  return (
    <WidgetCard placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} onHide={onHide}>
      <div className="mt-1 flex items-center gap-3">
        <span className="grid size-[43px] shrink-0 place-items-center rounded-[15px] bg-amber-soft text-amber">
          <Icon name="sun" size="lg" />
        </span>
        <div>
          <strong className="block font-display text-[22px] tracking-[-0.04em]">18°</strong>
          <span className="block text-[11px] text-muted">Ensoleillé · {city}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Ville du profil · {city}. <span className="text-[11px] text-muted/80">Données de démonstration : la météo en direct arrive avec le service météo.</span>
      </p>
    </WidgetCard>
  );
}

export function BirthdaysWidget({
  placement,
  isEditing,
  birthdays,
  dragHandleProps,
  onHide,
}: WidgetBase & { birthdays: { row: BirthdayRow; daysUntil: number }[] }) {
  const next = birthdays[0];
  return (
    <WidgetCard placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} onHide={onHide}>
      {birthdays.length === 0 ? (
        <p className="text-xs text-muted">Aucun anniversaire suivi pour l'instant.</p>
      ) : (
        <>
          {birthdays.slice(0, 2).map(({ row }) => (
            <div key={row.id} className="mt-3 flex items-center gap-2.5 first:mt-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-fg text-[10px] font-extrabold text-surface">
                {initials(row.name)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[12px]">{row.name}</strong>
                <small className="block truncate text-[10px] text-muted">{formatBirthdayDate(row.birth_date)}</small>
              </div>
            </div>
          ))}
          {next ? (
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
              <span>Prochain dans {next.daysUntil} jours</span>
              <strong className="text-fg">{formatBirthdayDate(next.row.birth_date)}</strong>
            </div>
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}

export function formatBirthdayDate(birthDate: string) {
  const [month, day] = birthDate.split('-').slice(1).map(Number);
  return `${String(day).padStart(2, '0')} ${new Intl.DateTimeFormat('fr-FR', { month: 'short' })
    .format(new Date(2000, month - 1, 1))
    .replace('.', '')}`;
}

export function RoutinesWidget({
  placement,
  isEditing,
  progress,
  dragHandleProps,
  onHide,
}: WidgetBase & { progress: { done: number; total: number; nextLabel: string; ratio: number } }) {
  return (
    <WidgetCard placement={placement} isEditing={isEditing} dragHandleProps={dragHandleProps} onHide={onHide}>
      <strong className="block font-display text-[30px] leading-none tracking-[-0.05em]">
        {progress.done} / {progress.total}
      </strong>
      <p className="mt-1.5 text-xs text-muted">rituels suivis aujourd’hui</p>
      <Progress value={progress.ratio} label="Rituels suivis aujourd’hui" />
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">Prochain : {progress.nextLabel}</span>
        <strong className="shrink-0 text-fg">{progress.total === 0 ? '—' : `${progress.ratio}%`}</strong>
      </div>
    </WidgetCard>
  );
}

export function BoardSummaryCard({ total, monthLabel, balances }: { total: number; monthLabel: string; balances: { memberId: string; displayName: string; amount: number }[] }) {
  const positives = balances.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const totalAbs = balances.reduce((sum, entry) => sum + Math.abs(entry.amount), 0) || 1;
  const segments = balances.slice(0, 3).map((entry) => Math.abs(entry.amount));
  const scale = segments.reduce((sum, value) => sum + value, 0) || 1;
  return (
    <section className="side-card panel-surface rounded-[16px] p-[17px]">
      <div className="mb-3 flex items-start justify-between gap-2.5">
        <div>
          <p className="eyebrow mb-1">Ardoise · {monthLabel}</p>
          <strong className="block font-display text-[32px] leading-none tracking-[-0.06em]">{formatEuro(total)}</strong>
          <span className="text-[11px] text-muted">dépenses du foyer</span>
        </div>
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-[12px] bg-accent-soft text-accent-strong">
          <Icon name="wallet" size="sm" />
        </span>
      </div>
      <div className="my-4 flex h-3 overflow-hidden rounded-full bg-accent-faint" role="img" aria-label={`Dont ${formatEuro(positives)} à rembourser`}>
        {segments.map((value, index) => (
          <span
            key={index}
            className={index === 0 ? 'bg-accent' : index === 1 ? 'bg-fg' : 'bg-coral'}
            style={{ width: `${(value / scale) * 100}%` }}
          />
        ))}
      </div>
      {balances.map((entry) => (
        <div key={entry.memberId} className="flex items-center justify-between gap-2 border-t border-border py-[7px] text-[12px] first-of-type:border-t-0">
          <span className="flex min-w-0 items-center gap-2">
            <MemberAvatar name={entry.displayName} size="sm" />
            <span className="truncate">{entry.displayName}</span>
          </span>
          <strong className={entry.amount >= 0 ? 'text-accent-strong' : 'text-coral'}>
            {entry.amount >= 0 ? '+' : '−'}
            {formatEuro(Math.abs(entry.amount))}
          </strong>
        </div>
      ))}
      <p className="mt-2 text-[10px] text-muted">
        Réparties automatiquement. Détail dans <strong className="font-semibold text-fg">l'Ardoise</strong> ({Math.round((totalAbs / 2) * 100) / 100} € en jeu).
      </p>
    </section>
  );
}

export function ActivityCard({ entries }: { entries: { id: string; actor: string; kind: string; text: string }[] }) {
  const icons: Record<string, IconName> = {
    tache: 'checkCircle',
    evenement: 'calendar',
    depense: 'wallet',
    publication: 'people',
    anniversaire: 'gift',
  };
  return (
    <section className="side-card panel-surface rounded-[16px] p-[17px]">
      <h3 className="mb-1 font-display text-base tracking-[-0.035em]">Activité du foyer</h3>
      <p className="mb-3.5 text-xs text-muted">Les dernières contributions de chacun.</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">Rien de neuf pour le moment.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {entries.map((entry) => (
            <li key={entry.id} className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5">
              <span className="grid size-[30px] place-items-center rounded-[10px] bg-accent-faint text-accent-strong">
                <Icon name={icons[entry.kind] ?? 'info'} size="sm" />
              </span>
              <div className="min-w-0">
                <strong className="block text-[12px]">
                  {entry.actor} <span className="font-normal text-muted">{entry.text}</span>
                </strong>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShoppingCard({ shopping }: { shopping: { title: string; relative: string } | null }) {
  return (
    <section className="coupon-card relative min-h-[150px] overflow-hidden rounded-[16px] bg-fg p-[18px] text-surface">
      <span aria-hidden="true" className="coupon-ring" />
      <p className="mb-4 text-[11px] text-on-dark">
        {shopping ? 'Prochaine course' : 'Courses'}
      </p>
      <strong className="block font-display text-[27px] tracking-[-0.06em]">
        {shopping ? shopping.relative : 'à planifier'}
      </strong>
      <small className="text-[10px] text-on-dark">{shopping?.title ?? 'Aucune course prévue au calendrier.'}</small>
    </section>
  );
}

export function CustomizePanel({
  preferences,
  onToggle,
  onReset,
  onClose,
}: {
  preferences: { kind: string; visible: boolean }[];
  onToggle: (kind: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const labels: Record<string, string> = {
    calendrier: 'Calendrier',
    taches: 'Tâches',
    meteo: 'Météo',
    anniversaires: 'Anniversaires',
    routines: 'Routines',
  };
  return (
    <section className="panel-surface rounded-[16px] p-4" aria-label="Personnalisation des widgets">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="mb-0.5 font-display text-base tracking-[-0.03em]">Personnaliser l’accueil</h2>
          <p className="m-0 text-[11px] text-muted">Glissez les widgets pour les réorganiser, masquez ceux dont vous n’avez pas besoin.</p>
        </div>
        <Button size="sm" variant="quiet" onClick={onClose} icon="close">
          Terminer
        </Button>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {preferences.map((preference) => (
          <li key={preference.kind} className="flex min-h-[47px] items-center gap-2.5 rounded-[11px] border border-border bg-bg px-3">
            <Icon name="drag" size="sm" className="shrink-0 text-muted" />
            <label className="flex-1 text-[12px] font-bold">{labels[preference.kind] ?? preference.kind}</label>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onToggle(preference.kind)}
              icon={preference.visible ? 'check' : 'plus'}
            >
              {preference.visible ? 'Visible' : 'Masqué'}
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" className="mt-3" icon="refresh" onClick={onReset}>
        Réinitialiser l’ordre
      </Button>
    </section>
  );
}

export { WIDGET_COLUMNS };
