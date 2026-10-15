import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import type { PlaceRow } from '@/types';
import type { Place, PlaceInput } from './types';

export const PLACES_TABLE = 'places';

/**
 * Photos de lieux (D-04) : comme les pièces prestataires, la colonne
 * `photo_url` porte le CHEMIN bucket pour les nouveaux dépôts, et l'URL
 * courte est forgée à la lecture. Les `data:` hérités continuent de rendre
 * tels quels (aucun ré-upload forcé des lignes existantes) — avec leur
 * limite documentée : poids inline en base, aucune purge serveur possible.
 * RLS et politiques Storage inchangées : même bucket, même préfixe foyer.
 */
export const PLACES_BUCKET = 'household-media';
/** Courte (1 h) : même régime que les pièces prestataires. */
const PLACE_PHOTO_URL_TTL = 60 * 60;

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

/**
 * Charge d'une MODIFICATION (D-06) : `visited` est omis, jamais réinitialisé
 * — seule la bascule dédiée (`toVisitedPayload`) y touche. L'omission
 * préserve la valeur dans les deux adaptateurs (fusion à la mise à jour).
 */
export function toEditPlacePayload(input: PlaceInput, householdId: string): PlacePayload {
  const { visited: _omitted, ...payload } = toPlacePayload(input, householdId);
  return payload;
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
 * Vrai quand la valeur stockée est un chemin bucket à forger : ni URL
 * http(s) (saisie manuelle ou signée héritée), ni `data:` hérité, ni aperçu
 * local `blob:`, ni ressource applicative `/…`.
 */
export function isPlacePhotoPath(stored: string): boolean {
  return !/^(https?:\/\/|blob:|data:|\/)/i.test(stored);
}

/** Chemin bucket d'une valeur stockée, `null` pour les autres formes. */
export function placePhotoPathOf(stored: string | null): string | null {
  if (!stored) return null;
  return isPlacePhotoPath(stored) ? stored : null;
}

/**
 * Faut-il retirer l'objet de bucket de la photo précédente ? Décision pure,
 * extraite de `editPlace` pour être prouvable (WR-05).
 *
 * Le défaut d'origine : `editPlace` comparait `previous` (la valeur **stockée**,
 * un chemin bucket) au `photoUrl` du formulaire, qui était l'**URL signée
 * résolue** — deux grandeurs jamais égales sur un lieu photographié en mode
 * Supabase. La suppression se déclenchait donc à chaque enregistrement, même
 * sans toucher à la photo, et la colonne recevait l'URL signée.
 *
 * Verdict vrai seulement si la valeur précédente est un chemin bucket ET
 * diffère de la valeur suivante — un retrait (`nextStored` nul ou vide) en
 * fait partie, une valeur non-chemin (URL signée héritée, `data:`, `/…`,
 * `blob:`) n'est jamais un objet de bucket à retirer.
 */
export function shouldRemovePreviousPlacePhoto(
  previousStored: string | null,
  nextStored: string | null,
): boolean {
  // Une valeur précédente blanche n'est pas un objet de bucket : le reste du
  // module normalise déjà par `toNullable`, la décision fait de même.
  const previous = placePhotoPathOf(previousStored ? previousStored.trim() : null);
  if (!previous) return false;
  const next = (nextStored ?? '').trim();
  return next.length === 0 || next !== previous;
}

/**
 * Forge la photo affichable (forme invité 06-04 : échec fermé). Les formes
 * non-chemin rendent telles quelles — y compris les `data:` hérités — ; un
 * chemin se forge en URL courte ; tout échec de forge donne `null`.
 */
export async function resolvePlacePhotoUrl(stored: string | null): Promise<string | null> {
  if (!stored || !isPlacePhotoPath(stored)) return stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from(PLACES_BUCKET)
      .createSignedUrl(stored, PLACE_PHOTO_URL_TTL);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque photo en URL affichable, en une passe (échec fermé par lieu). */
export async function resolvePlacePhotoUrls(rows: { id: string; photo_url: string | null }[]): Promise<Record<string, string>> {
  const entries = await Promise.all(rows.map(async (row) => [row.id, await resolvePlacePhotoUrl(row.photo_url)] as const));
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

/**
 * Dépose la photo d'un lieu dans le bucket (`depositHouseholdFile` compresse
 * déjà les images, motif partagé) et renvoie la valeur à stocker : le chemin
 * en mode Supabase, l'aperçu local éphémère en démo.
 */
export async function uploadPlacePhoto(householdId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: 'places', file });
  return deposited.path ?? deposited.url;
}

/** Supprime le fichier d'une photo de lieu (no-op pour les autres formes). */
export async function deletePlacePhoto(stored: string | null): Promise<void> {
  const path = placePhotoPathOf(stored);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
