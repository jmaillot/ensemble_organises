import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysBetween, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import { nextBirthdayIso } from './use-dashboard';

/**
 * `nextBirthdayIso` se cale sur `todayIso()` : le temps est donc figé
 * (15 octobre 2026, hors bissextile) pour que le test mesure le calcul et non le
 * jour où il est exécuté.
 */
const TODAY = new Date(2026, 9, 15, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * L'assertion qui discrimine n'est pas « ce n'est pas `NaN` » — V8 ne rend pas
 * `new Date('2027-02-29')` invalide, il **déborde** sur le 1er mars, donc un
 * nombre de jours fini peut cacher la faute. Ce qui doit être vrai dans tous les
 * moteurs, c'est que la date rendue **existe** : elle doit se relire à
 * l'identique après passage par `Date`.
 */
const expectRealDate = (iso: string, label: string) => {
  expect(iso, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(toIsoDate(toLocalDate(iso)), label).toBe(iso);
};

describe('nextBirthdayIso — le 29 février ne casse plus le calcul (WR-12)', () => {
  it('borne le jour par le mois de l’année visée', () => {
    // 2027 n'est pas bissextile : le 29 février y devient le 28.
    expect(nextBirthdayIso('2016-02-29', 2027)).toBe('2027-02-28');
    // 2028 l'est : le 29 reste le 29.
    expect(nextBirthdayIso('2016-02-29', 2028)).toBe('2028-02-29');
  });

  it('rend une date qui existe sur trois années consécutives, dont une non bissextile', () => {
    [2027, 2028, 2029].forEach((year) => {
      expectRealDate(nextBirthdayIso('2016-02-29', year), String(year));
    });

    const today = todayIso();
    const days = [2027, 2028, 2029].map((year) => daysBetween(today, nextBirthdayIso('2016-02-29', year)));
    // Strictement croissant : un `NaN` (moteur qui refuse la date) ferait
    // échouer ces deux comparaisons.
    expect(days[1]).toBeGreaterThan(days[0] as number);
    expect(days[2]).toBeGreaterThan(days[1] as number);
  });

  it('bascule sur l’année suivante quand l’anniversaire est passé, 29 février compris', () => {
    // 2026-02-29 est passé : le prochain tombe en 2027, borné au 28.
    const next = nextBirthdayIso('2016-02-29', 2026);
    expect(next).toBe('2027-02-28');
    expectRealDate(next, '2027');
  });

  it('laisse les autres dates inchangées', () => {
    expect(nextBirthdayIso('1990-03-15', 2027)).toBe('2027-03-15');
    expect(nextBirthdayIso('1990-01-02', 2026)).toBe('2027-01-02');
    expect(nextBirthdayIso('1990-12-31', 2026)).toBe('2026-12-31');
  });

  it('nourrit au comparateur de tri une date réelle, donc un ordre stable', () => {
    // Reproduit l'expression du memo `upcomingBirthdays` : le comparateur
    // `a.daysUntil - b.daysUntil` obtenait une clé `NaN` pour un 29 février, et
    // `NaN` laissait l'ordre dépendre du moteur.
    const today = todayIso();
    const rows = ['2016-02-29', '2016-03-01', '2020-12-24'].map((birthDate) => {
      const next = nextBirthdayIso(birthDate, 2026);
      expectRealDate(next, birthDate);
      return { birthDate, daysUntil: Math.max(0, daysBetween(today, next)) };
    });
    const sorted = [...rows].sort((a, b) => a.daysUntil - b.daysUntil);
    expect(sorted.map((row) => row.birthDate)).toEqual(['2020-12-24', '2016-02-29', '2016-03-01']);
  });
});
