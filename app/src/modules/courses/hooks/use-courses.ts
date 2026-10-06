import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHouseholdStore } from '@/stores/household-store';
import { useToast } from '@/components/ui/toast';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { daysBetween, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import type { EventRow, ProductRow, ShoppingListItemRow, ShoppingListRow } from '@/types';
import {
  createShoppingItem,
  createShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  renameShoppingList,
  updateShoppingItem,
  SHOPPING_ITEMS_TABLE,
  SHOPPING_LISTS_TABLE,
} from '../api';
import {
  findProductByEan,
  PRODUCTS_TABLE,
  resolveManualOffProduct,
  resolveScannedProduct,
  scanAddedToast,
  updateProduct,
  type ScanResolution,
} from '../products-api';
import { cleanOffImageUrl, isQueryableEan } from '../off-client';
import {
  NEW_LIST_OPTION,
  guessRayon,
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
  addItemToList: (listId: string, name: string, options?: { quantity?: string | null; rayon?: string | null }) => Promise<void>;
  addCatalogProductToList: (listId: string, productId: string) => Promise<void>;
  /** Re-scan d'un EAN connu : produit Dexie → item (+1 si déjà présent, D-04). */
  addScannedToList: (listId: string, ean: string, addedBy?: string | null) => Promise<ScanResolution>;
  addList: (name: string) => Promise<ShoppingListRow | undefined>;
  renameList: (id: string, name: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  removeList: (id: string) => Promise<void>;
  editItem: (id: string, values: { name: string; quantity: string; unit: string; rayon: string }) => Promise<void>;
  /** Catalogue brut trié (lignes `products` du foyer) pour l'espace catalogue. */
  products: ProductRow[];
  editProduct: (id: string, values: { name: string; brand: string; category: string; ean: string; photoUrl?: string | null }) => Promise<void>;
}

/**
 * Source unique du module Courses : lectures via `useResource` (cache,
 * invalidation, mise à jour optimiste des cases) et écritures via `api.ts`.
 */
export function useCourses(): UseCoursesResult {
  const queryClient = useQueryClient();
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);

  const listResource = useResource<ShoppingListRow>(SHOPPING_LISTS_TABLE);
  const itemResource = useResource<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE);
  const eventResource = useResource<EventRow>('events');
  const productResource = useResource<ProductRow>(PRODUCTS_TABLE);

  /**
   * Invalidation par préfixe de table : la clé de `useResource` commence par le
   * nom de la table, ce qui touche aussi les requêtes filtrées de la page.
   */
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [SHOPPING_LISTS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [SHOPPING_ITEMS_TABLE] }),
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_TABLE] }),
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

  /**
   * Produits du catalogue du foyer (D-03) : triés par nom pour un ordre
   * stable, photo locale prioritaire puis repli `off_data.image_url` (D-05).
   */
  const productEntries = useMemo(
    () =>
      [...productResource.rows]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((row) => {
          const offData = row.off_data ?? {};
          const fallback = cleanOffImageUrl(offData.image_url);
          return {
            name: row.name.trim(),
            rayon: normalizeRayon(row.category),
            photoUrl: row.photo_url ?? fallback,
          };
        })
        .filter((entry) => entry.name.length > 0),
    [productResource.rows],
  );

  const suggestionsFor = useCallback(
    (listId: string) => {
      const present = new Set(
        itemResource.rows.filter((row) => row.list_id === listId).map((row) => row.name.trim().toLowerCase()),
      );
      // Produits du foyer d'abord (D-03), puis historique, dédupliqués par
      // nom insensible à la casse, limite totale de 5.
      const seen = new Set(present);
      const merged: ItemSuggestion[] = [];
      for (const entry of productEntries) {
        if (merged.length >= SUGGESTION_LIMIT) break;
        const key = entry.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
      }
      if (merged.length < SUGGESTION_LIMIT) {
        for (const entry of history) {
          if (merged.length >= SUGGESTION_LIMIT) break;
          const key = entry.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ name: entry.name, rayon: normalizeRayon(entry.rayon) });
        }
      }
      return merged;
    },
    [history, itemResource.rows, productEntries],
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
      const quantity = typeof rawQuantity === 'number' && Number.isFinite(rawQuantity) ? rawQuantity : null;
      // Résultat OFF choisi : la fiche catalogue est créée (ou retrouvée) et
      // l'article est lié, comme après un scan. Sinon, article simple.
      if (values.off && isQueryableEan(values.off.ean)) {
        await resolveManualOffProduct({
          householdId,
          listId,
          name: values.name.trim(),
          quantity,
          unit: values.unit.trim() || null,
          rayon: values.rayon,
          off: values.off,
          addedBy: currentMemberId || null,
        });
      } else {
        await createShoppingItem({
          householdId,
          listId,
          name: values.name.trim(),
          quantity,
          unit: values.unit.trim() || null,
          rayon: normalizeRayon(values.rayon),
          addedBy: currentMemberId || null,
        });
      }
      await invalidate();
    },
    [currentMemberId, householdId, invalidate],
  );

  /** Ajout au clavier : nom seul, rayon repris de l'historique quand il existe. */
  const addItemToList = useCallback(
    async (listId: string, name: string, options?: { quantity?: string | null; rayon?: string | null }) => {
      if (!householdId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const known =
        history.find((entry) => entry.name.toLowerCase() === trimmed.toLowerCase()) ??
        productEntries.find((entry) => entry.name.toLowerCase() === trimmed.toLowerCase());
      const rawQuantity =
        options?.quantity != null && options.quantity.trim() !== '' ? Number(options.quantity) : null;
      await createShoppingItem({
        householdId,
        listId,
        name: trimmed,
        quantity: typeof rawQuantity === 'number' && Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : null,
        unit: null,
        rayon: options?.rayon ? normalizeRayon(options.rayon) : (known ? normalizeRayon(known.rayon) : guessRayon(trimmed)),
        addedBy: currentMemberId || null,
      });
      await invalidate();
    },
    [currentMemberId, householdId, history, invalidate, productEntries],
  );

  /**
   * Ajout d'un produit du catalogue : +1 (et décoché) s'il est déjà dans la
   * liste (D-04), sinon création liée (`product_id`) avec son rayon.
   */
  const addCatalogProductToList = useCallback(
    async (listId: string, productId: string) => {
      if (!householdId) return;
      const product = productResource.rows.find((row) => row.id === productId);
      if (!product || product.household_id !== householdId) return;
      const siblings = await data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, { household_id: householdId, list_id: listId });
      const current = siblings.find((item) => item.product_id === productId);
      if (current) {
        await data.update<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, current.id, {
          quantity: (current.quantity ?? 1) + 1,
          checked: false,
        });
      } else {
        await createShoppingItem({
          householdId,
          listId,
          name: product.name,
          quantity: null,
          unit: null,
          rayon: normalizeRayon(product.category),
          addedBy: currentMemberId || null,
          productId: product.id,
        });
      }
      await invalidate();
    },
    [currentMemberId, householdId, invalidate, productResource.rows],
  );

  /**
   * Re-scan d'un EAN déjà connu du foyer (D-04, D-06) : lecture Dexie pure,
   * aucun appel réseau. Produit inconnu → erreur vers la fiche manuelle.
   */
  const addScannedToList = useCallback(
    async (listId: string, ean: string, addedBy?: string | null): Promise<ScanResolution> => {
      if (!householdId) throw new Error('Aucun foyer actif : reconnectez-vous.');
      const known = await findProductByEan(householdId, ean.trim());
      if (!known) throw new Error('Produit inconnu : créez-le depuis la fiche.');
      const resolution = await resolveScannedProduct({
        householdId,
        listId,
        ean: known.ean,
        name: known.name,
        brand: known.brand,
        category: known.category,
        offData: known.off_data,
        createdBy: currentMemberId,
        addedBy: addedBy ?? currentMemberId,
      });
      await invalidate();
      toast(scanAddedToast(resolution.product.name, resolution.incremented), 'success');
      return resolution;
    },
    [currentMemberId, householdId, invalidate, toast],
  );

  const addList = useCallback(
    async (name: string) => {
      if (!householdId) return undefined;
      const created = await createShoppingList({ householdId, name: name.trim(), createdBy: currentMemberId || null });
      await invalidate();
      return created;
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

  const editItem = useCallback(
    async (id: string, values: { name: string; quantity: string; unit: string; rayon: string }) => {
      const rawQuantity = values.quantity.trim() === '' ? null : Number(values.quantity);
      await updateShoppingItem(id, {
        name: values.name.trim(),
        quantity: typeof rawQuantity === 'number' && Number.isFinite(rawQuantity) ? rawQuantity : null,
        unit: values.unit.trim() || null,
        rayon: values.rayon,
      });
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

  const editProduct = useCallback(
    async (id: string, values: { name: string; brand: string; category: string; ean: string; photoUrl?: string | null }) => {
      await updateProduct(id, {
        name: values.name.trim(),
        brand: values.brand.trim() || null,
        category: values.category,
        ean: values.ean.trim(),
        ...(values.photoUrl !== undefined ? { photoUrl: values.photoUrl } : {}),
      });
      await invalidate();
    },
    [invalidate],
  );

  const products = useMemo(() => [...productResource.rows].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [productResource.rows]);

  return {
    lists,
    itemCount,
    checkedCount,
    suggestionsFor,
    nextCourse,
    isLoading: listResource.isLoading || itemResource.isLoading || productResource.isLoading,
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
    addScannedToList,
    addCatalogProductToList,
    addList,
    renameList,
    removeItem,
    removeList,
    editItem,
    products,
    editProduct,
  };
}
