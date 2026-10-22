import { data } from '@/lib/data';
import type { MealEntryRow } from '@/types';
import { listRecipeIngredients, sendRecipeIngredientsToCourses } from '@/modules/recettes/api';
import { formValuesToRow, type MealFormValues } from './types';

/**
 * Accès aux repas du menu (`meal_entries`, migration 0142) et génération de
 * la liste de courses. Tout passe par l'adaptateur de données, donc par la
 * RLS côté Supabase : lecture pour les membres du foyer, écriture pour admin
 * et membre, jamais pour le rôle `enfant`.
 */

const TABLE = 'meal_entries';

export function fetchMealEntries(householdId: string): Promise<MealEntryRow[]> {
  return data.list<MealEntryRow>(TABLE, { household_id: householdId });
}

export async function createMealEntry(values: MealFormValues, householdId: string): Promise<MealEntryRow> {
  return data.create<MealEntryRow>(TABLE, { ...formValuesToRow(values), household_id: householdId });
}

export async function updateMealEntry(id: string, values: MealFormValues): Promise<MealEntryRow> {
  return data.update<MealEntryRow>(TABLE, id, formValuesToRow(values));
}

export async function removeMealEntry(id: string): Promise<void> {
  await data.remove(TABLE, id);
}

export interface CoursesGenerationInput {
  householdId: string;
  listId: string;
  addedBy: string | null;
  /** Repas-recette de la semaine (les repas-texte n'ont rien à envoyer). */
  entries: { recipeId: string; servings: number }[];
  /** Portions de référence de chaque recette du foyer. */
  recipeServings: Record<string, number>;
}

export interface CoursesGenerationResult {
  createdCount: number;
  mergedCount: number;
  lines: number;
}

/**
 * Génère la liste de courses de la semaine : pour chaque repas-recette du
 * menu, les ingrédients sont mis à l'échelle sur les portions du repas puis
 * poussés vers la liste — le moteur d'envoi Recettes → Courses fusionne et
 * incrémente les lignes existantes (dédoublonnage compris entre deux appels :
 * chaque appel relit la liste avant d'écrire).
 */
export async function generateCoursesFromWeek(input: CoursesGenerationInput): Promise<CoursesGenerationResult> {
  // Une passe par repas : deux repas de la même recette s'additionnent dans
  // la liste (chaque appel relit la liste avant d'écrire, donc les doublons
  // s'incrémentent sur la même ligne au lieu de se dupliquer).
  let createdCount = 0;
  let mergedCount = 0;
  let lines = 0;
  for (const entry of input.entries) {
    const baseServings = input.recipeServings[entry.recipeId];
    if (!baseServings || baseServings <= 0) continue;
    const ingredients = await listRecipeIngredients([entry.recipeId]);
    if (ingredients.length === 0) continue;
    const sent = await sendRecipeIngredientsToCourses({
      householdId: input.householdId,
      listId: input.listId,
      addedBy: input.addedBy,
      ingredients: ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      })),
      baseServings,
      targetServings: entry.servings,
    });
    createdCount += sent.createdCount;
    mergedCount += sent.mergedCount;
    lines += sent.rows.length;
  }
  return { createdCount, mergedCount, lines };
}
