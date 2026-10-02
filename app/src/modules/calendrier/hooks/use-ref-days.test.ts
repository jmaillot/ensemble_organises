import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchFrenchHolidays,
  fetchSchoolVacations,
  parseVacationRecords,
  schoolYearFor,
  toParisDay,
  vacationsOfDay,
} from './use-ref-days';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('schoolYearFor', () => {
  it('bascule en septembre', () => {
    expect(schoolYearFor('2026-08-31')).toBe('2025-2026');
    expect(schoolYearFor('2026-09-01')).toBe('2026-2027');
    expect(schoolYearFor('2027-06-15')).toBe('2026-2027');
  });
});

describe('toParisDay', () => {
  it('convertit en jour civil Europe/Paris', () => {
    // 22:00 UTC = minuit passé à Paris en heure d'été (+2).
    expect(toParisDay('2026-10-16T22:00:00+00:00')).toBe('2026-10-17');
    expect(toParisDay('2026-12-18T23:00:00+00:00')).toBe('2026-12-19');
  });
});

describe('parseVacationRecords', () => {
  it('déduplique les lignes par académie et trie', () => {
    const ranges = parseVacationRecords([
      { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
      { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
      { description: 'Vacances de Noël', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00' },
      { description: 'Sans dates' },
    ]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: '2026-10-17', end: '2026-11-02', label: 'Vacances de la Toussaint' });
    expect(ranges[1].label).toBe('Vacances de Noël');
  });
});

describe('vacationsOfDay', () => {
  const ranges = [{ start: '2026-10-17', end: '2026-11-02', label: 'Toussaint' }];
  it('bornes incluses', () => {
    expect(vacationsOfDay(ranges, '2026-10-17')).toHaveLength(1);
    expect(vacationsOfDay(ranges, '2026-11-02')).toHaveLength(1);
    expect(vacationsOfDay(ranges, '2026-11-03')).toHaveLength(0);
    expect(vacationsOfDay(ranges, '2026-10-16')).toHaveLength(0);
  });
});

describe('fetchFrenchHolidays', () => {
  it('trie par date et numérote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ '2026-12-25': 'Jour de Noël', '2026-01-01': '1er janvier' }),
      })),
    );
    const holidays = await fetchFrenchHolidays(2026);
    expect(holidays).toEqual([
      { id: 0, date: '2026-01-01', title: '1er janvier', time: 'Toute la journée', kind: 'Jour férié' },
      { id: 1, date: '2026-12-25', title: 'Jour de Noël', time: 'Toute la journée', kind: 'Jour férié' },
    ]);
  });

  it('lève sur erreur HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(fetchFrenchHolidays(2026)).rejects.toThrow('500');
  });
});

describe('fetchSchoolVacations', () => {
  it('fusionne les années scolaires et déduplique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
          results: url.includes('2025-2026')
            ? [{ description: 'Toussaint', start_date: '2025-10-17T22:00:00+00:00', end_date: '2025-11-02T23:00:00+00:00' }]
            : [
                { description: 'Toussaint', start_date: '2025-10-17T22:00:00+00:00', end_date: '2025-11-02T23:00:00+00:00' },
                { description: 'Noël', start_date: '2025-12-19T23:00:00+00:00', end_date: '2026-01-04T23:00:00+00:00' },
              ],
        }),
      })),
    );
    const ranges = await fetchSchoolVacations('A', ['2025-2026', '2026-2027']);
    expect(ranges.map((range) => range.label)).toEqual(['Toussaint', 'Noël']);
  });
});
