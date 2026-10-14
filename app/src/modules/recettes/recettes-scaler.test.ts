import { describe, expect, it } from 'vitest';
import { agreeUnit, formatQuantity, formatTotalTime, roundToEven, scaleQuantity } from './types';

describe('Scaler recettes (R8, D-06, D-07)', () => {
  it('arrondit la reference au pair le plus proche (3 vers 4)', () => {
    expect(roundToEven(3)).toBe(4);
    expect(roundToEven(5)).toBe(6);
    expect(roundToEven(4)).toBe(4);
    expect(roundToEven(2)).toBe(2);
  });

  it('1 oeuf pour 4 donne 0.5 oeuf a 2 et 2 oeufs a 8', () => {
    expect(scaleQuantity(1, 4, 2)).toBe(0.5);
    expect(scaleQuantity(1, 4, 8)).toBe(2);
    expect(formatQuantity(scaleQuantity(1, 4, 2))).toBe('0.5');
  });

  it('laisse les lignes sans nombre (NULL, au gout) inchangees a toutes les echelles', () => {
    expect(scaleQuantity(null, 4, 2)).toBeNull();
    expect(scaleQuantity(null, 4, 8)).toBeNull();
    expect(scaleQuantity(null, 4, 12)).toBeNull();
  });

  it('accorde l unite en +s/+x (0.5 oeuf, 2 oeufs)', () => {
    expect(agreeUnit('oeuf', 0.5)).toBe('oeuf');
    expect(agreeUnit('oeuf', 1)).toBe('oeuf');
    expect(agreeUnit('oeuf', 2)).toBe('oeufs');
    expect(agreeUnit('noix', 2)).toBe('noix');
  });

  it('affiche le temps total prepa + cuisson (30 + 45 = 1h15)', () => {
    expect(formatTotalTime(30, 45)).toBe('1h15');
    expect(formatTotalTime(30, null)).toBe('30 min');
    expect(formatTotalTime(null, null)).toBeNull();
  });
});
