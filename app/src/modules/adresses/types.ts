import type { IconName } from '@/components/shared/icon';
import type { PlaceRow, PlaceType } from '@/types';

export type { PlaceType };

/** Type de lieu de l'export, dans l'ordre du formulaire d'origine. */
export const placeTypes: ReadonlyArray<{ value: PlaceType; label: string; icon: IconName }> = [
  { value: 'restaurant', label: 'Restaurant', icon: 'utensils' },
  { value: 'cafe', label: 'Café', icon: 'sun' },
  { value: 'bar', label: 'Bar', icon: 'utensils' },
  { value: 'hotel', label: 'Hôtel', icon: 'home' },
  { value: 'boutique', label: 'Boutique', icon: 'gift' },
  { value: 'parc', label: 'Parc', icon: 'sun' },
  { value: 'musee', label: 'Musée', icon: 'grid' },
  { value: 'cinema', label: 'Cinéma', icon: 'image' },
  { value: 'theatre', label: 'Théâtre', icon: 'flag' },
  { value: 'bien_etre', label: 'Bien-être', icon: 'heart' },
  { value: 'lieu_phare', label: 'Lieu phare', icon: 'star' },
  { value: 'tourisme', label: 'Tourisme', icon: 'map' },
  { value: 'autre', label: 'Autre', icon: 'pin' },
];

export const placeTypeLabel: Record<PlaceType, string> = Object.fromEntries(
  placeTypes.map((option) => [option.value, option.label]),
) as Record<PlaceType, string>;

export const placeTypeIcon: Record<PlaceType, IconName> = Object.fromEntries(
  placeTypes.map((option) => [option.value, option.icon]),
) as Record<PlaceType, IconName>;

export function isPlaceType(value: unknown): value is PlaceType {
  return placeTypes.some((option) => option.value === value);
}

/** Type métier d'un lieu enregistré. */
export interface Place {
  id: string;
  type: PlaceType;
  typeLabel: string;
  photoUrl: string | null;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  /** Note de 1 à 5 ; 0 signifie « pas encore notée ». */
  rating: number;
  visited: boolean;
  note: string | null;
  createdAt: string;
  /** « 12 rue des Tilleuls, 69006 Lyon », ou le nom seul si rien d'autre. */
  addressLine: string;
}

export interface PlaceInput {
  name: string;
  type: PlaceType;
  rating: number;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  note: string | null;
  photoUrl: string | null;
}

function toNullable(value: string | null | undefined): string | null {
  const clean = (value ?? '').trim();
  return clean.length > 0 ? clean : null;
}

export function toAddressLine(parts: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const street = toNullable(parts.street);
  const postalCode = toNullable(parts.postalCode);
  const city = toNullable(parts.city);
  const tail = [postalCode, city].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}

export function toPlace(row: PlaceRow): Place {
  const type = isPlaceType(row.type) ? row.type : 'autre';
  const rating = typeof row.rating === 'number' ? Math.min(5, Math.max(0, Math.round(row.rating))) : 0;
  return {
    id: row.id,
    type,
    typeLabel: placeTypeLabel[type],
    photoUrl: toNullable(row.photo_url),
    name: row.name,
    street: toNullable(row.street),
    postalCode: toNullable(row.postal_code),
    city: toNullable(row.city),
    phone: toNullable(row.phone),
    rating,
    visited: Boolean(row.visited),
    note: toNullable(row.note),
    createdAt: row.created_at,
    addressLine: toAddressLine({ street: row.street, postalCode: row.postal_code, city: row.city }) || 'Adresse non renseignée',
  };
}

export type PlaceVisitFilter = 'all' | 'todo' | 'done';

export interface PlaceFilters {
  query: string;
  type: PlaceType | 'all';
  visit: PlaceVisitFilter;
  /** Note minimale exigée ; 0 pour ne pas filtrer. */
  minRating: number;
}

export const emptyPlaceFilters: PlaceFilters = { query: '', type: 'all', visit: 'all', minRating: 0 };

export function isPlaceFilterActive(filters: PlaceFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.type !== 'all' ||
    filters.visit !== 'all' ||
    filters.minRating > 0
  );
}

export function filterPlaces(places: Place[], filters: PlaceFilters): Place[] {
  const query = filters.query.trim().toLocaleLowerCase('fr');
  return places.filter((place) => {
    if (query.length > 0) {
      const haystack = `${place.name} ${place.city ?? ''} ${place.addressLine}`.toLocaleLowerCase('fr');
      if (!haystack.includes(query)) return false;
    }
    if (filters.type !== 'all' && place.type !== filters.type) return false;
    if (filters.visit === 'todo' && place.visited) return false;
    if (filters.visit === 'done' && !place.visited) return false;
    if (filters.minRating > 0 && place.rating < filters.minRating) return false;
    return true;
  });
}

/** Regroupement géographique de la vue « carte ». */
export function groupPlacesByCity(places: Place[]): { city: string; places: Place[] }[] {
  const groups = new Map<string, Place[]>();
  for (const place of places) {
    const city = place.city ?? 'Sans ville';
    const list = groups.get(city) ?? [];
    list.push(place);
    groups.set(city, list);
  }
  return [...groups.entries()]
    .map(([city, list]) => ({ city, places: list }))
    .sort((a, b) => a.city.localeCompare(b.city, 'fr'));
}

export function averagePlaceRating(places: Place[]): number {
  const rated = places.filter((place) => place.rating > 0);
  if (rated.length === 0) return 0;
  return rated.reduce((total, place) => total + place.rating, 0) / rated.length;
}

/** Étoiles pleines / vides, 1 à 5. */
export function ratingStars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}
