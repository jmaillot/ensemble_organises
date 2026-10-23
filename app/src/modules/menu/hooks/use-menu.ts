import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { toRecipe } from '@/modules/recettes/types';
import { useHouseholdStore } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import type { MealEntryRow, RecipeRow } from '@/types';
import { createMealEntry, generateCoursesFromWeek, removeMealEntry, updateMealEntry } from '../api';
import { toMealEntry, weekStartOf, type MealFormValues, type MealSlot } from '../types';

/**
 * Menu de la semaine : repas du foyer (`meal_entries`, 0142) + recettes du
 * foyer pour le choix des repas, et génération de la liste de courses.
 */
export interface MenuResource {
  entries: ReturnType<typeof toMealEntry>[];
  recipes: { id: string; title: string; servings: number }[];
  today: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveEntry: (id: string | null, values: MealFormValues) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  entriesOfWeek: (weekStartIso: string) => Map<string, ReturnType<typeof toMealEntry>[]>;
  generateCourses: (listId: string, weekStartIso: string) => Promise<{ createdCount: number; mergedCount: number; lines: number }>;
}

export function useMenu(): MenuResource {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const entriesResource = useResource<MealEntryRow>('meal_entries', {
    filter: { household_id: householdId ?? '' },
    enabled: Boolean(householdId),
  });
  const recipesResource = useResource<RecipeRow>('recipes', {
    filter: { household_id: householdId ?? '' },
    enabled: Boolean(householdId),
  });

  const today = todayIso();
  const refresh = useCallback(() => {
    void invalidateTables(queryClient, ['meal_entries']);
  }, [queryClient]);

  useEffect(() => data.subscribe('meal_entries', refresh), [refresh]);

  const entries = useMemo(() => entriesResource.rows.map(toMealEntry), [entriesResource.rows]);
  const recipes = useMemo(
    () =>
      recipesResource.rows
        .map((row) => {
          const recipe = toRecipe(row, {});
          return { id: recipe.id, title: recipe.title, servings: recipe.servings };
        })
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    [recipesResource.rows],
  );

  const recipeServings = useMemo(
    () => Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe.servings])),
    [recipes],
  );

  const entriesOfWeek = useCallback(
    (weekStartIso: string) => {
      const byDay = new Map<string, MenuResource['entries'][number][]>();
      for (const entry of entries) {
        if (weekStartOf(entry.date) !== weekStartIso) continue;
        const list = byDay.get(entry.date) ?? [];
        list.push(entry);
        byDay.set(entry.date, list);
      }
      for (const list of byDay.values()) {
        list.sort((a, b) => mealSlotRank(a.slot) - mealSlotRank(b.slot) || a.id.localeCompare(b.id));
      }
      return byDay;
    },
    [entries],
  );

  const saveEntry = useCallback(
    async (id: string | null, values: MealFormValues) => {
      if (id) {
        await updateMealEntry(id, values);
      } else {
        await createMealEntry(values, householdId ?? '');
      }
      refresh();
    },
    [householdId, refresh],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await removeMealEntry(id);
      refresh();
    },
    [refresh],
  );

  const generateCourses = useCallback(
    async (listId: string, weekStartIso: string) => {
      const weekEntries = entriesOfWeek(weekStartIso);
      const recipeEntries: { recipeId: string; servings: number }[] = [];
      for (const list of weekEntries.values()) {
        for (const entry of list) {
          if (entry.recipeId) recipeEntries.push({ recipeId: entry.recipeId, servings: entry.servings });
        }
      }
      const result = await generateCoursesFromWeek({
        householdId: householdId ?? '',
        listId,
        addedBy: currentMemberId === '' ? null : currentMemberId,
        entries: recipeEntries,
        recipeServings,
      });
      void invalidateTables(queryClient, ['shopping_list_items']);
      return result;
    },
    [entriesOfWeek, householdId, currentMemberId, recipeServings, queryClient],
  );

  return {
    entries,
    recipes,
    today,
    isLoading: entriesResource.isLoading,
    isError: entriesResource.isError,
    error: entriesResource.error,
    refetch: entriesResource.refetch,
    isMutating: entriesResource.isMutating,
    saveEntry,
    removeEntry,
    entriesOfWeek,
    generateCourses,
  };
}

const slotRank: Record<MealSlot, number> = { matin: 0, midi: 1, soir: 2 };
const mealSlotRank = (slot: MealSlot) => slotRank[slot];
