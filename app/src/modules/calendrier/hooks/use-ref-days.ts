import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FrenchHoliday } from '@/hooks/use-french-holidays';
import type { PublicHolidayRow, SchoolHolidayRow } from '@/types';
import { listPublicHolidays, listSchoolHolidays } from '../api';

export type SchoolZone = 'A' | 'B' | 'C';

export interface VacationRange {
  /** Jour de début (YYYY-MM-DD, Europe/Paris). */
  start: string;
  /** Jour de fin inclus (YYYY-MM-DD, Europe/Paris). */
  end: string;
  label: string;
}

const DAY_MS = 86_400_000;
const STALE_MS = 24 * 3600 * 1000;

/** Convertit un instant ISO en jour civil Europe/Paris (`YYYY-MM-DD`). */
export function toParisDay(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}

/** Année scolaire (`2026-2027`) contenant le jour donné (rentrée en septembre). */
export function schoolYearFor(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/**
 * Années scolaires couvrant une année civile (porté à l'identique de l'Edge
 * `refresh-calendrier-ref`, D-13) : janvier et décembre appartiennent
 * parfois à deux années scolaires différentes.
 */
export function schoolYearsForYear(year: number): string[] {
  return [...new Set([schoolYearFor(`${year}-01-01`), schoolYearFor(`${year}-12-31`)])];
}

interface VacationRecord {
  description?: string;
  start_date?: string;
  end_date?: string;
}

/** Déduplique les lignes par académie (même libellé + mêmes bornes). */
export function parseVacationRecords(records: readonly VacationRecord[]): VacationRange[] {
  const seen = new Map<string, VacationRange>();
  for (const record of records) {
    if (!record.description || !record.start_date || !record.end_date) continue;
    const start = toParisDay(record.start_date);
    const end = toParisDay(record.end_date);
    const key = `${record.description}|${start}|${end}`;
    if (!seen.has(key)) seen.set(key, { start, end, label: record.description });
  }
  return [...seen.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Mappe les lignes du cache base vers les objets `FrenchHoliday`, triés par date. */
export function toFrenchHolidays(rows: readonly PublicHolidayRow[]): FrenchHoliday[] {
  return [...rows]
    .sort((a, b) => (a.holiday_date < b.holiday_date ? -1 : 1))
    .map((row, index) => ({
      id: index,
      date: row.holiday_date,
      title: row.name,
      time: 'Toute la journée',
      kind: 'Jour férié' as const,
    }));
}

/** Mappe les lignes du cache vacances vers les plages (dédupliquées, triées). */
export function toVacationRanges(rows: readonly SchoolHolidayRow[]): VacationRange[] {
  return parseVacationRecords(
    rows.map((row) => ({ description: row.name, start_date: row.start_date, end_date: row.end_date })),
  );
}

/**
 * Référentiels du calendrier depuis le cache base (D-13, source unique :
 * aucun appel réseau direct vers les sources officielles). Le rafraîchissement
 * est serveur (Edge `refresh-calendrier-ref` + pg_cron) ; en panne, les
 * dernières données affichées sont conservées (D-15, `placeholderData`).
 * `zone === null` : pas de vacances, avec un état invitant à choisir la zone.
 */
export function useRefDays(year: number, zone: SchoolZone | null) {
  const holidaysQuery = useQuery({
    queryKey: ['ref-days', 'public_holidays', year],
    queryFn: () => listPublicHolidays(year),
    staleTime: STALE_MS,
    retry: 1,
    placeholderData: (previous) => previous,
  });
  const vacationsQuery = useQuery({
    queryKey: ['ref-days', 'school_holidays', year, zone],
    enabled: zone !== null,
    queryFn: () => listSchoolHolidays(zone as SchoolZone),
    staleTime: STALE_MS,
    retry: 1,
    placeholderData: (previous) => previous,
  });

  const holidays = useMemo(() => toFrenchHolidays(holidaysQuery.data ?? []), [holidaysQuery.data]);
  const vacations = useMemo(() => {
    if (zone === null) return [];
    const years = schoolYearsForYear(year);
    // L'année scolaire borne la requête (granularité Edge), le chevauchement
    // avec l'année civile borne l'affichage : Toussaint 2025 appartient à
    // 2025-2026 (qui couvre janvier-août 2026) mais ne chevauche pas 2026.
    const first = `${year}-01-01`;
    const last = `${year}-12-31`;
    return toVacationRanges(
      (vacationsQuery.data ?? []).filter(
        (row) => years.includes(row.school_year) && row.start_date <= last && row.end_date >= first,
      ),
    );
  }, [vacationsQuery.data, zone, year]);

  return {
    holidays,
    vacations: zone === null ? [] : vacations,
    isLoading: holidaysQuery.isLoading || vacationsQuery.isLoading,
    isError: holidaysQuery.isError || vacationsQuery.isError,
    refetch: async () => {
      await holidaysQuery.refetch();
      if (zone !== null) await vacationsQuery.refetch();
    },
  };
}

/** Vrai si le jour tombe dans une plage de vacances (bornes incluses). */
export function vacationsOfDay(vacations: readonly VacationRange[], date: string): VacationRange[] {
  return vacations.filter((range) => range.start <= date && date <= range.end);
}

/** Prochain jour d'école après une plage (utile aux libellés, borné à +60 j). */
export function nextSchoolDay(vacations: readonly VacationRange[], date: string): string | null {
  const covering = vacationsOfDay(vacations, date);
  if (covering.length === 0) return null;
  const end = covering.map((range) => range.end).sort().at(-1) as string;
  const [y, m, d] = end.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
  return next.toISOString().slice(0, 10);
}
