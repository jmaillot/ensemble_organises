import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import { NEW_CATEGORY_VALUE } from '../components/recipe-form-dialog';
import type { HouseholdMemberRow, RecipeCategoryRow, RecipeRow, RecipeTagRow } from '@/types';
import {
  RECIPES_TABLE,
  RECIPE_CATEGORIES_TABLE,
  RECIPE_FAVORITES_TABLE,
  RECIPE_INGREDIENTS_TABLE,
  RECIPE_STEPS_TABLE,
  RECIPE_TAGS_TABLE,
  RECIPE_TAG_LINKS_TABLE,
  createRecipeCategory,
  deleteRecipe,
  deleteRecipeCover,
  listRecipeFavorites,
  listRecipeIngredients,
  listRecipeSteps,
  listRecipeTagLinks,
  reorderRecipeSteps,
  setRecipeTags,
  toRecipePayload,
  toggleRecipeFavorite,
  uploadRecipeCover,
} from '../api';
import {
  DEFAULT_RECIPE_CATEGORY,
  toIngredient,
  toRecipe,
  toStep,
  type Recipe,
  type RecipeFormValues,
  type RecipeIngredient,
  type RecipeStep,
  type RecipeSearchFilter,
  filterRecipes,
} from '../types';

export interface UseRecettesResult {
  recipes: Recipe[];
  visibleRecipes: Recipe[];
  categories: RecipeCategoryRow[];
  tags: RecipeTagRow[];
  ingredientsByRecipe: Record<string, RecipeIngredient[]>;
  stepsByRecipe: Record<string, RecipeStep[]>;
  members: HouseholdMemberRow[];
  currentMemberId: string;
  /** Faux pour le rôle `enfant` (lecture seule, R10). */
  canWrite: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  saveRecipe: (recipe: Recipe | null, values: RecipeFormValues) => Promise<Recipe>;
  removeRecipe: (recipe: Recipe) => Promise<void>;
  toggleFavorite: (recipe: Recipe) => Promise<void>;
  reorderSteps: (recipeId: string, orderedIds: string[]) => Promise<void>;
  refreshChildren: () => Promise<void>;
}

export const EMPTY_RECIPE_FILTER: RecipeSearchFilter = {
  query: '',
  categoryId: null,
  tag: null,
  favoritesOnly: false,
};

