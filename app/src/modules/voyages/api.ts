/**
 * Accès aux données des Voyages via l'adaptateur actif (PostgREST + RLS en
 * ligne, IndexedDB hors ligne). Les tâches du foyer servent d'indicateur
 * « éléments à préparer », faute de liste de préparation dédiée.
 */

import { data } from '@/lib/data';
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
