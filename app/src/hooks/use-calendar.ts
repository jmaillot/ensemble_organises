import { useMemo, useState } from 'react';
import { formatMonthLabel, todayIso, toIsoDate } from '@/lib/utils';

export interface MonthCursor {
  /** Premier jour du mois affiché. */
  month: Date;
  selected: string;
}

/** Grille mensuelle prête à afficher (lundi en première colonne). */
export function useCalendarGrid(initialMonth?: Date) {
  // Curseur normalisé au 1er du mois : la grille part du 1er, jamais du jour courant.
  const [cursor, setCursor] = useState(() => {
    const base = initialMonth ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => todayIso());

  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = (cursor.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const days = Array.from({ length: cells }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      const date = new Date(year, month, dayNumber);
      return {
        iso: toIsoDate(date),
        number: date.getDate(),
        isOutside: dayNumber < 1 || dayNumber > daysInMonth,
      };
    });
    return { year, month, days };
  }, [cursor]);

  const shift = (delta: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(todayIso());
  };

  return {
    ...grid,
    selected,
    label: formatMonthLabel(cursor),
    setSelected,
    shift,
    goToToday,
    isToday: todayIso(),
  };
}
