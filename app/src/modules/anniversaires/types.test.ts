import { describe, expect, it } from 'vitest';
import { formatFrDate, parseFrDate } from './types';

/**
 * La saisie des dates suit la locale du navigateur avec un champ natif
 * (MM/DD/YYYY sur un Firefox en-US) : elle est donc explicite, en
 * JJ/MM/AAAA, validée ici sans ambiguïté calendaire.
 */
describe('parseFrDate', () => {
  it.each([
    ['27/09/1990', '1990-09-27'],
    ['7/9/1990', '1990-09-07'],
    ['01/01/2000', '2000-01-01'],
    ['29/02/2000', '2000-02-29'],
    [' 27/09/1990 ', '1990-09-27'],
  ])('convertit %s en %s', (input, expected) => {
    expect(parseFrDate(input)).toBe(expected);
  });

  it.each(['', '27-09-1990', '1990-09-27', '27/09/90', '30/02/2024', '31/04/2026', '29/02/2023', '00/01/2000', '15/13/2000', 'demain'])(
    'refuse %s',
    (input) => {
      expect(parseFrDate(input)).toBeNull();
    },
  );
});

describe('formatFrDate', () => {
  it.each([
    ['1990-09-27', '27/09/1990'],
    ['2000-02-29', '29/02/2000'],
  ])('convertit %s en %s', (input, expected) => {
    expect(formatFrDate(input)).toBe(expected);
  });

  it.each(['', '27/09/1990', '1990-9-7'])('rend vide pour %s', (input) => {
    expect(formatFrDate(input)).toBe('');
  });
});
