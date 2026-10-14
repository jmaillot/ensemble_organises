import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import type {
  RecipeCategoryRow,
  RecipeFavoriteRow,
  RecipeIngredientRow,
  RecipeRow,
  RecipeStepRow,
  RecipeTagLinkRow,
  RecipeTagRow,
} from '@/types';
import { type RecipeFormValues } from './types';

export const RECIPES_TABLE = 'recipes';
export const RECIPE_CATEGORIES_TABLE = 'recipe_categories';
export const RECIPE_TAGS_TABLE = 'recipe_tags';
export const RECIPE_TAG_LINKS_TABLE = 'recipe_tag_links';
export const RECIPE_INGREDIENTS_TABLE = 'recipe_ingredients';
export const RECIPE_STEPS_TABLE = 'recipe_steps';
export const RECIPE_FAVORITES_TABLE = 'recipe_favorites';

/** TTL court des URL signees de couverture (T-16-07, echec ferme). */
export const RECIPE_COVER_URL_TTL = 3600;

/**
 * Écritures du module. Les lectures passent par `useResource`
 * (`src/lib/data/useResource.ts`), qui filtre sur le foyer courant ; seules
 * les écritures propres au domaine sont ici. `household_id` est renseigné
 * explicitement : la RLS reste la seule barrière d'autorisation côté
 * serveur. Chaque mutation porte la garde enfant (R10, motif tâches).
 */

export async function createRecipeCategory(householdId: string, name: string): Promise<RecipeCategoryRow> {
  return data.create<RecipeCategoryRow>(RECIPE_CATEGORIES_TABLE, {
    household_id: householdId,
    name: name.trim(),
  });
}

export async function renameRecipeCategory(id: string, name: string): Promise<RecipeCategoryRow> {
  return data.update<RecipeCategoryRow>(RECIPE_CATEGORIES_TABLE, id, { name: name.trim() });
}

/**
 * Supprime une categorie : le trigger serveur `reassign_recipe_category`
 * re-assignne les recettes pleines vers `Recettes du foyer` (R2) ; une
 * categorie vide part en DELETE direct.
 */
export async function deleteRecipeCategory(id: string): Promise<void> {
  await data.remove(RECIPE_CATEGORIES_TABLE, id);
}

export async function createRecipeTag(householdId: string, name: string): Promise<RecipeTagRow> {
  return data.create<RecipeTagRow>(RECIPE_TAGS_TABLE, { household_id: householdId, name: name.trim() });
}

export async function renameRecipeTag(id: string, name: string): Promise<RecipeTagRow> {
  return data.update<RecipeTagRow>(RECIPE_TAGS_TABLE, id, { name: name.trim() });
}

/** Supprimer un tag ne detruit que ses liens (FK cascade, R4). */
export async function deleteRecipeTag(id: string): Promise<void> {
  await data.remove(RECIPE_TAGS_TABLE, id);
}

/**
 * Remplace les tags d'une recette. La table de liens n'a pas de colonne
 * `id` : on repart de la liste existante (motif `setTaskAssignees`).
 * La frappe libre cree le tag manquant avant le lien (D-09).
 */
export async function setRecipeTags(recipeId: string, householdId: string, tagNames: string[]): Promise<void> {
  const names = [...new Set(tagNames.map((name) => name.trim()).filter((name) => name !== ''))];
  const existing = await data.list<RecipeTagRow>(RECIPE_TAGS_TABLE, { household_id: householdId });
  const byName = new Map(existing.map((tag) => [tag.name.toLocaleLowerCase('fr'), tag]));
  const tags: RecipeTagRow[] = [];
  for (const name of names) {
    const found = byName.get(name.toLocaleLowerCase('fr'));
    if (found) tags.push(found);
    else {
      const created = await createRecipeTag(householdId, name);
      byName.set(name.toLocaleLowerCase('fr'), created);
      tags.push(created);
    }
  }
  await data.removeWhere(RECIPE_TAG_LINKS_TABLE, { recipe_id: recipeId });
  await Promise.all(
    tags.map((tag) =>
      data.create<RecipeTagLinkRow>(RECIPE_TAG_LINKS_TABLE, {
        recipe_id: recipeId,
        household_id: householdId,
        tag_id: tag.id,
      }),
    ),
  );
}

export interface RecipePayload {
  title: string;
  category_id: string | null;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  cover_photo: string | null;
}

/** Transforme la saisie du dialogue en ligne `recipes` (nom 1–200, R3). */
export function toRecipePayload(values: RecipeFormValues, extra: { categoryId: string | null; coverPhoto: string | null }): RecipePayload {
  const prep = (values.prepHours ?? 0) * 60 + (values.prepMins ?? 0);
  const cook = (values.cookHours ?? 0) * 60 + (values.cookMins ?? 0);
  return {
    title: values.title.trim(),
    category_id: extra.categoryId,
    servings: values.servings,
    prep_minutes: prep > 0 ? prep : null,
    cook_minutes: cook > 0 ? cook : null,
    cover_photo: extra.coverPhoto,
  };
}

