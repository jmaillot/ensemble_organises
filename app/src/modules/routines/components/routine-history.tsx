import { Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/primitives';
import { LoadingRows } from '@/components/ui/empty-state';
import { cn, formatMediumDate, relativeDayLabel } from '@/lib/utils';
import {
  historyPeriods,
  memberFirstName,
  occurrenceLabels,
  occurrenceTones,
  type DayStatusMap,
  type HistoryEntry,
  type HistoryPeriod,
  type OccurrenceState,
} from '../types';

const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Couleur de la pastille d'un jour, dans l'ordre de l'export. */
const dayDotClass: Record<OccurrenceState, string> = {
  fait: 'bg-accent',
  en_retard: 'bg-coral',
  manque: 'bg-amber',
  a_venir: 'bg-border',
};

export interface GridDay {
  iso: string;
  number: number;
  isOutside: boolean;
}

export interface RoutineHistoryProps {
  entries: HistoryEntry[];
  period: HistoryPeriod;
  onPeriodChange: (period: HistoryPeriod) => void;
  isLoading?: boolean;
  onDeleteOccurrence: (entry: HistoryEntry) => void;
}

const subtitle = (entry: HistoryEntry) => {
  const day = relativeDayLabel(entry.date);
  return entry.authorName ? `${day} · par ${memberFirstName(entry.authorName)}` : day;
};

/** Historique du foyer : dernières occurrences, retards et prochaines échéances. */
export function RoutineHistory({ entries, period, onPeriodChange, isLoading = false, onDeleteOccurrence }: RoutineHistoryProps) {
  const past = entries.filter((entry) => entry.state !== 'a_venir');
  const upcoming = entries.filter((entry) => entry.state === 'a_venir');

  return (
    <Panel
      id="routine-history-panel"
      title="Historique"
      description="Les traces du foyer."
      action={
        <Select
          aria-label="Filtrer l’historique"
          className="w-auto min-w-[170px]"
          value={period}
          onChange={(event) => onPeriodChange(Number(event.target.value) as HistoryPeriod)}
        >
          {historyPeriods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      }
    >
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : entries.length === 0 ? (
        <p className="m-0 text-xs text-muted">
          Aucune occurrence sur la période. Les séries se construisent avec les petits gestes répétés.
        </p>
      ) : (
        <>
          <div role="list" aria-label="Historique des occurrences" className="scrollbar-slim grid max-h-[380px] overflow-y-auto">
            {past.map((entry) => (
              <div
                key={entry.key}
                role="listitem"
                className="flex min-w-0 items-center justify-between gap-2 border-t border-border py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-[12px]">{entry.routineName}</strong>
                  <small className="block text-[10px] text-muted">{subtitle(entry)}</small>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={occurrenceTones[entry.state]}>{occurrenceLabels[entry.state]}</Badge>
                  {entry.canDelete ? (
                    <button
                      type="button"
                      onClick={() => onDeleteOccurrence(entry)}
                      aria-label={`Supprimer l’occurrence de ${entry.routineName} du ${formatMediumDate(entry.date)}`}
                      className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {upcoming.length > 0 ? (
              <div className="border-t border-border pt-2.5">
                <p className="mb-1 text-[10px] font-extrabold tracking-[0.12em] text-muted uppercase">À venir</p>
                {upcoming.map((entry) => (
                  <div
                    key={entry.key}
                    role="listitem"
                    className="flex min-w-0 items-center justify-between gap-2 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-[12px]">{entry.routineName}</strong>
                      <small className="block text-[10px] text-muted">{subtitle(entry)}</small>
                    </div>
                    <Badge tone={occurrenceTones[entry.state]}>{occurrenceLabels[entry.state]}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <p className="mt-3 mb-0 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted">
            <span>
              <strong className="text-fg">{past.length}</strong> occurrence{past.length > 1 ? 's' : ''} sur les{' '}
              {period} derniers jours
            </span>
            <span>{upcoming.length} à venir</span>
          </p>
        </>
      )}
    </Panel>
  );
}

export interface HistoryCalendarProps {
  days: readonly GridDay[];
  monthLabel: string;
  today: string;
  statuses: DayStatusMap;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

/**
 * Carte mensuelle de l'historique : une pastille par jour, couleur selon l'état
 * dominant des occurrences du jour. Lecture seule, donc pas de case cliquable.
 */
export function HistoryCalendar({ days, monthLabel, today, statuses, onPrevious, onNext, onToday }: HistoryCalendarProps) {
  return (
    <section className="panel-surface min-w-0 rounded-[16px] p-[22px]" aria-label="Calendrier de l’historique">
      <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-2.5">
        <h3 className="mb-0 min-w-0 font-display text-[21px] tracking-[-0.035em]">{monthLabel}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="quiet" size="sm" onClick={onToday} icon="calendar" className="max-[420px]:hidden">
            Aujourd’hui
          </Button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Mois précédent de l’historique"
              className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrowLeft" size="sm" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Mois suivant de l’historique"
              className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrow" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-7 gap-[7px]" role="group" aria-label={`Jours de ${monthLabel}`}>
        {DAY_NAMES.map((name, index) => (
          <div
            key={`${name}-${index}`}
            aria-hidden="true"
            className="grid min-h-7 place-items-center text-[10px] font-extrabold tracking-wide text-muted uppercase"
          >
            {name}
          </div>
        ))}

        {days.map((day) => {
          const status = statuses[day.iso];
          const isToday = day.iso === today;
          return (
            <div
              key={day.iso}
              data-state={status?.state ?? 'aucune'}
              className={cn(
                'relative grid min-h-[54px] place-items-center rounded-[10px] border border-transparent px-2 py-2 text-[12px] text-ink-soft',
                day.isOutside && 'text-muted/60',
                isToday && 'bg-accent-strong font-extrabold text-surface',
              )}
            >
              <span aria-hidden="true">{day.number}</span>
              {status ? (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute bottom-[7px] left-1/2 size-[6px] -translate-x-1/2 rounded-full',
                      dayDotClass[status.state],
                    )}
                  />
                  <span className="sr-only">
                    {`${formatMediumDate(day.iso)} : ${status.count} occurrence${status.count > 1 ? 's' : ''}, ${occurrenceLabels[status.state]}`}
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-accent" />
          Terminée
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-coral" />
          En retard
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-amber" />
          Manquée
        </span>
      </div>
    </section>
  );
}
