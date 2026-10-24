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

/** Numéro de semaine ISO 8601 (semaine 1 = celle du premier jeudi). */
export function isoWeekNumber(iso: string): number {
  const date = new Date(`${iso}T12:00:00`);
  const target = new Date(date.valueOf());
  target.setDate(target.getDate() - ((date.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}

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
  /**
   * Ouverture directe du formulaire : appui long sur une date. FACULTATIF —
   * un rôle qui n'a pas le droit de créer (l'`enfant`, D-06/D-13) ne reçoit
   * rien : la grille reste sélectionnable, et l'indication d'appui long
   * disparaît avec le geste (constat (b) du lot de la phase 22, §3 des
   * `deferred-items` de la phase 19).
   */
  onLongPress?: (iso: string) => void;
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
      // Aucun geste à armer quand la création n'est pas permise : le clic
      // reste une sélection, et aucune minuterie ne s'arme pour rien.
      if (!onLongPress) return;
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

  // La grille démarre le lundi : chaque tranche de 7 jours est une semaine ISO.
  const weeks: GridDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return (
    <section className={cn('panel-surface rounded-[24px] p-4 min-[651px]:p-6', className)} aria-label="Grille du mois">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="mb-0 font-display text-[24px] capitalize tracking-[-0.035em]">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="quiet" size="sm" onClick={onToday} icon="calendar">
            <span className="max-[650px]:sr-only">Aujourd’hui</span>
          </Button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Mois précédent"
              className="grid size-9 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrowLeft" size="sm" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Mois suivant"
              className="grid size-9 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
            >
              <Icon name="arrow" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[22px_repeat(7,minmax(0,1fr))] gap-1" role="group" aria-label={`Jours de ${monthLabel}`}>
        <div aria-hidden="true" className="grid min-h-7 place-items-center text-[9px] font-extrabold text-muted uppercase">
          Sem<span className="sr-only">aine</span>
        </div>
        {DAY_NAMES.map((name, index) => (
          <div
            key={`${name}-${index}`}
            aria-hidden="true"
            className="grid min-h-7 place-items-center text-[11px] font-extrabold tracking-wide text-muted uppercase"
          >
            {name}
          </div>
        ))}

        {weeks.map((week) => (
          <div key={week[0]?.iso ?? 'semaine'} className="contents">
            <div
              aria-hidden="true"
              title={`Semaine ${isoWeekNumber(week[0].iso)}`}
              // muted/60 mesurait 2,2:1 (audit du 24/10/2026) ; muted plein 5,3:1.
              className="grid min-h-[48px] place-items-center text-[11px] font-semibold text-muted tabular-nums min-[651px]:min-h-[58px]"
            >
              {isoWeekNumber(week[0].iso)}
            </div>
            {week.map((day) => {
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
                    'relative min-h-[48px] rounded-[12px] px-1 py-1.5 text-left text-xs transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint min-[651px]:min-h-[58px]',
                    'focus-visible:outline-3 focus-visible:outline-offset-[2px] focus-visible:outline-accent-strong',
                    // muted/45 mesurait 2,2:1 (audit du 24/10/2026) ; muted
                    // plein reste 5,3:1 et la nuance avec le mois courant
                    // (encre fg) suffit.
                    day.isOutside && 'text-muted',
                    isSelected && 'bg-accent-faint',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mx-auto grid size-7 place-items-center rounded-full text-[12px] font-[650] tabular-nums',
                      isToday
                        ? 'bg-coral font-extrabold text-white'
                        : isSelected
                          ? 'bg-accent text-surface'
                          : day.isOutside
                            ? 'text-muted'
                            : 'text-fg',
                    )}
                  >
                    {day.number}
                  </span>
                  {marker ? (
                    <span aria-hidden="true" className="absolute bottom-[6px] left-1/2 flex -translate-x-1/2 items-center gap-[3px]">
                      {marker.count > 0 ? (
                        <span className={cn('size-[5px] rounded-full', memberTagClass(marker.colorTag))} />
                      ) : null}
                      {marker.hasTask ? <span className="size-[5px] rounded-full bg-[oklch(55%_0.13_300)]" /> : null}
                      {marker.categoryColor ? (
                        <span className="size-[5px] rounded-full" style={{ backgroundColor: marker.categoryColor }} />
                      ) : null}
                      {marker.hasBirthday ? <span className="size-[5px] rounded-full bg-accent" /> : null}
                      {marker.hasHoliday ? <span className="size-[5px] rounded-full bg-amber" /> : null}
                      {marker.hasVacation ? <span className="size-[5px] rounded-full bg-sky-strong" /> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
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
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-sky-strong" />
          Vacances
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[6px] rounded-full bg-[oklch(55%_0.13_300)]" />
          Tâche
        </span>
        {onLongPress ? (
          <span className="basis-full text-[11px] text-muted sm:basis-auto">Maintenez une date pour créer un événement.</span>
        ) : null}
      </div>
    </section>
  );
}