/** Ingredients d'un ensemble de recettes, tries par position. */
export async function listRecipeIngredients(recipeIds: string[]): Promise<RecipeIngredientRow[]> {
  if (recipeIds.length === 0) return [];
  const rows = await data.list<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, { recipe_id: recipeIds });
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Etapes d'un ensemble de recettes, triees par position. */
export async function listRecipeSteps(recipeIds: string[]): Promise<RecipeStepRow[]> {
  if (recipeIds.length === 0) return [];
  const rows = await data.list<RecipeStepRow>(RECIPE_STEPS_TABLE, { recipe_id: recipeIds });
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Liens tags d'un ensemble de recettes. */
export async function listRecipeTagLinks(recipeIds: string[]): Promise<RecipeTagLinkRow[]> {
  if (recipeIds.length === 0) return [];
  return data.list<RecipeTagLinkRow>(RECIPE_TAG_LINKS_TABLE, { recipe_id: recipeIds });
}

/** Favoris du membre courant sur un ensemble de recettes. */
export async function listRecipeFavorites(recipeIds: string[], memberId: string): Promise<RecipeFavoriteRow[]> {
  if (recipeIds.length === 0 || memberId === '') return [];
  return data.list<RecipeFavoriteRow>(RECIPE_FAVORITES_TABLE, { recipe_id: recipeIds, member_id: memberId });
}

/** Bascule le favori du membre sur une recette (coeur carte, R13). */
export async function toggleRecipeFavorite(recipeId: string, householdId: string, memberId: string, active: boolean): Promise<void> {
  if (active) {
    await data.create<RecipeFavoriteRow>(RECIPE_FAVORITES_TABLE, {
      recipe_id: recipeId,
      household_id: householdId,
      member_id: memberId,
    });
  } else {
    await data.removeWhere(RECIPE_FAVORITES_TABLE, { recipe_id: recipeId, member_id: memberId });
  }
}

export async function createRecipeIngredient(input: {
  recipeId: string;
  householdId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
}): Promise<RecipeIngredientRow> {
  return data.create<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, {
    recipe_id: input.recipeId,
    household_id: input.householdId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    position: input.position,
  });
}

export async function updateRecipeIngredient(
  id: string,
  input: { name: string; quantity: number | null; unit: string | null },
): Promise<RecipeIngredientRow> {
  return data.update<RecipeIngredientRow>(RECIPE_INGREDIENTS_TABLE, id, {
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
  });
}

export async function deleteRecipeIngredient(id: string): Promise<void> {
  await data.remove(RECIPE_INGREDIENTS_TABLE, id);
}

export async function createRecipeStep(input: {
  recipeId: string;
  householdId: string;
  content: string;
  position: number;
}): Promise<RecipeStepRow> {
  return data.create<RecipeStepRow>(RECIPE_STEPS_TABLE, {
    recipe_id: input.recipeId,
    household_id: input.householdId,
    content: input.content.trim(),
    position: input.position,
  });
}

export async function updateRecipeStep(id: string, content: string): Promise<RecipeStepRow> {
  return data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, id, { content: content.trim() });
}

export async function deleteRecipeStep(id: string): Promise<void> {
  await data.remove(RECIPE_STEPS_TABLE, id);
}

/**
 * Renumerotation serveur dense a chaque reorder (T-16-08) : les positions
 * sont reecrites 0..n sans doublon ni trou.
 */
export async function reorderRecipeSteps(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, position) => data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, id, { position })));
}

/**
 * Supprime une recette puis sa couverture : le SQL en cascade ne touche
 * pas le Storage (R9). Best-effort sans masquer l'erreur d'origine.
 */
export async function deleteRecipe(id: string, coverPhoto: string | null): Promise<void> {
  await data.remove(RECIPES_TABLE, id);
  const path = recipeCoverPathOf(coverPhoto);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Couverture (R9) : bucket prive + URL signee TTL court + cleanup.     */
/* ------------------------------------------------------------------ */

function isRecipeCoverPath(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value === '') return false;
  return !/^(https?:|blob:|data:|\/)/i.test(value);
}

/** Chemin bucket d'une couverture stockee, `null` sinon (jamais d'URL). */
export function recipeCoverPathOf(stored: string | null | undefined): string | null {
  return isRecipeCoverPath(stored) ? stored : null;
}

/** Depose la couverture (`recipes/<id>`, compression native partagee). */
export async function uploadRecipeCover(householdId: string, recipeId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}`, file });
  return deposited.path ?? deposited.url;
}

/** Supprime le fichier d'une couverture (no-op hors chemin bucket). */
export function deleteRecipeCover(stored: string | null): Promise<void> {
  const path = recipeCoverPathOf(stored);
  if (path) return removeHouseholdFile(path).catch(() => undefined);
  return Promise.resolve();
}

/**
 * Forge la couverture affichable (echec ferme, T-16-07) : les formes
 * non-chemin (apercu demo `blob:`, actif `/assets`) rendent telles quelles ;
 * un chemin se forge en URL signee ; tout echec donne `null`, jamais de
 * lien mort.
 */
export async function resolveRecipeCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isRecipeCoverPath(stored)) {
    return /^blob:|^https?:|^data:|^\/assets\//i.test(stored) ? stored : null;
  }
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from('household-media')
      .createSignedUrl(stored, RECIPE_COVER_URL_TTL);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque couverture en une passe (echec ferme par recette). */
export async function resolveRecipeCoverUrls(
  rows: { id: string; cover_photo?: string | null }[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    rows.map(async (row) => [row.id, await resolveRecipeCoverUrl(row.cover_photo ?? null)] as const),
  );
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

export type { RecipeRow };
