import { formatLongDate } from '@/lib/utils';
import type { AgendaItem } from '../types';

/**
 * Feuille imprimable d'une période (Lot 2, export Calendrier).
 *
 * L'écran montre une grille ou une colonne ; le papier, lui, se lit dans le
 * sens de la lecture : les jours occupés, dans l'ordre, avec l'heure et le
 * titre de chaque élément. Les jours vides sont écartés — une feuille qui
 * n'a que des cases vides n'apprend rien et gâche la page.
 *
 * Le modèle ne décide ni de la période ni des filtres : ils viennent de la vue
 * affichée, pour que la feuille dise exactement ce que l'écran montre.
 */
export interface CalendarPrintItem {
  key: string;
  time: string;
  title: string;
  subtitle: string | null;
}

export interface CalendarPrintDay {
  iso: string;
  label: string;
  items: CalendarPrintItem[];
}

export interface CalendarPrintModel {
  title: string;
  meta: string;
  days: CalendarPrintDay[];
}

/** `formatLongDate` sort en minuscules ; un titre de jour commence par une majuscule. */
const capitalize = (value: string) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : value);

export function toCalendarPrintModel(
  title: string,
  meta: string,
  period: readonly { iso: string; items: readonly AgendaItem[] }[],
): CalendarPrintModel {
  return {
    title,
    meta,
    days: period
      .filter((day) => day.items.length > 0)
      .map((day) => ({
        iso: day.iso,
        label: capitalize(formatLongDate(day.iso)),
        items: day.items.map((item) => ({
          key: item.key,
          time: item.time,
          title: item.title,
          subtitle: item.subtitle,
        })),
      })),
  };
}
