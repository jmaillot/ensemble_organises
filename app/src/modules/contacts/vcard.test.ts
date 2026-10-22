import { describe, expect, it } from 'vitest';
import { VCARD_MAX_CARDS, parseVcardDate, parseVcf } from './vcard';

describe('parseVcardDate', () => {
  it('lit une date ISO', () => {
    expect(parseVcardDate('1990-09-27')).toBe('1990-09-27');
  });

  it('lit une date compacte (vCard 2.1)', () => {
    expect(parseVcardDate('19900927')).toBe('1990-09-27');
  });

  it('coupe un horodatage', () => {
    expect(parseVcardDate('1990-09-27T08:30:00')).toBe('1990-09-27');
  });

  it('rend null pour une date sans année, au lieu d inventer une année', () => {
    expect(parseVcardDate('--09-27')).toBeNull();
  });

  it('rend null pour un mois impossible', () => {
    expect(parseVcardDate('1990-13-05')).toBeNull();
  });

  it('rend null pour un texte libre', () => {
    expect(parseVcardDate('un jour de septembre')).toBeNull();
  });
});

describe('parseVcf', () => {
  it('lit une fiche 3.0 simple avec FN et BDAY', () => {
    const result = parseVcf(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Léa Moreau', 'BDAY:1990-09-27', 'END:VCARD'].join('\n'),
    );
    expect(result.people).toEqual([{ name: 'Léa Moreau', birthDate: '1990-09-27' }]);
    expect(result.organizations).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('déplie les lignes pliées (RFC 6350 §3.2)', () => {
    // L'espace de pliage est un remplisseur : le nom original n'en contenait pas.
    const result = parseVcf(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Léa Moreau-', ' Dupont', 'END:VCARD'].join('\r\n'),
    );
    expect(result.people[0]?.name).toBe('Léa Moreau-Dupont');
  });

  it('reconstruit le nom depuis N quand FN manque', () => {
    const result = parseVcf(
      ['BEGIN:VCARD', 'VERSION:3.0', 'N:Moreau;Léa;;;', 'END:VCARD'].join('\n'),
    );
    expect(result.people[0]?.name).toBe('Léa Moreau');
  });

  it('décode le quoted-printable des exportations Google 2.1', () => {
    // « Léa » encodé UTF-8 quoted-printable : L=C3=A9a.
    const result = parseVcf(
      ['BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Moreau;L=C3=A9a;;;', 'END:VCARD'].join('\n'),
    );
    expect(result.people[0]?.name).toBe('Léa Moreau');
  });

  it('lit plusieurs fiches dans l ordre du fichier', () => {
    const result = parseVcf(
      [
        'BEGIN:VCARD',
        'FN:Premier',
        'END:VCARD',
        'BEGIN:VCARD',
        'FN:Deuxième',
        'BDAY:1980-01-02',
        'END:VCARD',
      ].join('\n'),
    );
    expect(result.people.map((person) => person.name)).toEqual(['Premier', 'Deuxième']);
    expect(result.people[1]?.birthDate).toBe('1980-01-02');
  });

  it('compte les fiches de structure sans les importer', () => {
    const company = ['BEGIN:VCARD', 'FN:Boulangerie du Coin', 'ORG:Boulangerie du Coin', 'X-ABShowAs:COMPANY', 'END:VCARD'].join('\n');
    const kindOrg = ['BEGIN:VCARD', 'FN:Plomberie Rapide', 'KIND:org', 'END:VCARD'].join('\n');
    const orgSansNom = ['BEGIN:VCARD', 'ORG:Garage Sud', 'END:VCARD'].join('\n');
    const result = parseVcf([company, kindOrg, orgSansNom].join('\n'));
    expect(result.people).toEqual([]);
    expect(result.organizations).toBe(3);
  });

  it('compte une fiche sans nom comme illisible', () => {
    const result = parseVcf(['BEGIN:VCARD', 'VERSION:3.0', 'TEL:+33600000000', 'END:VCARD'].join('\n'));
    expect(result.people).toEqual([]);
    expect(result.invalid).toBe(1);
  });

  it('ignore une BDAY sans année mais importe la fiche', () => {
    const result = parseVcf(
      ['BEGIN:VCARD', 'VERSION:4.0', 'FN:Léa Moreau', 'BDAY;VALUE=DATE:--09-27', 'END:VCARD'].join('\n'),
    );
    expect(result.people).toEqual([{ name: 'Léa Moreau', birthDate: null }]);
  });

  it('traite les propriétés sans tenir compte de la casse ni du préfixe de groupe', () => {
    const result = parseVcf(
      ['BEGIN:VCARD', 'item1.fn:Léa Moreau', 'item1.bday:1990-09-27', 'END:VCARD'].join('\n'),
    );
    expect(result.people).toEqual([{ name: 'Léa Moreau', birthDate: '1990-09-27' }]);
  });

  it('ignore les propriétés étrangères (photo, téléphone) sans erreur', () => {
    const result = parseVcf(
      [
        'BEGIN:VCARD',
        'FN:Léa Moreau',
        'TEL;TYPE=CELL:+33600000000',
        'PHOTO;ENCODING=BASE64:AAAA',
        'ADR;TYPE=HOME:;;12 rue des Tilleuls;Lyon;;69006;France',
        'END:VCARD',
      ].join('\n'),
    );
    expect(result.people).toEqual([{ name: 'Léa Moreau', birthDate: null }]);
  });

  it('signale la troncature au-delà de la limite de fiches', () => {
    const card = ['BEGIN:VCARD', 'FN:Quelqu un', 'END:VCARD'].join('\n');
    const text = Array.from({ length: VCARD_MAX_CARDS + 5 }, () => card).join('\n');
    const result = parseVcf(text);
    expect(result.people).toHaveLength(VCARD_MAX_CARDS);
    expect(result.truncated).toBe(true);
  });

  it('rend un résultat vide propre pour un fichier vide', () => {
    expect(parseVcf('')).toEqual({ people: [], organizations: 0, invalid: 0, truncated: false });
  });

  it('ne meurt pas sur un texte qui ne contient aucune fiche', () => {
    expect(parseVcf('ceci n est pas un vcard')).toEqual({ people: [], organizations: 0, invalid: 0, truncated: false });
  });
});
