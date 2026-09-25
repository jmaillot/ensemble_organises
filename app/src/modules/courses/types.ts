import type { ShoppingListItemRow, ShoppingListRow } from '@/types';

/**
 * Rayons proposés par le module. L'ordre suit le parcours en magasin : il sert
 * à la fois au regroupement par rayon et au tri de la liste déroulante.
 */
export const RAYONS = [
  'Frais',
  'Boucherie',
  'Boulangerie',
  'Fruits & légumes',
  'Hygiène',
  'Ménage',
  'Surgelés',
  'Boissons',
  'Divers',
] as const;

export type Rayon = (typeof RAYONS)[number];

/** Rayon de repli : tout article ajouté sans catégorie précise. */
export const DEFAULT_RAYON: Rayon = 'Divers';

/** Valeur sentinelle du sélecteur de liste : « Nouvelle liste ». */
export const NEW_LIST_OPTION = '__nouvelle__';

/** Compare une catégorie libre à la liste des rayons (casse et espaces ignorés). */
export function normalizeRayon(value: string | null | undefined): Rayon {
  const cleaned = (value ?? '').trim();
  const match = RAYONS.find((rayon) => rayon.toLowerCase() === cleaned.toLowerCase());
  return match ?? DEFAULT_RAYON;
}

export interface ShoppingList {
  id: string;
  householdId: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  householdId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Rayon dérivé de `shopping_list_items.category`. */
  rayon: Rayon;
  checked: boolean;
  addedBy: string | null;
  createdAt: string;
}

/** Une liste enrichie de ses articles et de ses compteurs. */
export interface ShoppingListView extends ShoppingList {
  items: ShoppingItem[];
  checkedCount: number;
  pendingCount: number;
}

/** Mode de regroupement proposé par le sélecteur du panneau principal. */
export type Grouping = 'rayon' | 'ajout';

export interface ItemSection {
  key: string;
  title: string;
  items: ShoppingItem[];
}

/** Suggestion d'ajout rapide : nom appris et rayon le plus souvent associé. */
export interface ItemSuggestion {
  name: string;
  rayon: Rayon;
}

export interface ShoppingListInput {
  householdId: string;
  name: string;
  createdBy: string | null;
}

export interface ShoppingItemInput {
  householdId: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  rayon: Rayon;
  addedBy: string | null;
}

/** Valeurs renvoyées par le formulaire article, avant résolution de la liste. */
export interface ItemFormValues {
  name: string;
  quantity: string;
  unit: string;
  rayon: Rayon;
  listId: string;
  newListName: string;
}

export const toShoppingList = (row: ShoppingListRow): ShoppingList => ({
  id: row.id,
  householdId: row.household_id,
  name: row.name,
  createdBy: row.created_by,
  createdAt: row.created_at ?? '',
});

export const toShoppingItem = (row: ShoppingListItemRow): ShoppingItem => ({
  id: row.id,
  listId: row.list_id,
  householdId: row.household_id,
  name: row.name,
  quantity: row.quantity,
  unit: row.unit,
  rayon: normalizeRayon(row.category),
  checked: Boolean(row.checked),
  addedBy: row.added_by,
  createdAt: row.created_at ?? '',
});

/** « 8 pots », « 1 sachet », « 1 » ou « » quand l'article n'a pas de quantité. */
export function quantityLabel(item: ShoppingItem): string {
  if (item.quantity === null) return item.unit ?? '';
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

export const itemStateLabel = (checked: boolean) => (checked ? 'dans le panier' : 'à acheter');

/**
 * Découpe les articles d'une liste en sections visuelles : une section par
 * rayon (vue par défaut) ou une section unique dans l'ordre d'ajout.
 */
export function sectionsForList(items: ShoppingItem[], grouping: Grouping): ItemSection[] {
  if (items.length === 0) return [];
  if (grouping === 'ajout') return [{ key: 'ajout', title: '', items: [...items] }];

  const buckets = new Map<Rayon, ShoppingItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.rayon);
    if (bucket) bucket.push(item);
    else buckets.set(item.rayon, [item]);
  }
  return RAYONS.filter((rayon) => buckets.has(rayon)).map((rayon) => ({
    key: rayon,
    title: rayon,
    items: buckets.get(rayon) ?? [],
  }));
}
