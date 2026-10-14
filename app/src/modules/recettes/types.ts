import type {
  RecipeCategoryRow,
  RecipeFavoriteRow,
  RecipeIngredientRow,
  RecipeRow,
  RecipeStepRow,
  RecipeTagLinkRow,
  RecipeTagRow,
} from '@/types';

export type {
  RecipeCategoryRow,
  RecipeFavoriteRow,
  RecipeIngredientRow,
  RecipeRow,
  RecipeStepRow,
  RecipeTagLinkRow,
  RecipeTagRow,
};

/** Nom de la categorie par defaut, semee par foyer (migration 0122). */
export const DEFAULT_RECIPE_CATEGORY = 'Recettes du foyer' as const;

/** Valeurs du curseur personnes : paires de 2 a 12 (D-06). */
export const SERVINGS_STEPS = [2, 4, 6, 8, 10, 12] as const;

/** 14 tags semes par foyer (SPEC R4). */
export const RECIPE_TAG_SEEDS = [
  'Apéro',
  'Entrée',
  'Plat',
  'Dessert',
  'Goûter',
  'Petit-déj',
  'Boissons',
  'Asie',
  'Italien',
  'Mexicain',
  'Oriental',
  'Pâtes',
  'Végétarien',
  'Poisson',
] as const;

export interface Recipe {
  id: string;
  householdId: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  coverPhoto: string | null;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
}

export interface RecipeStep {
  id: string;
  content: string;
  position: number;
}

export interface RecipeFormValues {
  title: string;
  categoryId: string;
  /** Nom d'une categorie a creer a la volee (« + Nouvelle categorie », D-08). */
  newCategoryName: string;
  servings: number;
  prepHours: number | null;
  prepMins: number | null;
  cookHours: number | null;
  cookMins: number | null;
  /** Pastilles : noms existants et/ou frappe libre creant le tag (D-09). */
  tags: string[];
  coverFile: File | null;
  /** Couverture deja stockee (chemin ou URL), conservee sans nouveau fichier. */
  existingCover: string | null;
}

/* ------------------------------------------------------------------ */
/* Scaler personnes (SPEC R8, D-06, D-07) : pur client, reversible.     */
/* ------------------------------------------------------------------ */

/** Arrondit la reference au pair le plus proche (3 → 4). */
export const roundToEven = (n: number): number => Math.round(n / 2) * 2;

/** Echelle du curseur la plus proche d'une reference (paires 2–12). */
export function closestServingsStep(reference: number): number {
  const even = Math.min(12, Math.max(2, roundToEven(reference)));
  return (SERVINGS_STEPS as readonly number[]).reduce((best, step) =>
    Math.abs(step - even) < Math.abs(best - even) ? step : best,
  );
}

/** `qte_affichee = qte_ref × (cible / base)` ; NULL = « au gout », intact. */
export function scaleQuantity(quantity: number | null, base: number, target: number): number | null {
  if (quantity === null || base <= 0) return quantity;
  const scaled = (quantity * target) / base;
  return Math.round(scaled * 100) / 100;
}

/** Affichage decimal (0.5, pas ½), sans zero superflu. */
export function formatQuantity(value: number | null): string | null {
  if (value === null) return null;
  return String(Math.round(value * 100) / 100);
}

/**
 * Accord simple de l'unite (+s/+x, D-07) : `oeuf → oeufs` au-dela de 1,
 * `noix → noix` (terminaison x invariable), unites deja marquees
 * (`pincée(s)`) et chaines vides inchangees.
 */
export function agreeUnit(unit: string | null, scaled: number | null): string | null {
  if (!unit || scaled === null) return unit;
  const trimmed = unit.trim();
  if (trimmed === '' || /[()]/.test(trimmed)) return unit;
  if (scaled <= 1) return trimmed.replace(/s$/i, '');
  if (/[sx]$/i.test(trimmed)) return trimmed;
  return `${trimmed}s`;
}

/** Temps total prepa + cuisson (`1h15`, `30 min`, null si rien). */
export function formatTotalTime(prepMinutes: number | null, cookMinutes: number | null): string | null {
  const total = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  if (prepMinutes == null && cookMinutes == null) return null;
  if (total <= 0) return null;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins === 0 ? `${hours}h` : `${hours}h${String(mins).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Recherche + filtres (SPEC R13, D-15) : cote client, NFD natif.       */
/* ------------------------------------------------------------------ */

/** Insensible aux accents : `gratin` trouve `Gratin`. */
export const stripRecipeDiacritics = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export interface RecipeSearchFilter {
  query: string;
  categoryId: string | null;
  tag: string | null;
  favoritesOnly: boolean;
}

/** Nom + ingredients + combinable categorie/tags/favoris. */
export function filterRecipes(
  recipes: Recipe[],
  ingredientsByRecipe: Record<string, RecipeIngredient[]>,
  filter: RecipeSearchFilter,
): Recipe[] {
  const query = stripRecipeDiacritics(filter.query.trim());
  return recipes.filter((recipe) => {
    if (filter.favoritesOnly && !recipe.isFavorite) return false;
    if (filter.categoryId !== null && recipe.categoryId !== filter.categoryId) return false;
    if (filter.tag !== null && !recipe.tags.includes(filter.tag)) return false;
    if (query === '') return true;
    const haystacks = [
      recipe.title,
      ...(ingredientsByRecipe[recipe.id] ?? []).map((ingredient) => ingredient.name),
    ];
    return haystacks.some((haystack) => stripRecipeDiacritics(haystack).includes(query));
  });
}

/* ------------------------------------------------------------------ */
/* Assemblage lignes → domaine.                                        */
/* ------------------------------------------------------------------ */

export function toRecipe(
  row: RecipeRow,
  context: { categoryName?: string | null; tags?: string[]; isFavorite?: boolean },
): Recipe {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    categoryId: row.category_id ?? null,
    categoryName: context.categoryName ?? DEFAULT_RECIPE_CATEGORY,
    servings: row.servings ?? 4,
    prepMinutes: row.prep_minutes ?? null,
    cookMinutes: row.cook_minutes ?? null,
    coverPhoto: row.cover_photo ?? null,
    tags: context.tags ?? [],
    isFavorite: context.isFavorite ?? false,
    createdAt: row.created_at,
  };
}

export const toIngredient = (row: RecipeIngredientRow): RecipeIngredient => ({
  id: row.id,
  name: row.name,
  quantity: row.quantity,
  unit: row.unit,
  position: row.position,
});

export const toStep = (row: RecipeStepRow): RecipeStep => ({
  id: row.id,
  content: row.content,
  position: row.position,
});
