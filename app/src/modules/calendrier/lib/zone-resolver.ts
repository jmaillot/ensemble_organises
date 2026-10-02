/**
 * Résolution zone scolaire depuis la ville du profil.
 *
 * Chaîne : `profiles.city` -> géocodage Open-Meteo (code postal) ->
 * département (2 premiers chiffres) -> table statique académies -> zone.
 *
 * La table reflète le découpage public A/B/C (rentrée 2026) :
 *   A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers ;
 *   B : Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice,
 *       Orléans-Tours, Reims, Rennes, Rouen, Strasbourg ;
 *   C : Paris, Versailles, Créteil, Montpellier, Toulouse.
 * Corse (2A/2B) et outre-mer (97x/98x) : calendriers propres, pas de suggestion.
 *
 * Le résultat est une SUGGESTION à confirmer (sélecteur manuel conservé) :
 * une erreur de table ne bloque jamais, elle se corrige en un clic.
 */

import type { SchoolZone } from '../hooks/use-ref-days';

const A = 'A' as const;
const B = 'B' as const;
const C = 'C' as const;

/** Département (2 chiffres, Corse `2A`/`2B` incluse) -> zone, ou absent si calendrier propre. */
const DEPT_TO_ZONE: Record<string, SchoolZone> = {
  // Zone A — Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers.
  '25': A, '39': A, '70': A, '90': A,
  '24': A, '33': A, '40': A, '47': A, '64': A,
  '03': A, '15': A, '43': A, '63': A,
  '21': A, '58': A, '71': A, '89': A,
  '07': A, '26': A, '38': A, '73': A, '74': A,
  '19': A, '23': A, '87': A,
  '01': A, '42': A, '69': A,
  '16': A, '17': A, '79': A, '86': A,
  // Zone B — Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice,
  // Orléans-Tours, Reims, Rennes, Rouen, Strasbourg.
  '04': B, '05': B, '13': B, '84': B,
  '02': B, '60': B, '80': B,
  '14': B, '50': B, '61': B,
  '59': B, '62': B,
  '54': B, '55': B, '57': B, '88': B,
  '44': B, '49': B, '53': B, '72': B, '85': B,
  '06': B, '83': B,
  '18': B, '28': B, '36': B, '37': B, '41': B, '45': B,
  '08': B, '10': B, '51': B, '52': B,
  '22': B, '29': B, '35': B, '56': B,
  '27': B, '76': B,
  '67': B, '68': B,
  // Zone C — Paris, Versailles, Créteil, Montpellier, Toulouse.
  '75': C,
  '78': C, '91': C, '92': C, '95': C,
  '77': C, '93': C, '94': C,
  '11': C, '30': C, '34': C, '48': C, '66': C,
  '09': C, '12': C, '31': C, '32': C, '46': C, '65': C, '81': C, '82': C,
};

/** Code postal (5 chiffres ou `2Axxx`) -> zone, ou null (Corse, outre-mer, inconnu). */
export function resolveZoneFromPostcode(postcode: string): SchoolZone | null {
  const normalized = postcode.trim().toUpperCase().replace(/[\s-]/g, '');
  const dept = normalized.slice(0, 2);
  if (!/^(2[AB]|\d{2})$/.test(dept)) return null;
  return DEPT_TO_ZONE[dept] ?? null;
}

interface GeocodePlace {
  country_code?: string;
  postcodes?: string[];
}

interface GeocodeResponse {
  results?: GeocodePlace[];
}

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Suggère la zone depuis un nom de ville (premier résultat France avec code postal).
 * Lève une erreur lisible si rien n'est résolu (ville inconnue, hors France, calendrier propre).
 */
export async function suggestZoneForCity(city: string, signal?: AbortSignal): Promise<{ zone: SchoolZone; postcode: string }> {
  const name = city.trim();
  if (name === '') throw new Error('Indiquez une ville dans votre profil.');
  const params = new URLSearchParams({ name, count: '5', language: 'fr', format: 'json' });
  const response = await fetch(`${GEOCODE_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Géocodage indisponible (${response.status}).`);
  const json = (await response.json()) as GeocodeResponse;
  const place = (json.results ?? []).find((result) => result.country_code === 'FR' && (result.postcodes?.length ?? 0) > 0);
  if (!place?.postcodes?.length) throw new Error(`Ville introuvable en France : ${name}.`);
  // Le premier code postal du lieu suffit : une ville ne chevauche qu'exceptionnellement deux zones.
  const postcode = place.postcodes[0];
  const zone = resolveZoneFromPostcode(postcode);
  if (!zone) throw new Error('Calendrier scolaire spécifique : choisissez la zone à la main.');
  return { zone, postcode };
}
