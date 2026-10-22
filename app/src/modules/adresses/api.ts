import { depositHouseholdFile, householdMediaPathOf, isHouseholdMediaPath, removeHouseholdFile, replacedMediaPath, resolveHouseholdMediaUrl, storedValueOf } from '@/lib/storage';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
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
 * Vrai quand la valeur stockée est un chemin bucket à forger.
 *
 * Le verdict est celui du helper PARTAGÉ (`lib/storage.ts`), jamais une copie
 * locale : la copie d'origine n'était pas ANCRÉE (`/(https?:\/\/|…)/` sans
 * `^`), donc une valeur comme `prefix/https://…` passait pour un chemin. Une
 * seule définition du verdict de forme média dans le dépôt (motif IN-03, déjà
 * appliqué à `recipeCoverPathOf`).
 */
export const isPlacePhotoPath = isHouseholdMediaPath;

/**
 * Chemin bucket d'une valeur stockée, `null` pour les autres formes.
 *
 * Délègue au helper partagé, qui ROGNE la valeur avant de juger : une chaîne
 * exclusivement blanche n'est pas un chemin (constat §5 des `deferred-items`
 * de la phase 18, annoncé fermé par 19-13 — il ne l'était pas).
 */
export function placePhotoPathOf(stored: string | null): string | null {
  return householdMediaPathOf(stored);
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
 * La règle n'existe plus ici qu'en délégation : elle vaut pour tous les médias
 * du foyer et vit dans `replacedMediaPath` (D-01), que les modules alignés par
 * la phase 19 appellent directement.
 */
export function shouldRemovePreviousPlacePhoto(
  previousStored: string | null,
  nextStored: string | null,
): boolean {
  return replacedMediaPath(previousStored, nextStored) !== null;
}

/**
 * Forge la photo affichable (forme invité 06-04 : échec fermé). Les formes
 * non-chemin rendent telles quelles — y compris les `data:` hérités — ; un
 * chemin se forge en URL courte ; tout échec de forge donne `null`.
 */
export async function resolvePlacePhotoUrl(stored: string | null): Promise<string | null> {
  if (!stored || !isPlacePhotoPath(stored)) return stored;
  // La signature passe par le point unique de la lecture (D-01) : seul l'appel
  // change de propriétaire, la TTL courte reste celle du module.
  return resolveHouseholdMediaUrl(stored, PLACE_PHOTO_URL_TTL);
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
  return storedValueOf(deposited);
}

/** Supprime le fichier d'une photo de lieu (no-op pour les autres formes). */
export async function deletePlacePhoto(stored: string | null): Promise<void> {
  const path = placePhotoPathOf(stored);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}

/** Un lieu suggéré par la recherche en ligne, prêt à remplir le formulaire. */
export interface PlaceSearchHit {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  /** Ligne complète lisible, telle que Nominatim la présente. */
  label: string;
}

/**
 * Recherche d'adresse en ligne, via le proxy Edge `place-search` (Nominatim).
 *
 * PAS de repli direct navigateur, à la différence de la recherche produit
 * (`searchOffCatalog`) : la politique d'usage de Nominatim exige un
 * User-Agent identifiant l'application, qu'un navigateur ne peut pas poser —
 * le repli contournerait la règle au lieu de l'énoncer. Le proxy est le
 * seul chemin ; son indisponibilité se dit (« indisponible pour le moment »),
 * la saisie à la main reste toujours possible.
 */
export async function searchPlacesOnline(query: string, limit = 5): Promise<PlaceSearchHit[]> {
  const terms = query.trim();
  // Une requête trop courte ne vaut même pas un coup d'œil à la configuration.
  if (terms.length < 3) return [];
  if (!isSupabaseConfigured || !supabaseFunctionsBase || !supabase) {
    throw new Error('La recherche en ligne demande un compte connecté : en démonstration, remplissez l’adresse à la main.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { data: authData } = await supabase.auth.getSession();
    const response = await fetch(`${supabaseFunctionsBase}/place-search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        ...(authData.session?.access_token ? { authorization: `Bearer ${authData.session.access_token}` } : {}),
      },
      body: JSON.stringify({ q: terms, limit }),
      signal: controller.signal,
    });
    if (response.status === 401) {
      // Session absente/expirée : withSupabase répond sans champ `error`.
      throw new Error('Session expirée : reconnectez-vous puis réessayez.');
    }
    if (response.status === 400 || response.status === 429) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(detail?.error ?? 'Recherche impossible.');
    }
    if (!response.ok) {
      throw new Error('La recherche d’adresse est indisponible pour le moment.');
    }
    const payload = (await response.json().catch(() => null)) as { hits?: unknown } | null;
    if (!payload || !Array.isArray(payload.hits)) {
      throw new Error('La recherche d’adresse est indisponible pour le moment.');
    }
    return (payload.hits as PlaceSearchHit[]).filter((hit) => hit && typeof hit.label === 'string' && hit.label.length > 0);
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error instanceof TypeError)) {
      throw new Error('La recherche d’adresse est indisponible pour le moment.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Application d'un hit au formulaire : la rue, le code postal et la ville
 * sont remplis ; le nom du lieu ne l'est que s'il est vide — ce que
 * l'utilisateur a déjà tapé n'est jamais écrasé. Décision pure, extraite du
 * dialogue pour être prouvable sans rendu.
 */
export function applyPlaceHit(
  hit: PlaceSearchHit,
  current: { name: string },
): { name?: string; street: string; postalCode: string; city: string } {
  const name = current.name.trim() === '' && hit.name ? hit.name : undefined;
  return {
    ...(name !== undefined ? { name } : {}),
    street: hit.street ?? '',
    postalCode: hit.postalCode ?? '',
    city: hit.city ?? '',
  };
}
