import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { memberTagClass } from '@/components/shared/member-avatar';
import { Button } from '@/components/ui/button';
import { dayButtonLabel } from '../types';
import type { DayMarkerMap } from '../types';

/** En-têtes de colonnes, lundi en premier (convention française). */
const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const LONG_PRESS_MS = 700;

export interface GridDay {
  iso: string;
  number: number;
  isOutside: boolean;
}

export interface CalendarGridProps {
  days: readonly GridDay[];
  monthLabel: string;
  selected: string;
  today: string;
  markers: DayMarkerMap;
  onSelect: (iso: string) => void;
  /** Ouverture directe du formulaire : appui long sur une date. */
  onLongPress: (iso: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  className?: string;
}

/**
 * Grille mensuelle de l'export de design. Chaque case est un vrai bouton :
 * sélection au clic, création à l'appui long (700 ms), toujours doublée par un
 * bouton accessible dans l'agenda.
 */
export function CalendarGrid({
  days,
  monthLabel,
  selected,
  today,
  markers,
  onSelect,
  onLongPress,
  onPrevious,
  onNext,
  onToday,
  className,
}: CalendarGridProps) {
  const longPressFired = useRef(false);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const startPress = useCallback(
    (iso: string) => {
      longPressFired.current = false;
      clearTimer();
      timer.current = window.setTimeout(() => {
        longPressFired.current = true;
        onLongPress(iso);
      }, LONG_PRESS_MS);
    },
    [clearTimer, onLongPress],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const handleClick = (iso: string) => {
    // Un appui long vient de se produire : on n'enchaîne pas sur une sélection.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onSelect(iso);
  };

  return (
    <section className={cn('panel-surface rounded-[16px] p-[22px]', className)} aria-label="Grille du mois">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="mb-0 font-display text-[21px] tracking-[-0.035em]">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="quiet" size="sm" onClick={onToday} icon="calendar">
            Aujourd’hui
          </Button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Mois précédent"
              className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrowLeft" size="sm" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Mois suivant"
              className="grid size-[34px] place-items-center rounded-[10px] bg-bg text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrow" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-[7px]" role="group" aria-label={`Jours de ${monthLabel}`}>
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
          const marker = markers[day.iso];
          const isToday = day.iso === today;
          const isSelected = day.iso === selected;
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => handleClick(day.iso)}
              onPointerDown={() => startPress(day.iso)}
              onPointerUp={clearTimer}
              onPointerLeave={clearTimer}
              onPointerCancel={clearTimer}
              onContextMenu={(event) => event.preventDefault()}
              aria-label={dayButtonLabel(day.iso, marker)}
              aria-current={isToday ? 'date' : undefined}
              data-has-event={marker ? 'true' : undefined}
              className={cn(
                'relative min-h-[54px] rounded-[10px] border border-transparent px-2 py-2 text-left text-xs text-ink-soft transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint',
                'focus-visible:outline-3 focus-visible:outline-offset-[3px] focus-visible:outline-accent-strong',
                day.isOutside && 'bg-transparent text-muted/60',
                isToday && 'bg-accent-strong font-extrabold text-surface hover:bg-accent-strong',
                isSelected && 'border-accent-strong shadow-[inset_0_0_0_1px_var(--color-accent-strong)]',
              )}
            >
              <span aria-hidden="true">{day.number}</span>
              {marker ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute bottom-[7px] left-2 size-[5px] rounded-full',
                    isToday ? 'bg-surface' : memberTagClass(marker.colorTag),
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-coral" />
          Événement
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-accent" />
          Anniversaire
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-amber" />
          Jour férié
        </span>
        <span className="basis-full text-[10px] text-muted sm:basis-auto">Maintenez une date pour créer un événement.</span>
      </div>
    </section>
  );
}
