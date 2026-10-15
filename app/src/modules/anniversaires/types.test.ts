import { describe, expect, it } from 'vitest';
import { aggregateBirthdays, displayablePhoto, formatFrDate, parseFrDate, toBirthday } from './types';
import type { BirthdayRow, ContactRow } from '@/types';

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

const birthdayRow = (overrides: Partial<BirthdayRow> = {}): BirthdayRow => ({
  id: 'b1',
  household_id: 'h1',
  name: 'Maya Martin',
  birth_date: '1992-10-07',
  photo_url: 'h1/anniversaires/x.jpg',
  linked_member_id: null,
  contact_id: null,
  ...overrides,
});

const contactRow = (overrides: Partial<ContactRow> = {}): ContactRow => ({
  id: 'c1',
  list_id: 'l1',
  household_id: 'h1',
  name: 'Maya Martin',
  birth_date: '1992-10-07',
  photo_url: 'h1/contacts/x.jpg',
  linked_member_id: null,
  ...overrides,
});

/**
 * D-01, WR-08 : la colonne média porte un CHEMIN ; l'URL affichable se forge à
 * la lecture, en échec fermé. Le DOM ne reçoit jamais un chemin brut (lien mort)
 * ni une URL éphémère persistée.
 */
describe('displayablePhoto', () => {
  it('forge l’URL signée d’un chemin résolu', () => {
    expect(displayablePhoto('h1/anniversaires/x.jpg', { k: 'https://signe.example/x.jpg' }, 'k')).toBe(
      'https://signe.example/x.jpg',
    );
  });

  it('rend null pour un chemin non résolu (échec fermé, jamais le chemin brut)', () => {
    expect(displayablePhoto('h1/anniversaires/x.jpg', {}, 'k')).toBeNull();
  });

  it('rend telle quelle une forme non-chemin (URL externe héritée, jamais re-signée)', () => {
    expect(displayablePhoto('https://externe.example/photo.jpg', {}, 'k')).toBe('https://externe.example/photo.jpg');
  });

  it('rend null pour une valeur absente ou blanche', () => {
    expect(displayablePhoto(null, {}, 'k')).toBeNull();
    expect(displayablePhoto('   ', {}, 'k')).toBeNull();
  });
});

describe('toBirthday', () => {
  it('résout un chemin et conserve la valeur de colonne comme `photoStored`', () => {
    const birthday = toBirthday(birthdayRow(), [], { b1: 'https://signe.example/x.jpg' });
    expect(birthday.photoUrl).toBe('https://signe.example/x.jpg');
    expect(birthday.photoStored).toBe('h1/anniversaires/x.jpg');
  });

  it('rend la valeur brute pour une forme non-chemin', () => {
    const birthday = toBirthday(birthdayRow({ photo_url: 'https://externe.example/x.jpg' }), [], {});
    expect(birthday.photoUrl).toBe('https://externe.example/x.jpg');
  });
});

/**
 * D-13 : la priorité photo (contact d'abord, repli anniversaire) s'applique sur
 * les valeurs RÉSOLUES, et la ligne de synthèse « contact seul » re-signe aussi.
 */
describe('aggregateBirthdays — priorité photo sur valeurs résolues (D-13)', () => {
  it('préfère la photo du contact, toutes deux résolues, distinctes', () => {
    const resolved = { b1: 'https://signe.example/b.jpg', c1: 'https://signe.example/c.jpg' };
    const [merged] = aggregateBirthdays([birthdayRow()], [contactRow()], [], resolved);
    expect(merged.twoSources).toBe(true);
    expect(merged.displayPhotoUrl).toBe('https://signe.example/c.jpg');
  });

  it('replie sur la photo de l’anniversaire quand celle du contact manque', () => {
    const resolved = { b1: 'https://signe.example/b.jpg' };
    const [merged] = aggregateBirthdays([birthdayRow()], [contactRow({ photo_url: null })], [], resolved);
    expect(merged.displayPhotoUrl).toBe('https://signe.example/b.jpg');
  });

  it('résout aussi la ligne de synthèse « contact seul »', () => {
    const contacts: ContactRow[] = [
      contactRow({ id: 'c9', name: 'Léa Moreau', photo_url: 'h1/contacts/lea.jpg' }),
    ];
    const [merged] = aggregateBirthdays([], contacts, [], { c9: 'https://signe.example/lea.jpg' });
    expect(merged.origin).toBe('contact');
    expect(merged.displayPhotoUrl).toBe('https://signe.example/lea.jpg');
  });
});
