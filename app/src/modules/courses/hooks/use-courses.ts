import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHouseholdStore } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import { daysBetween, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import type { EventRow, ShoppingListItemRow, ShoppingListRow } from '@/types';
import {
  createShoppingItem,
  createShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  renameShoppingList,
  SHOPPING_ITEMS_TABLE,
  SHOPPING_LISTS_TABLE,
} from '../api';
import {
  NEW_LIST_OPTION,
  normalizeRayon,
  toShoppingItem,
  toShoppingList,
  type ItemFormValues,
  type ItemSuggestion,
  type ShoppingItem,
  type ShoppingListView,
} from '../types';

/** Un événement dont le titre contient « cours » annonce une course. */
const UPCOMING_COURSE = /cours/i;
const SUGGESTION_LIMIT = 5;

export interface UseCoursesResult {
  lists: ShoppingListView[];
  itemCount: number;
  checkedCount: number;
  /** Cinq articles les plus fréquents de l'historique, hors liste courante. */
  suggestionsFor: (listId: string) => ItemSuggestion[];
  nextCourse: EventRow | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  toggleItem: (item: ShoppingItem) => Promise<void>;
  addItem: (values: ItemFormValues) => Promise<void>;
  addItemToList: (listId: string, name: string) => Promise<void>;
  addList: (name: string) => Promise<void>;
  renameList: (id: string, name: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  removeList: (id: string) => Promise<void>;
}

/**
 * Source unique du module Courses : lectures via `useResource` (cache,
 * invalidation, mise à jour optimiste des cases) et écritures via `api.ts`.
 */
export function useCourses(): UseCoursesResult {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);

  const listResource = useResource<ShoppingListRow>(SHOPPING_LISTS_TABLE);
  const itemResource = useResource<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE);
  const eventResource = useResource<EventRow>('events');

  /**
   * Invalidation par préfixe de table : la clé de `useResource` commence par le
   * nom de la table, ce qui touche aussi les requêtes filtrées de la page.
   */
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [SHOPPING_LISTS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [SHOPPING_ITEMS_TABLE] }),
    ]);
  }, [queryClient]);

  const lists = useMemo<ShoppingListView[]>(() => {
    const itemsByList = new Map<string, ShoppingItem[]>();
    for (const row of itemResource.rows) {
      const item = toShoppingItem(row);
      const bucket = itemsByList.get(item.listId);
      if (bucket) bucket.push(item);
      else itemsByList.set(item.listId, [item]);
    }
    return listResource.rows
      .map((row) => toShoppingList(row))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'fr'))
      .map((list) => {
        const items = (itemsByList.get(list.id) ?? []).sort(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'fr'),
        );
        const checked = items.filter((item) => item.checked).length;
        return { ...list, items, checkedCount: checked, pendingCount: items.length - checked };
      });
  }, [itemResource.rows, listResource.rows]);

  const itemCount = itemResource.rows.length;
  const checkedCount = itemResource.rows.filter((row) => row.checked).length;

  /**
   * Historique d'ajout : les articles déjà cochés, comptés par nom, avec le
   * rayon le plus souvent associé.
   */
  const history = useMemo(() => {
    const frequency = new Map<string, { name: string; rayon: string; count: number }>();
    for (const row of itemResource.rows) {
      if (!row.checked) continue;
      const key = row.name.trim().toLowerCase();
      const entry = frequency.get(key);
      if (entry) {
        entry.count += 1;
        entry.rayon = normalizeRayon(row.category);
      } else {
        frequency.set(key, { name: row.name.trim(), rayon: normalizeRayon(row.category), count: 1 });
      }
    }
    return [...frequency.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'),
    );
  }, [itemResource.rows]);

  const suggestionsFor = useCallback(
    (listId: string) => {
      const present = new Set(
        itemResource.rows.filter((row) => row.list_id === listId).map((row) => row.name.trim().toLowerCase()),
      );
      return history
        .filter((entry) => !present.has(entry.name.toLowerCase()))
        .slice(0, SUGGESTION_LIMIT)
        .map((entry) => ({ name: entry.name, rayon: normalizeRayon(entry.rayon) }));
    },
    [history, itemResource.rows],
  );

  /** Prochain rendez-vous « Courses » du calendrier, aujourd'hui compris. */
  const nextCourse = useMemo<EventRow | null>(() => {
    const today = todayIso();
    return (
      eventResource.rows
        .filter((row) => UPCOMING_COURSE.test(row.title))
        .filter((row) => daysBetween(today, toIsoDate(toLocalDate(row.start_at))) >= 0)
        .sort((a, b) => a.start_at.localeCompare(b.start_at))[0] ?? null
    );
  }, [eventResource.rows]);

  const toggleItem = useCallback(
    async (item: ShoppingItem) => {
      await itemResource.mutate(item.id, { checked: !item.checked });
    },
    [itemResource],
  );

  const addItem = useCallback(
    async (values: ItemFormValues) => {
      if (!householdId) return;
      // Liste « __nouvelle__ » : la liste est créée à la volée avec l'article.
      const listId =
        values.listId === NEW_LIST_OPTION
          ? (
              await createShoppingList({
                householdId,
                name: values.newListName.trim(),
                createdBy: currentMemberId || null,
              })
            ).id
          : values.listId;
      const rawQuantity = values.quantity.trim() === '' ? null : Number(values.quantity);
      await createShoppingItem({
        householdId,
        listId,
        name: values.name.trim(),
        quantity: typeof rawQuantity === 'number' && Number.isFinite(rawQuantity) ? rawQuantity : null,
        unit: values.unit.trim() || null,
        rayon: normalizeRayon(values.rayon),
        addedBy: currentMemberId || null,
      });
      await invalidate();
    },
    [currentMemberId, householdId, invalidate],
  );

  /** Ajout au clavier : nom seul, rayon repris de l'historique quand il existe. */
  const addItemToList = useCallback(
    async (listId: string, name: string) => {
      if (!householdId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const known = history.find((entry) => entry.name.toLowerCase() === trimmed.toLowerCase());
      await createShoppingItem({
        householdId,
        listId,
        name: trimmed,
        quantity: null,
        unit: null,
        rayon: normalizeRayon(known?.rayon),
        addedBy: currentMemberId || null,
      });
      await invalidate();
    },
    [currentMemberId, householdId, history, invalidate],
  );

  const addList = useCallback(
    async (name: string) => {
      if (!householdId) return;
      await createShoppingList({ householdId, name: name.trim(), createdBy: currentMemberId || null });
      await invalidate();
    },
    [currentMemberId, householdId, invalidate],
  );

  const renameList = useCallback(
    async (id: string, name: string) => {
      await renameShoppingList(id, name);
      await invalidate();
    },
    [invalidate],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await deleteShoppingItem(id);
      await invalidate();
    },
    [invalidate],
  );

  const removeList = useCallback(
    async (id: string) => {
      if (!householdId) return;
      await deleteShoppingList(id, householdId);
      await invalidate();
    },
    [householdId, invalidate],
  );

  return {
    lists,
    itemCount,
    checkedCount,
    suggestionsFor,
    nextCourse,
    isLoading: listResource.isLoading || itemResource.isLoading,
    isError: listResource.isError || itemResource.isError,
    error: listResource.error ?? itemResource.error,
    refetch: () => {
      listResource.refetch();
      itemResource.refetch();
    },
    isMutating: listResource.isMutating || itemResource.isMutating,
    toggleItem,
    addItem,
    addItemToList,
    addList,
    renameList,
    removeItem,
    removeList,
  };
}
