import { describe, expect, it } from 'vitest';

import {
  parseVacationRecords,
  schoolYearFor,
  schoolYearsForYear,
  toParisDay,
} from './ref-days.ts';

describe('refresh-calendrier-ref helpers', () => {
  it('schoolYearFor bascule en septembre', () => {
    expect(schoolYearFor('2026-01-15')).toBe('2025-2026');
    expect(schoolYearFor('2026-09-01')).toBe('2026-2027');
  });

  it('schoolYearsForYear couvre janvier et septembre', () => {
    expect(schoolYearsForYear(2026)).toEqual(['2025-2026', '2026-2027']);
  });

  it('toParisDay convertit en jour civil Europe/Paris', () => {
    expect(toParisDay('2026-07-14T00:30:00+02:00')).toBe('2026-07-14');
  });

  it('parseVacationRecords dedup par libelle + bornes et ignore les incomplets', () => {
    const ranges = parseVacationRecords([
      { description: 'Toussaint', start_date: '2026-10-17T00:00:00+02:00', end_date: '2026-11-01T00:00:00+01:00' },
      { description: 'Toussaint', start_date: '2026-10-17T00:00:00+02:00', end_date: '2026-11-01T00:00:00+01:00' },
      { description: undefined, start_date: '2026-10-17T00:00:00+02:00', end_date: '2026-11-01T00:00:00+01:00' },
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ label: 'Toussaint', start: '2026-10-17', end: '2026-11-01' });
  });
});
