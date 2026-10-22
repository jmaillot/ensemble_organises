import { describe, expect, it } from 'vitest';
import { parseNominatimSearch } from './nominatim';

/**
 * Lecture de la réponse Nominatim `format=jsonv2&addressdetails=1`.
 * Les réponses recopiées ci-dessous reprennent la forme publiée par
 * Nominatim : `name` peut manquer (l'entrée porte alors le premier segment
 * de `display_name`), `address` regroupe rue, code postal et ville dans des
 * clés variables selon le type de lieu.
 */

const adresseComplete = {
  place_id: 123,
  osm_type: 'way',
  osm_id: 456,
  lat: '45.76',
  lon: '4.83',
  category: 'amenity',
  type: 'cafe',
  place_rank: 30,
  importance: 0.3,
  addresstype: 'cafe',
  name: 'Le Café du Matin',
  display_name: 'Le Café du Matin, 12 rue des Tilleuls, 69006 Lyon, Métropole de Lyon, France',
  address: {
    house_number: '12',
    road: 'rue des Tilleuls',
    postcode: '69006',
    city: 'Lyon',
    country: 'France',
    country_code: 'fr',
  },
};

describe('parseNominatimSearch', () => {
  it('lit une adresse complète : nom, rue, code postal, ville, ligne lisible', () => {
    const hits = parseNominatimSearch([adresseComplete]);
    expect(hits).toEqual([
      {
        name: 'Le Café du Matin',
        street: '12 rue des Tilleuls',
        postalCode: '69006',
        city: 'Lyon',
        label: 'Le Café du Matin, 12 rue des Tilleuls, 69006 Lyon, Métropole de Lyon, France',
      },
    ]);
  });

  it('sans `name`, le premier segment de display_name nomme le lieu', () => {
    const hits = parseNominatimSearch([
      { ...adresseComplete, name: undefined, display_name: '12 rue des Tilleuls, 69006 Lyon, France' },
    ]);
    expect(hits?.[0]?.name).toBe('12 rue des Tilleuls');
  });

  it('un village passe par `village`, pas par `city`', () => {
    const hits = parseNominatimSearch([
      {
        display_name: 'Place du Marché, 07110 Saint-Péray, France',
        address: { road: 'Place du Marché', postcode: '07110', village: 'Saint-Péray' },
      },
    ]);
    expect(hits?.[0]?.city).toBe('Saint-Péray');
    expect(hits?.[0]?.street).toBe('Place du Marché');
  });

  it('numéro en fin de rue : la forme française remet le numéro devant', () => {
    const hits = parseNominatimSearch([
      {
        display_name: 'rue des Tilleuls 12, Lyon, France',
        address: { road: 'rue des Tilleuls', house_number: '12', city: 'Lyon' },
      },
    ]);
    expect(hits?.[0]?.street).toBe('12 rue des Tilleuls');
  });

  it('un lieu sans rue porte seulement son nom et sa ville', () => {
    const hits = parseNominatimSearch([
      { display_name: 'Parc de la Tête d’Or, 69006 Lyon, France', address: { postcode: '69006', city: 'Lyon' } },
    ]);
    expect(hits?.[0]).toMatchObject({ name: 'Parc de la Tête d’Or', street: null, city: 'Lyon' });
  });

  it('une valeur trop longue est tronquée aux bornes du formulaire', () => {
    const longName = 'Un nom de lieu particulièrement long '.repeat(4);
    const hits = parseNominatimSearch([
      { display_name: longName, address: { city: 'Lyon' } },
    ]);
    expect(hits?.[0]?.name?.length).toBeLessThanOrEqual(80);
    expect(hits?.[0]?.name?.endsWith('…')).toBe(true);
  });

  it('un élément sans display_name est écarté, pas fatal', () => {
    const hits = parseNominatimSearch([{ place_id: 1 }, adresseComplete]);
    expect(hits).toHaveLength(1);
    expect(hits?.[0]?.name).toBe('Le Café du Matin');
  });

  it('une réponse de forme inattendue rend null, jamais du bruit', () => {
    expect(parseNominatimSearch(null)).toBeNull();
    expect(parseNominatimSearch('erreur interne')).toBeNull();
    expect(parseNominatimSearch({ error: 'Unable to geocode' })).toBeNull();
    expect(parseNominatimSearch([])).toEqual([]);
  });
});
