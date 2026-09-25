import { describe, expect, it } from 'vitest';
import {
  addDays,
  clamp,
  daysBetween,
  formatEuro,
  generateInviteToken,
  initials,
  relativeDayLabel,
  toIsoDate,
  todayIso,
} from './utils';

describe('formatEuro', () => {
  it('formate un montant en euros à la française', () => {
    // Intl insère une espace fine insécable avant le symbole.
    expect(formatEuro(84.5)).toMatch(/^84,50\s?€$/u);
    expect(formatEuro(0)).toMatch(/^0,00\s?€$/u);
    expect(formatEuro(Number.NaN)).toMatch(/^0,00\s?€$/u);
  });
});

describe('initials', () => {
  it('retient au plus deux lettres en majuscules', () => {
    expect(initials('Camille Martin')).toBe('CM');
    expect(initials('Maya')).toBe('M');
    expect(initials('')).toBe('');
  });
});

describe('dates', () => {
  it('formate une date ISO sans décalage de fuseau', () => {
    expect(toIsoDate(new Date(2026, 8, 25))).toBe('2026-09-25');
  });

  it('calcule un nombre de jours stable autour d’un changement de mois', () => {
    expect(daysBetween('2026-09-25', '2026-10-07')).toBe(12);
    expect(addDays('2026-12-28', 5)).toBe('2027-01-02');
  });

  it('exprime une échéance en français', () => {
    expect(relativeDayLabel(todayIso())).toBe("Aujourd'hui");
    expect(relativeDayLabel(addDays(todayIso(), 1))).toBe('Demain');
    expect(relativeDayLabel(addDays(todayIso(), 12))).toBe('Dans 12 jours');
    expect(relativeDayLabel(addDays(todayIso(), -2))).toBe('En retard de 2 j');
  });
});

describe('generateInviteToken', () => {
  it('produit un token base64url d’au moins 22 caractères, sans symbole ambigu', () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produit des tokens différents à chaque appel', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe('clamp', () => {
  it('borne une valeur dans un intervalle', () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-4, 0, 100)).toBe(0);
    expect(clamp(42, 0, 100)).toBe(42);
  });
});
