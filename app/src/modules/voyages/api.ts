/**
 * Accès aux données des Voyages via l'adaptateur actif (PostgREST + RLS en
 * ligne, IndexedDB hors ligne). Les tâches du foyer servent d'indicateur
 * « éléments à préparer », faute de liste de préparation dédiée.
 */

import { data } from '@/lib/data';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import type { TaskRow, TripRow } from '@/types';
import { DEFAULT_TRIP_COVER, type TripInput } from './types';

function requireHousehold(householdId: string | null): string {
  if (!householdId) throw new Error('Aucun foyer sélectionné.');
  return householdId;
}

/** Charge utile renvoyée à PostgreSQL (clés `snake_case`). */
export function toTripPayload(householdId: string, input: TripInput): Partial<TripRow> {
  return {
    household_id: householdId,
    name: input.name.trim(),
    destination: input.destination.trim() || input.name.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    cover_photo: input.coverPhoto || DEFAULT_TRIP_COVER,
    notes: input.notes.trim() || null,
  } as Partial<TripRow>;
}

export function listTrips(householdId: string | null): Promise<TripRow[]> {
  return data.list<TripRow>('trips', { household_id: requireHousehold(householdId) });
}

export function listTasks(householdId: string | null): Promise<TaskRow[]> {
  return data.list<TaskRow>('tasks', { household_id: requireHousehold(householdId) });
}

export interface TripMutationArgs {
  /** Identifiant préparé par l'appelant (publication optimiste). */
  id: string;
  householdId: string;
  input: TripInput;
}

export async function createTrip({ id, householdId, input }: TripMutationArgs): Promise<TripRow> {
  return data.create<TripRow>('trips', {
    id,
    ...toTripPayload(householdId, input),
    created_at: new Date().toISOString(),
  } as Partial<TripRow>);
}

export async function updateTrip({ id, householdId, input }: TripMutationArgs): Promise<TripRow> {
  return data.update<TripRow>('trips', id, toTripPayload(householdId, input) as Partial<TripRow>);
}

export function deleteTrip(id: string): Promise<void> {
  return data.remove('trips', id);
}

/**
 * Couverture téléversable (D-11) : comme les photos de lieux, la colonne
 * `cover_photo` porte le CHEMIN bucket pour les nouveaux dépôts, et l'URL
 * courte est forgée à la lecture. Les URL http(s) et les actifs `/…`
 * hérités rendent tels quels (aucun ré-upload forcé des lignes existantes).
 * RLS et politiques Storage inchangées : même bucket, même préfixe foyer
 * (0010 ne contraint que le premier segment du chemin).
 */
export const TRIP_COVERS_BUCKET = 'household-media';
/** Courte (1 h) : même régime que les photos de lieux et les pièces prestataires. */
const TRIP_COVER_URL_TTL = 60 * 60;

/**
 * Vrai quand la valeur stockée est un chemin bucket à forger : ni URL
 * http(s) (saisie manuelle ou signée héritée), ni aperçu local `blob:`, ni
 * ressource applicative `/…`, ni `data:` hérité.
 */
export function isTripCoverPath(stored: string): boolean {
  return !/^(https?:\/\/|blob:|data:|\/)/i.test(stored);
}

/** Chemin bucket d'une valeur stockée, `null` pour les autres formes. */
export function tripCoverPathOf(stored: string | null): string | null {
  if (!stored) return null;
  return isTripCoverPath(stored) ? stored : null;
}

/**
 * Forge la couverture affichable (forme invité 06-04 : échec fermé). Les
 * formes non-chemin rendent telles quelles ; un chemin se forge en URL
 * courte ; tout échec de forge donne `null` (jamais de lien mort vers le
 * héros — la garde D-06 ne rend alors aucune image).
 */
export async function resolveTripCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored || !isTripCoverPath(stored)) return stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from(TRIP_COVERS_BUCKET)
      .createSignedUrl(stored, TRIP_COVER_URL_TTL);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque couverture en URL affichable, en une passe (échec fermé par voyage). */
export async function resolveTripCoverUrls(rows: { id: string; cover_photo: string | null }[]): Promise<Record<string, string>> {
  const entries = await Promise.all(rows.map(async (row) => [row.id, await resolveTripCoverUrl(row.cover_photo)] as const));
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

/**
 * Dépose la couverture d'un voyage dans le bucket (`depositHouseholdFile`
 * compresse déjà les images, motif partagé) et renvoie la valeur à stocker :
 * le chemin en mode Supabase, l'aperçu local éphémère en démo.
 */
export async function uploadTripCover(householdId: string, tripId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `trips/${tripId}`, file });
  return deposited.path ?? deposited.url;
}

/** Supprime le fichier d'une couverture (no-op pour les autres formes). */
export async function deleteTripCover(stored: string | null): Promise<void> {
  const path = tripCoverPathOf(stored);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
