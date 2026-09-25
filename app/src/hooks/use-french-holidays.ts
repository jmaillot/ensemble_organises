import { useMemo } from 'react';
import { pad, toIsoDate } from '@/lib/utils';

export interface FrenchHoliday {
  id: number;
  date: string;
  title: string;
  time: string;
  kind: 'Jour férié';
}

function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Jours fériés français (11 jours, horsjours d observance locale). */
export function useFrenchHolidays(year: number): FrenchHoliday[] {
  return useMemo(() => {
    const easter = new Date(`${easterDate(year)}T12:00:00`);
    const shift = (days: number) => {
      const date = new Date(easter);
      date.setDate(date.getDate() + days);
      return toIsoDate(date);
    };
    return [
      [`${year}-01-01`, 'Jour de l’an'],
      [shift(-2), 'Vendredi saint'],
      [shift(1), 'Lundi de Pâques'],
      [`${year}-05-01`, 'Fête du Travail'],
      [`${year}-05-08`, 'Victoire 1945'],
      [`${year}-07-14`, 'Fête nationale'],
      [`${year}-08-15`, 'Assomption'],
      [`${year}-11-01`, 'Toussaint'],
      [`${year}-11-11`, 'Armistice 1918'],
      [`${year}-12-25`, 'Noël'],
    ].map(([date, title], index) => ({ id: index, date: date as string, title: title as string, time: 'Toute la journée', kind: 'Jour férié' as const }));
  }, [year]);
}
