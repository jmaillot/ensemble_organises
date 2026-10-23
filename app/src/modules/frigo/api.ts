import { data } from '@/lib/data';
import type { PantryItemRow } from '@/types';
import { formValuesToRow, type PantryFormValues } from './types';

/**
 * Accès aux articles du frigo (`pantry_items`, migration 0141). Tout passe
 * par l'adaptateur de données, donc par la RLS côté Supabase : lecture pour
 * les membres du foyer, écriture pour admin et membre, jamais pour le rôle
 * `enfant`.
 */

const TABLE = 'pantry_items';

export function fetchPantryItems(householdId: string): Promise<PantryItemRow[]> {
  return data.list<PantryItemRow>(TABLE, { household_id: householdId });
}

export async function createPantryItem(values: PantryFormValues, householdId: string): Promise<PantryItemRow> {
  return data.create<PantryItemRow>(TABLE, { ...formValuesToRow(values), household_id: householdId });
}

export async function updatePantryItem(id: string, values: PantryFormValues): Promise<PantryItemRow> {
  return data.update<PantryItemRow>(TABLE, id, formValuesToRow(values));
}

export async function removePantryItem(id: string): Promise<void> {
  await data.remove(TABLE, id);
}