/** Données du module Recettes : recettes, categorie/tags, enfants + favoris. */
export function useRecettes(filter: RecipeSearchFilter = EMPTY_RECIPE_FILTER): UseRecettesResult {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const householdId = useHouseholdStore((state) => state.householdId);

  const canWrite = currentMember?.role !== 'enfant';
  const categoriesResource = useResource<RecipeCategoryRow>(RECIPE_CATEGORIES_TABLE);
  const tagsResource = useResource<RecipeTagRow>(RECIPE_TAGS_TABLE);
  const { rows, isLoading, isError, error, refetch, create, update, isMutating } = useResource<RecipeRow>(RECIPES_TABLE);

  const recipeIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const ingredientsQuery = useQuery({
    queryKey: [...queryKeys.tableAll(RECIPE_INGREDIENTS_TABLE), recipeIds],
    enabled: recipeIds.length > 0,
    queryFn: () => listRecipeIngredients(recipeIds),
  });
  const stepsQuery = useQuery({
    queryKey: [...queryKeys.tableAll(RECIPE_STEPS_TABLE), recipeIds],
    enabled: recipeIds.length > 0,
    queryFn: () => listRecipeSteps(recipeIds),
  });
  const linksQuery = useQuery({
    queryKey: [...queryKeys.tableAll(RECIPE_TAG_LINKS_TABLE), recipeIds],
    enabled: recipeIds.length > 0,
    queryFn: () => listRecipeTagLinks(recipeIds),
  });
  const favoritesQuery = useQuery({
    queryKey: [...queryKeys.tableAll(RECIPE_FAVORITES_TABLE), recipeIds, currentMember?.id ?? ''],
    enabled: recipeIds.length > 0 && Boolean(currentMember?.id),
    queryFn: () => listRecipeFavorites(recipeIds, currentMember?.id ?? ''),
  });

  const categories = useMemo(
    () =>
      [...categoriesResource.rows].sort((a, b) =>
        a.name === DEFAULT_RECIPE_CATEGORY ? -1 : b.name === DEFAULT_RECIPE_CATEGORY ? 1 : a.name.localeCompare(b.name, 'fr'),
      ),
    [categoriesResource.rows],
  );
  const tags = useMemo(
    () => [...tagsResource.rows].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [tagsResource.rows],
  );

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);
  const tagNamesByRecipe = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const link of linksQuery.data ?? []) {
      const name = tagsById.get(link.tag_id);
      if (!name) continue;
      grouped.set(link.recipe_id, [...(grouped.get(link.recipe_id) ?? []), name]);
    }
    return grouped;
  }, [linksQuery.data, tagsById]);
  const favoriteIds = useMemo(() => new Set((favoritesQuery.data ?? []).map((favorite) => favorite.recipe_id)), [favoritesQuery.data]);

  const recipes = useMemo(
    () =>
      rows
        .map((row) =>
          toRecipe(row, {
            categoryName: row.category_id ? (categoriesById.get(row.category_id) ?? DEFAULT_RECIPE_CATEGORY) : DEFAULT_RECIPE_CATEGORY,
            tags: [...(tagNamesByRecipe.get(row.id) ?? [])].sort((a, b) => a.localeCompare(b, 'fr')),
            isFavorite: favoriteIds.has(row.id),
          }),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, categoriesById, tagNamesByRecipe, favoriteIds],
  );

  const ingredientsByRecipe = useMemo(() => {
    const grouped: Record<string, RecipeIngredient[]> = {};
    for (const row of ingredientsQuery.data ?? []) {
      grouped[row.recipe_id] = [...(grouped[row.recipe_id] ?? []), toIngredient(row)];
    }
    for (const list of Object.values(grouped)) list.sort((a, b) => a.position - b.position);
    return grouped;
  }, [ingredientsQuery.data]);

  const stepsByRecipe = useMemo(() => {
    const grouped: Record<string, RecipeStep[]> = {};
    for (const row of stepsQuery.data ?? []) {
      grouped[row.recipe_id] = [...(grouped[row.recipe_id] ?? []), toStep(row)];
    }
    for (const list of Object.values(grouped)) list.sort((a, b) => a.position - b.position);
    return grouped;
  }, [stepsQuery.data]);

  const visibleRecipes = useMemo(() => filterRecipes(recipes, ingredientsByRecipe, filter), [recipes, ingredientsByRecipe, filter]);

  const refreshChildren = useCallback(async () => {
    // Contrat de clés (couche data) : les ressources `useResource`
    // (catégories, tags) vivent sous `[table, …]`, les enfants lus en
    // `useQuery` direct sous `['all', table, …]` (motif tâches/routines).
    // Invalider `[table]` seul ne touchait jamais ces derniers : les
    // ajouts d'ingrédients/étapes restaient invisibles sans rechargement.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [RECIPE_CATEGORIES_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [RECIPE_TAGS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_INGREDIENTS_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_STEPS_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_TAG_LINKS_TABLE) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_FAVORITES_TABLE) }),
    ]);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: [RECIPES_TABLE] }), refreshChildren()]);
  }, [queryClient, refreshChildren]);

  const saveRecipe = useCallback(
    async (recipe: Recipe | null, values: RecipeFormValues): Promise<Recipe> => {
      if (!recipe && !householdId) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const title = values.title.trim();
      if (title.length < 1 || title.length > 200) throw new Error('Donnez un nom entre 1 et 200 caractères.');

      let categoryId = values.categoryId === '' || values.categoryId === NEW_CATEGORY_VALUE ? null : values.categoryId;
      const newCategory = values.newCategoryName.trim();
      if (values.categoryId === NEW_CATEGORY_VALUE && newCategory === '') {
        throw new Error('Nommez votre catégorie.');
      }
      if (newCategory !== '') {
        const created = await createRecipeCategory(householdId ?? '', newCategory);
        categoryId = created.id;
      }

      const saved = recipe
        ? await update(recipe.id, toRecipePayload(values, { categoryId, coverPhoto: recipe.coverPhoto }))
        : await create({
            ...toRecipePayload(values, { categoryId, coverPhoto: null }),
            household_id: householdId ?? '',
            created_by: currentMember?.id ?? null,
            created_at: new Date().toISOString(),
          });

      let coverPhoto = (saved.cover_photo as string | null) ?? null;
      if (values.coverFile) {
        let uploaded: string | null = null;
        try {
          uploaded = await uploadRecipeCover(householdId ?? '', saved.id, values.coverFile);
          const updated = await update(saved.id, { cover_photo: uploaded });
          coverPhoto = (updated.cover_photo as string | null) ?? uploaded;
          if (recipe?.coverPhoto && recipe.coverPhoto !== coverPhoto) {
            await deleteRecipeCover(recipe.coverPhoto);
          }
        } catch (coverError) {
          // Compensation (D-08) : un dépôt en échec ne doit laisser aucune
          // ligne créée. Le dépôt neuf éventuellement déposé est retiré dans
          // les deux cas ; en création seulement, la recette créée l'est aussi.
          // En édition, la recette préexistante est celle que l'utilisateur
          // modifie : jamais de suppression. L'erreur d'origine remonte intacte.
          if (uploaded) await deleteRecipeCover(uploaded).catch(() => undefined);
          if (!recipe) await deleteRecipe(saved.id, null).catch(() => undefined);
          throw coverError instanceof Error ? coverError : new Error('Couverture impossible.');
        }
      }

      await setRecipeTags(saved.id, householdId ?? '', values.tags);
      await refresh();
      return toRecipe({ ...saved, cover_photo: coverPhoto } as RecipeRow, {
        categoryName: categoryId ? undefined : DEFAULT_RECIPE_CATEGORY,
        tags: [...values.tags].sort((a, b) => a.localeCompare(b, 'fr')),
        isFavorite: recipe?.isFavorite ?? false,
      });
    },
    [canWrite, create, currentMember?.id, householdId, refresh, update],
  );

  const removeRecipe = useCallback(
    async (recipe: Recipe) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await deleteRecipe(recipe.id, recipe.coverPhoto);
      await refresh();
    },
    [canWrite, refresh],
  );

  const toggleFavorite = useCallback(
    async (recipe: Recipe) => {
      if (!currentMember || !householdId) throw new Error('Aucun foyer sélectionné.');
      await toggleRecipeFavorite(recipe.id, householdId, currentMember.id, !recipe.isFavorite);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_FAVORITES_TABLE) });
    },
    [currentMember, householdId, queryClient],
  );

  const reorderSteps = useCallback(
    async (recipeId: string, orderedIds: string[]) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const current = stepsByRecipe[recipeId] ?? [];
      const positions = new Map(current.map((step) => [step.id, step.position]));
      const changed = orderedIds.filter((id, index) => positions.get(id) !== index);
      if (changed.length === 0 && orderedIds.length === current.length) return;
      await reorderRecipeSteps(orderedIds);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(RECIPE_STEPS_TABLE) });
    },
    [canWrite, queryClient, stepsByRecipe],
  );

  return {
    recipes,
    visibleRecipes,
    categories,
    tags,
    ingredientsByRecipe,
    stepsByRecipe,
    members,
    currentMemberId: currentMember?.id ?? '',
    canWrite,
    isLoading:
      isLoading ||
      categoriesResource.isLoading ||
      tagsResource.isLoading ||
      ingredientsQuery.isLoading ||
      stepsQuery.isLoading,
    isError: isError || ingredientsQuery.isError || stepsQuery.isError,
    error: error ?? ingredientsQuery.error ?? stepsQuery.error,
    isMutating,
    refetch,
    saveRecipe,
    removeRecipe,
    toggleFavorite,
    reorderSteps,
    refreshChildren,
  };
}
