import type { PlaceRow } from '@/types';
import type { Place, PlaceInput } from './types';

export const PLACES_TABLE = 'places';

export type PlacePayload = Partial<PlaceRow>;

/** Transforme la saisie du dialogue en ligne `places`. */
export function toPlacePayload(input: PlaceInput, householdId: string): PlacePayload {
  return {
    household_id: householdId,
    type: input.type,
    photo_url: input.photoUrl,
    name: input.name.trim(),
    street: input.street,
    postal_code: input.postalCode,
    city: input.city,
    phone: input.phone,
    rating: input.rating,
    visited: false,
    note: input.note,
  };
}

/** Bascule optimiste « Déjà visité ». */
export function toVisitedPayload(visited: boolean): PlacePayload {
  return { visited };
}

export interface PlaceMetrics {
  total: number;
  visited: number;
  todo: number;
  averageRating: number;
}

export function placeMetrics(places: Place[]): PlaceMetrics {
  const rated = places.filter((place) => place.rating > 0);
  return {
    total: places.length,
    visited: places.filter((place) => place.visited).length,
    todo: places.filter((place) => !place.visited).length,
    averageRating:
      rated.length === 0 ? 0 : rated.reduce((total, place) => total + place.rating, 0) / rated.length,
  };
}

/**
 * Compression d'une photo avant enregistrement : `createImageBitmap` puis
 * `canvas`, en WebP lorsque le navigateur le produit, JPEG sinon.
 *
 * Le résultat est une donnée locale (`data:`) : elle fonctionne en mode local
 * et hors ligne. En mode Supabase, ce même point d’entrée devra téléverser le
 * fichier vers le bucket Storage et ne conserver que l’URL renvoyée.
 */
export async function compressPlacePhoto(file: File, maxEdge = 1280): Promise<string> {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('La compression d’image n’est pas disponible sur cet appareil. Utilisez une URL de photo.');
  }
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Impossible de préparer la photo.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.82);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', 0.85);
}
