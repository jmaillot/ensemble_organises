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

/** Mots-clés (sans accents) vers rayon, testés dans l'ordre : le spécifique d'abord. */
const RAYON_KEYWORDS: [string, Rayon][] = [
  ['boulanger', 'Boulangerie'],
  ['baguette', 'Boulangerie'],
  ['croissant', 'Boulangerie'],
  ['brioche', 'Boulangerie'],
  ['viennoiserie', 'Boulangerie'],
  ['pain au', 'Boulangerie'],
  ['pain', 'Boulangerie'],
  ['gateau', 'Boulangerie'],
  ['tarte', 'Boulangerie'],
  ['cake', 'Boulangerie'],
  ['muffin', 'Boulangerie'],
  ['cookie', 'Boulangerie'],
  ['patisserie', 'Boulangerie'],
  ['viande', 'Boucherie'],
  ['volaille', 'Boucherie'],
  ['boeuf', 'Boucherie'],
  ['porc', 'Boucherie'],
  ['poulet', 'Boucherie'],
  ['dinde', 'Boucherie'],
  ['canard', 'Boucherie'],
  ['lapin', 'Boucherie'],
  ['agneau', 'Boucherie'],
  ['veau', 'Boucherie'],
  ['saucisse', 'Boucherie'],
  ['merguez', 'Boucherie'],
  ['jambon', 'Boucherie'],
  ['steak', 'Boucherie'],
  ['bacon', 'Boucherie'],
  ['charcuterie', 'Boucherie'],
  ['vin', 'Boissons'],
  ['biere', 'Boissons'],
  ['champagne', 'Boissons'],
  ['aperitif', 'Boissons'],
  ['jus', 'Boissons'],
  ['soda', 'Boissons'],
  ['cola', 'Boissons'],
  ['limonade', 'Boissons'],
  ['sirop', 'Boissons'],
  ['boisson', 'Boissons'],
  ['cafe', 'Boissons'],
  [' the ', 'Boissons'],
  ['eau', 'Boissons'],
  ['fruit', 'Fruits & légumes'],
  ['legume', 'Fruits & légumes'],
  ['pomme', 'Fruits & légumes'],
  ['banane', 'Fruits & légumes'],
  ['orange', 'Fruits & légumes'],
  ['citron', 'Fruits & légumes'],
  ['tomate', 'Fruits & légumes'],
  ['salade', 'Fruits & légumes'],
  ['carotte', 'Fruits & légumes'],
  ['poireau', 'Fruits & légumes'],
  ['courgette', 'Fruits & légumes'],
  ['poivron', 'Fruits & légumes'],
  ['fraise', 'Fruits & légumes'],
  ['framboise', 'Fruits & légumes'],
  ['raisin', 'Fruits & légumes'],
  ['oignon', 'Fruits & légumes'],
  ['ail', 'Fruits & légumes'],
  ['chou', 'Fruits & légumes'],
  ['poire', 'Fruits & légumes'],
  ['peche', 'Fruits & légumes'],
  ['abricot', 'Fruits & légumes'],
  ['cerise', 'Fruits & légumes'],
  ['melon', 'Fruits & légumes'],
  ['avocat', 'Fruits & légumes'],
  ['champignon', 'Fruits & légumes'],
  ['haricot', 'Fruits & légumes'],
  ['concombre', 'Fruits & légumes'],
  ['aubergine', 'Fruits & légumes'],
  ['brocoli', 'Fruits & légumes'],
  ['epinard', 'Fruits & légumes'],
  ['lait', 'Frais'],
  ['yaourt', 'Frais'],
  ['yogourt', 'Frais'],
  ['fromage', 'Frais'],
  ['beurre', 'Frais'],
  ['creme', 'Frais'],
  ['oeuf', 'Frais'],
  ['comte', 'Frais'],
  ['chevre', 'Frais'],
  ['mozzarella', 'Frais'],
  ['poisson', 'Frais'],
  ['thon', 'Frais'],
  ['saumon', 'Frais'],
  ['cabillaud', 'Frais'],
  ['crevette', 'Frais'],
  ['surimi', 'Frais'],
  ['sandwich', 'Frais'],
  ['traiteur', 'Frais'],
  ['surgele', 'Surgelés'],
  ['congele', 'Surgelés'],
  ['glace', 'Surgelés'],
  ['picard', 'Surgelés'],
  ['savon', 'Hygiène'],
  ['shampoing', 'Hygiène'],
  ['dentifrice', 'Hygiène'],
  ['papier toilette', 'Hygiène'],
  ['couche', 'Hygiène'],
  ['gel douche', 'Hygiène'],
  ['deodorant', 'Hygiène'],
  ['rasoir', 'Hygiène'],
  ['brosse a dent', 'Hygiène'],
  ['hygiene', 'Hygiène'],
  ['papier', 'Hygiène'],
  ['lessive', 'Ménage'],
  ['eponge', 'Ménage'],
  ['javel', 'Ménage'],
  ['nettoyant', 'Ménage'],
  ['sac poubelle', 'Ménage'],
  ['liquide vaisselle', 'Ménage'],
  ['balai', 'Ménage'],
  ['serpilliere', 'Ménage'],
  ['detache', 'Ménage'],
  ['adoucissant', 'Ménage'],
  ['essuie-tout', 'Ménage'],
  ['menage', 'Ménage'],
];

/**
 * Devine le rayon depuis le nom saisi (minuscules, accents ignorés).
 * Repli `Divers` quand rien ne correspond : la suggestion ne bloque jamais.
 */
export function guessRayon(name: string | null | undefined): Rayon {
  const clean = (name ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const padded = ` ${clean} `;
  for (const [keyword, rayon] of RAYON_KEYWORDS) {
    if (padded.includes(keyword)) return rayon;
  }
  return DEFAULT_RAYON;
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
  /** Photo du produit du foyer (D-03) : `photo_url`, sinon repli `off_data.image_url`. */
  photoUrl?: string | null;
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
  /** Produit du foyer d'origine (0071) : re-scan +1 via resolveScannedProduct. */
  productId?: string | null;
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
