/**
 * Helpers purs de `refresh-calendrier-ref` (formes miroir de `use-ref-days.ts`).
 *
 * Module séparé pour être testé par la suite Vitest (`helpers.test.ts`) :
 * `index.ts` porte `Deno.serve` et ne peut pas être importé hors runtime Deno
 * (même convention que `push-notify/web-push.ts`).
 */

export type SchoolZone = 'A' | 'B' | 'C';
export const ZONES: readonly SchoolZone[] = ['A', 'B', 'C'];

export interface VacationRange {
  start: string;
  end: string;
  label: string;
}

export const feriesUrl = (year: number) =>
  `https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`;

export const vacancesUrl = (zone: SchoolZone, schoolYear: string) =>
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

/** Années scolaires couvrant l'année civile (janvier → année en cours, septembre → rentrée). */
export function schoolYearsForYear(year: number): string[] {
  return [...new Set([schoolYearFor(`${year}-01-01`), schoolYearFor(`${year}-12-31`)])];
}

export interface VacationRecord {
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
