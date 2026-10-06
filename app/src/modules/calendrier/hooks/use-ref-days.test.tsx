import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/render';
import { data } from '@/lib/data';
import {
  parseVacationRecords,
  schoolYearFor,
  toFrenchHolidays,
  toParisDay,
  useRefDays,
  vacationsOfDay,
} from './use-ref-days';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

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

  it('accepte les lignes base au format jour civil (cache, D-13)', () => {
    const ranges = parseVacationRecords([
      { description: 'Vacances de la Toussaint', start_date: '2026-10-17', end_date: '2026-11-02' },
    ]);
    expect(ranges).toEqual([{ start: '2026-10-17', end: '2026-11-02', label: 'Vacances de la Toussaint' }]);
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

describe('toFrenchHolidays (mapping lignes base, D-13)', () => {
  it('mappe les lignes du cache vers les objets FrenchHoliday tries par date', () => {
    const holidays = toFrenchHolidays([
      { holiday_date: '2026-12-25', name: 'Jour de Noël', year: 2026 },
      { holiday_date: '2026-01-01', name: '1er janvier', year: 2026 },
    ]);
    expect(holidays).toEqual([
      { id: 0, date: '2026-01-01', title: '1er janvier', time: 'Toute la journée', kind: 'Jour férié' },
      { id: 1, date: '2026-12-25', title: 'Jour de Noël', time: 'Toute la journée', kind: 'Jour férié' },
    ]);
  });
});

describe('useRefDays sur cache base (D-13/D-15)', () => {
  it('lit les feries et vacances depuis la base, sans appel reseau direct', async () => {
    // Coupe tout acces reseau : un fetch direct vers les sources officielles
    // echouerait ici, seule la lecture base peut reussir.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('reseau coupe');
      }),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);
    const year = 2026;
    await data.create('public_holidays', { holiday_date: `${year}-11-11`, name: 'Armistice', year });
    await data.create('school_holidays', {
      zone: 'A',
      school_year: '2026-2027',
      name: 'Vacances de la Toussaint',
      start_date: '2026-10-17',
      end_date: '2026-11-02',
    });

    const { result } = renderHook(() => useRefDays(year, 'A'), { wrapper });

    await waitFor(() => expect(result.current.holidays.some((holiday) => holiday.title === 'Armistice')).toBe(true));
    expect(result.current.vacations).toEqual(
      expect.arrayContaining([{ start: '2026-10-17', end: '2026-11-02', label: 'Vacances de la Toussaint' }]),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('conserve les dernieres donnees affichees quand la lecture base echoue (D-15)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('reseau coupe');
      }),
    );
    const year = 2027;
    await data.create('public_holidays', { holiday_date: `${year}-01-01`, name: '1er janvier', year });

    const { result } = renderHook(() => useRefDays(year, null), { wrapper });
    await waitFor(() => expect(result.current.holidays.length).toBeGreaterThan(0));
    const shown = result.current.holidays;

    // La base tombe en panne au rechargement : l'ecran garde l'ancien cache.
    vi.spyOn(data, 'list').mockRejectedValue(new Error('base indisponible'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.holidays).toEqual(shown);
    expect(result.current.holidays.length).toBeGreaterThan(0);
  });
});
