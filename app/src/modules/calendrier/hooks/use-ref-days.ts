import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FrenchHoliday } from '@/hooks/use-french-holidays';

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

const feriesUrl = (year: number) => `https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`;

const vacancesUrl = (zone: SchoolZone, schoolYear: string) =>
  `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records` +
  `?where=${encodeURIComponent(`zones="Zone ${zone}"`)}` +
  `&where=${encodeURIComponent(`annee_scolaire="${schoolYear}"`)}` +
  `&limit=100&select=description,start_date,end_date,zones,annee_scolaire`;

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

export async function fetchFrenchHolidays(year: number, signal?: AbortSignal): Promise<FrenchHoliday[]> {
  const response = await fetch(feriesUrl(year), { signal });
  if (!response.ok) throw new Error(`Jours fériés indisponibles (${response.status}).`);
  const json = (await response.json()) as Record<string, string>;
  return Object.entries(json)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, title], index) => ({ id: index, date, title, time: 'Toute la journée', kind: 'Jour férié' as const }));
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

export async function fetchSchoolVacations(
  zone: SchoolZone,
  schoolYears: readonly string[],
  signal?: AbortSignal,
): Promise<VacationRange[]> {
  const pages = await Promise.all(
    schoolYears.map(async (schoolYear) => {
      const response = await fetch(vacancesUrl(zone, schoolYear), { signal });
      if (!response.ok) throw new Error(`Vacances scolaires indisponibles (${response.status}).`);
      const json = (await response.json()) as { results?: VacationRecord[] };
      return json.results ?? [];
    }),
  );
  return parseVacationRecords(pages.flat());
}

/**
 * Référentiels du calendrier depuis les API officielles (cache 24 h).
 * `zone === null` : pas de vacances, avec un état invitant à choisir la zone.
 */
export function useRefDays(year: number, zone: SchoolZone | null) {
  const schoolYears = useMemo(
    () => [...new Set([schoolYearFor(`${year}-01-01`), schoolYearFor(`${year}-12-31`)])],
    [year],
  );

  const holidaysQuery = useQuery({
    queryKey: ['ref-days', 'feries', year],
    queryFn: ({ signal }) => fetchFrenchHolidays(year, signal),
    staleTime: STALE_MS,
    retry: 1,
  });
  const vacationsQuery = useQuery({
    queryKey: ['ref-days', 'vacances', zone, ...schoolYears],
    enabled: zone !== null,
    queryFn: ({ signal }) => fetchSchoolVacations(zone as SchoolZone, schoolYears, signal),
    staleTime: STALE_MS,
    retry: 1,
  });

  return {
    holidays: holidaysQuery.data ?? [],
    vacations: zone === null ? [] : (vacationsQuery.data ?? []),
    isLoading: holidaysQuery.isLoading || vacationsQuery.isLoading,
    isError: holidaysQuery.isError || vacationsQuery.isError,
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
