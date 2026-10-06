import type { ShoppingListItemRow, ShoppingListRow } from '@/types';

/**
 * Rayons proposés par le module. L'ordre suit le parcours en magasin : il sert
 * à la fois au regroupement par rayon et au tri de la liste déroulante.
 */
export const RAYONS = [
  'Frais',
  'Boucherie',
  'Poissonnerie',
  'Boulangerie',
  'Fruits & légumes',
  'Épicerie',
  'Boissons',
  'Surgelés',
  'Bébé',
  'Hygiène',
  'Animalerie',
  'Ménage',
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

/** Normalisation insensible casse/accents pour la recherche et la devinette. */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
/** Mots-clés (sans accents) vers rayon, testés dans l'ordre : le spécifique d'abord. */
const RAYON_KEYWORDS: [string, Rayon][] = [
  ['boulanger', 'Boulangerie'],
  ['baguette', 'Boulangerie'],
  ['croissant', 'Boulangerie'],
  ['brioche', 'Boulangerie'],
  ['viennoiserie', 'Boulangerie'],
  ['feuillete', 'Boulangerie'],
  ['brisee', 'Boulangerie'],
  ['pain au', 'Boulangerie'],
  ['pain', 'Boulangerie'],
  ['gateau', 'Boulangerie'],
  ['tarte', 'Boulangerie'],
  ['cake', 'Boulangerie'],
  ['muffin', 'Boulangerie'],
  ['cookie', 'Boulangerie'],
  ['patisserie', 'Boulangerie'],
  ['pates', 'Épicerie'],
  ['tartin', 'Épicerie'],
  [' riz ', 'Épicerie'],
  ['rizotto', 'Épicerie'],
  ['risotto', 'Épicerie'],
  ['conserve', 'Épicerie'],
  ['compote', 'Épicerie'],
  ['huile', 'Épicerie'],
  ['vinaigre', 'Épicerie'],
  ['sauce', 'Épicerie'],
  ['moutarde', 'Épicerie'],
  ['ketchup', 'Épicerie'],
  ['mayo', 'Épicerie'],
  ['chocolat', 'Épicerie'],
  ['cacao', 'Épicerie'],
  ['sucre', 'Épicerie'],
  ['farine', 'Épicerie'],
  ['levure', 'Épicerie'],
  // ' sel ' encadré : « vaisselle » contient « sel ».
  [' sel ', 'Épicerie'],
  ['poivre', 'Épicerie'],
  ['epice', 'Épicerie'],
  ['confiture', 'Épicerie'],
  ['miel', 'Épicerie'],
  ['cereale', 'Épicerie'],
  ['biscotte', 'Épicerie'],
  // Avant Boucherie : « croquettes au poulet » est pour le chat, et « pâtée »
  // (double e) n'est pas le « pâté » de campagne.
  ['croquette', 'Animalerie'],
  ['litiere', 'Animalerie'],
  ['patee', 'Animalerie'],
  ['chat', 'Animalerie'],
  ['chien', 'Animalerie'],
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
  // « chorizo » contient « riz » : il faut le rattraper ici, après l'Épicerie.
  ['chorizo', 'Boucherie'],
  // Après « pâtes » (Épicerie) : le « pâté » simple reste de la charcuterie.
  ['pate', 'Boucherie'],
  ['poisson', 'Poissonnerie'],
  ['thon', 'Poissonnerie'],
  ['saumon', 'Poissonnerie'],
  ['cabillaud', 'Poissonnerie'],
  ['crevette', 'Poissonnerie'],
  ['surimi', 'Poissonnerie'],
  ['sardine', 'Poissonnerie'],
  ['moule', 'Poissonnerie'],
  ['huitre', 'Poissonnerie'],
  ['lotte', 'Poissonnerie'],
  ['fruits de mer', 'Poissonnerie'],
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
  // Avant Frais : « lait en poudre » est pour bébé, pas le frais.
  ['bebe', 'Bébé'],
  ['couche', 'Bébé'],
  ['infantile', 'Bébé'],
  ['biberon', 'Bébé'],
  ['lingette', 'Bébé'],
  ['petit pot', 'Bébé'],
  ['en poudre', 'Bébé'],
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
 * Correspondance floue d'un nom tapé avec le catalogue (minuscules, accents
 * ignorés, sous-chaîne dans les deux sens), triée par proximité de longueur.
 */
export function matchCatalogue<T extends { name: string }>(products: T[], name: string, limit = 5): T[] {
  const needle = normalizeSearchText(name);
  if (needle.length < 2) return [];
  return products
    .filter((product) => {
      const haystack = normalizeSearchText(product.name);
      return haystack.includes(needle) || needle.includes(haystack);
    })
    .sort((a, b) => Math.abs(a.name.length - needle.length) - Math.abs(b.name.length - needle.length))
    .slice(0, Math.max(limit, 1));
}

/**
 * Devine le rayon depuis le nom saisi (minuscules, accents ignorés).
 * Repli `Divers` quand rien ne correspond : la suggestion ne bloque jamais.
 */
export function guessRayon(name: string | null | undefined): Rayon {
  const clean = normalizeSearchText(name);
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

/** Référence OFF jointe à un ajout manuel : même forme que `OffProduct`. */
export interface ItemOffRef {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  categoriesTags: string[];
  lang: string | null;
}

/** Valeurs renvoyées par le formulaire article, avant résolution de la liste. */
export interface ItemFormValues {
  name: string;
  quantity: string;
  unit: string;
  rayon: Rayon;
  listId: string;
  newListName: string;
  /** Résultat OFF choisi via « Rechercher photo et rayon » : crée la fiche catalogue. */
  off: ItemOffRef | null;
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
