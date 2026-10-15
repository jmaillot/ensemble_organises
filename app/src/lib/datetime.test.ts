import { afterAll, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { instantOfDatetimeLocal, instantToLocalInput } from './datetime';

/**
 * Fuseau épinglé : les deux directions sont par construction sensibles au
 * fuseau, et un test qui n'épingle pas le sien mesure la machine, pas le code
 * (AGENTS.md §2.7 D.3). Paris est le fuseau du foyer ; la valeur d'origine est
 * restaurée à la fin du fichier pour ne pas fuiter vers les suites suivantes
 * (`pool: 'forks'` réutilise le worker).
 */
const PREVIOUS_TZ = process.env.TZ;
process.env.TZ = 'Europe/Paris';
afterAll(() => {
  if (PREVIOUS_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREVIOUS_TZ;
});

describe('instantToLocalInput — relecture d’un instant en heure locale', () => {
  it('rend l’heure locale, jamais la chaîne UTC tronquée (WR-07)', () => {
    // 16:30Z = 18:30 à Paris : le `slice(0, 16)` d'origine affichait 16:30.
    expect(instantToLocalInput('2026-10-15T16:30:00.000Z')).toBe('2026-10-15T18:30');
  });

  it('accepte les offsets non-UTC et les millisecondes', () => {
    expect(instantToLocalInput('2026-10-15T18:30:00+02:00')).toBe('2026-10-15T18:30');
    expect(instantToLocalInput('2026-10-15T16:30:00.123Z')).toBe('2026-10-15T18:30');
  });

  it('suit le décalage d’hiver comme celui d’été', () => {
    // Janvier : Paris est à UTC+1 (17:30Z = 18:30 locale).
    expect(instantToLocalInput('2026-01-15T17:30:00.000Z')).toBe('2026-01-15T18:30');
  });

  it('accepte un `Date`', () => {
    expect(instantToLocalInput(new Date('2026-10-15T16:30:00.000Z'))).toBe('2026-10-15T18:30');
  });

  it('rend une chaîne vide pour une valeur absente ou illisible, jamais `Invalid Date`', () => {
    expect(instantToLocalInput('')).toBe('');
    expect(instantToLocalInput('   ')).toBe('');
    expect(instantToLocalInput(null)).toBe('');
    expect(instantToLocalInput(undefined)).toBe('');
    expect(instantToLocalInput('nawak')).toBe('');
  });
});

describe('instantOfDatetimeLocal — écriture d’une valeur locale en instant', () => {
  it('interprète la valeur en heure locale et rend l’instant UTC', () => {
    expect(instantOfDatetimeLocal('2026-10-15T18:30')).toBe('2026-10-15T16:30:00.000Z');
  });

  it('rend `null` pour « aucun rappel » et pour une valeur illisible', () => {
    expect(instantOfDatetimeLocal('')).toBeNull();
    expect(instantOfDatetimeLocal('   ')).toBeNull();
    expect(instantOfDatetimeLocal(null)).toBeNull();
    expect(instantOfDatetimeLocal(undefined)).toBeNull();
    expect(instantOfDatetimeLocal('nawak')).toBeNull();
  });

  it('accepte le 29 février d’une année bissextile', () => {
    const iso = instantOfDatetimeLocal('2028-02-29T09:00');
    expect(iso).not.toBeNull();
    expect(Number.isFinite(new Date(iso as string).getTime())).toBe(true);
  });
});

describe('aller-retour instant → valeur locale → instant', () => {
  /**
   * Dix formes d’entrée, toutes alignées sur la minute : c’est la granularité du
   * champ `datetime-local`, donc celle que la conversion doit restituer.
   */
  const instants = [
    '2026-10-15T16:30:00.000Z',
    '2026-10-15T16:30:00Z',
    '2026-10-15T18:30:00+02:00',
    '2026-10-15T12:30:00-04:00',
    '2026-01-15T17:30:00.000Z',
    '2026-07-01T22:30:00.000Z',
    '2027-01-01T00:00:00.000Z',
    '2026-12-31T23:00:00.000Z',
    '2028-02-29T08:00:00.000Z',
    '2026-10-15T00:00:00.000Z',
  ];

  it('restitue le même instant', () => {
    instants.forEach((iso) => {
      const local = instantToLocalInput(iso);
      expect(instantOfDatetimeLocal(local), iso).toBe(new Date(iso).toISOString());
    });
  });

  it('restitue la même valeur locale', () => {
    instants.forEach((iso) => {
      const local = instantToLocalInput(iso);
      expect(instantToLocalInput(instantOfDatetimeLocal(local) as string), iso).toBe(local);
    });
  });

  it('ne dérive pas après deux allers-retours consécutifs (défaut de WR-07 : 2 h par enregistrement)', () => {
    instants.forEach((iso) => {
      const once = instantOfDatetimeLocal(instantToLocalInput(iso));
      const twice = instantOfDatetimeLocal(instantToLocalInput(once as string));
      expect(twice, iso).toBe(once);
      expect(twice, iso).toBe(new Date(iso).toISOString());
    });
  });

  it('la valeur relue est celle que `date-fns` rend pour le même instant (pas de format divergent)', () => {
    const iso = '2026-10-15T16:30:00.000Z';
    expect(instantToLocalInput(iso)).toBe(format(new Date(iso), "yyyy-MM-dd'T'HH:mm"));
  });
});
