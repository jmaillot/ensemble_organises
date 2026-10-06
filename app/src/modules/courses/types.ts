import type { ShoppingListItemRow, ShoppingListRow } from '@/types';

/**
 * Rayons proposés par le module. L'ordre suit le parcours en magasin : il sert
 * à la fois au regroupement par rayon et au tri de la liste déroulante.
 */
export const RAYONS = [
  'Crèmerie & Produits laitiers',
  'Viande & Poissons',
  'Charcuterie & Traiteur',
  'Boulangerie',
  'Fruits & légumes',
  'Épicerie salée',
  'Épicerie sucrée',
  'Boissons',
  'Surgelés',
  'Bébé',
  'Hygiène & Beauté',
  'Parapharmacie',
  'Animalerie',
  'Entretien & Nettoyage',
  'Maison & Décoration',
  'Divers',
] as const;

export type Rayon = (typeof RAYONS)[number];

/** Rayon de repli : tout article ajouté sans catégorie précise. */
export const DEFAULT_RAYON: Rayon = 'Divers';

/**
 * Anciens noms (avant le remaniement) : les lignes existantes en base les
 * portent encore et convergent au fil des écritures, sans migration.
 */
const LEGACY_RAYONS: Record<string, Rayon> = {
  frais: 'Crèmerie & Produits laitiers',
  boucherie: 'Viande & Poissons',
  poissonnerie: 'Viande & Poissons',
  'épicerie': 'Épicerie salée',
  'hygiène': 'Hygiène & Beauté',
  'ménage': 'Entretien & Nettoyage',
};

/** Valeur sentinelle du sélecteur de liste : « Nouvelle liste ». */
export const NEW_LIST_OPTION = '__nouvelle__';

/** Compare une catégorie libre à la liste des rayons (casse et espaces ignorés). */
export function normalizeRayon(value: string | null | undefined): Rayon {
  const cleaned = (value ?? '').trim();
  const match = RAYONS.find((rayon) => rayon.toLowerCase() === cleaned.toLowerCase());
  if (match) return match;
  return LEGACY_RAYONS[cleaned.toLowerCase()] ?? DEFAULT_RAYON;
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
  // Avant tout : le surgelé qualifie le produit (« quiche surgelée »).
  ['surgele', 'Surgelés'],
  ['congele', 'Surgelés'],
  ['glace', 'Surgelés'],
  ['picard', 'Surgelés'],
  ['pates', 'Épicerie salée'],
  [' riz ', 'Épicerie salée'],
  ['rizotto', 'Épicerie salée'],
  ['risotto', 'Épicerie salée'],
  ['conserve', 'Épicerie salée'],
  ['huile', 'Épicerie salée'],
  ['vinaigre', 'Épicerie salée'],
  ['sauce', 'Épicerie salée'],
  ['moutarde', 'Épicerie salée'],
  ['ketchup', 'Épicerie salée'],
  ['mayo', 'Épicerie salée'],
  // ' sel ' encadré : « vaisselle » contient « sel ».
  [' sel ', 'Épicerie salée'],
  ['poivre', 'Épicerie salée'],
  ['epice', 'Épicerie salée'],
  ['chocolat', 'Épicerie sucrée'],
  ['cacao', 'Épicerie sucrée'],
  ['sucre', 'Épicerie sucrée'],
  ['farine', 'Épicerie sucrée'],
  ['levure', 'Épicerie sucrée'],
  ['confiture', 'Épicerie sucrée'],
  ['miel', 'Épicerie sucrée'],
  ['cereale', 'Épicerie sucrée'],
  ['biscotte', 'Épicerie sucrée'],
  ['compote', 'Épicerie sucrée'],
  ['tartin', 'Épicerie sucrée'],
  // Marque génériquée (précédent : « picard ») : sans elle, « Nutella » tapé
  // sans recherche OFF resterait en Divers (la fiche OFF, elle, mappe `spreads`).
  ['nutella', 'Épicerie sucrée'],
  // Avant Viande : le sandwich (même au poulet) relève du traiteur.
  ['sandwich', 'Charcuterie & Traiteur'],
  ['traiteur', 'Charcuterie & Traiteur'],
  // Avant Viande : « croquettes au poulet » est pour le chat, et « pâtée »
  // (double e) n'est pas le « pâté » de campagne.
  ['croquette', 'Animalerie'],
  ['litiere', 'Animalerie'],
  ['patee', 'Animalerie'],
  ['chat', 'Animalerie'],
  ['chien', 'Animalerie'],
  ['viande', 'Viande & Poissons'],
  ['volaille', 'Viande & Poissons'],
  ['boeuf', 'Viande & Poissons'],
  ['porc', 'Viande & Poissons'],
  ['poulet', 'Viande & Poissons'],
  ['dinde', 'Viande & Poissons'],
  ['canard', 'Viande & Poissons'],
  ['lapin', 'Viande & Poissons'],
  ['agneau', 'Viande & Poissons'],
  ['veau', 'Viande & Poissons'],
  ['steak', 'Viande & Poissons'],
  // « chorizo » contient « riz » : rattrapé ici, après l'Épicerie salée.
  ['chorizo', 'Viande & Poissons'],
  ['poisson', 'Viande & Poissons'],
  ['thon', 'Viande & Poissons'],
  ['saumon', 'Viande & Poissons'],
  ['cabillaud', 'Viande & Poissons'],
  ['crevette', 'Viande & Poissons'],
  ['surimi', 'Viande & Poissons'],
  ['sardine', 'Viande & Poissons'],
  ['moule', 'Viande & Poissons'],
  ['huitre', 'Viande & Poissons'],
  ['lotte', 'Viande & Poissons'],
  ['fruits de mer', 'Viande & Poissons'],
  ['charcuterie', 'Charcuterie & Traiteur'],
  ['jambon', 'Charcuterie & Traiteur'],
  ['saucisse', 'Charcuterie & Traiteur'],
  ['merguez', 'Charcuterie & Traiteur'],
  ['bacon', 'Charcuterie & Traiteur'],
  ['terrine', 'Charcuterie & Traiteur'],
  ['rillettes', 'Charcuterie & Traiteur'],
  ['quiche', 'Charcuterie & Traiteur'],
  // Après « pâtes » (Épicerie salée) : le « pâté » simple reste charcuterie.
  ['pate', 'Charcuterie & Traiteur'],
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
  // Avant Crèmerie : « lait en poudre » est pour bébé, pas le frais.
  ['bebe', 'Bébé'],
  ['couche', 'Bébé'],
  ['infantile', 'Bébé'],
  ['biberon', 'Bébé'],
  ['lingette', 'Bébé'],
  ['petit pot', 'Bébé'],
  ['en poudre', 'Bébé'],
  // Avant Crèmerie : « crème hydratante » n'est pas à manger.
  ['maquillage', 'Hygiène & Beauté'],
  ['mascara', 'Hygiène & Beauté'],
  ['hydratant', 'Hygiène & Beauté'],
  ['fond de teint', 'Hygiène & Beauté'],
  ['rouge a levres', 'Hygiène & Beauté'],
  ['creme de jour', 'Hygiène & Beauté'],
  ['beaute', 'Hygiène & Beauté'],
  ['lait', 'Crèmerie & Produits laitiers'],
  ['yaourt', 'Crèmerie & Produits laitiers'],
  ['yogourt', 'Crèmerie & Produits laitiers'],
  ['fromage', 'Crèmerie & Produits laitiers'],
  ['beurre', 'Crèmerie & Produits laitiers'],
  ['creme', 'Crèmerie & Produits laitiers'],
  ['oeuf', 'Crèmerie & Produits laitiers'],
  ['comte', 'Crèmerie & Produits laitiers'],
  ['chevre', 'Crèmerie & Produits laitiers'],
  ['mozzarella', 'Crèmerie & Produits laitiers'],
  ['savon', 'Hygiène & Beauté'],
  ['shampoing', 'Hygiène & Beauté'],
  ['dentifrice', 'Hygiène & Beauté'],
  ['papier toilette', 'Hygiène & Beauté'],
  ['gel douche', 'Hygiène & Beauté'],
  ['deodorant', 'Hygiène & Beauté'],
  ['rasoir', 'Hygiène & Beauté'],
  ['brosse a dent', 'Hygiène & Beauté'],
  ['hygiene', 'Hygiène & Beauté'],
  ['papier', 'Hygiène & Beauté'],
  ['parapharmacie', 'Parapharmacie'],
  ['pansement', 'Parapharmacie'],
  ['paracetamol', 'Parapharmacie'],
  ['ibuprofene', 'Parapharmacie'],
  ['vitamine', 'Parapharmacie'],
  ['sparadrap', 'Parapharmacie'],
  ['desinfectant', 'Parapharmacie'],
  ['thermometre', 'Parapharmacie'],
  ['complement', 'Parapharmacie'],
  ['lessive', 'Entretien & Nettoyage'],
  ['eponge', 'Entretien & Nettoyage'],
  ['javel', 'Entretien & Nettoyage'],
  ['nettoyant', 'Entretien & Nettoyage'],
  ['sac poubelle', 'Entretien & Nettoyage'],
  ['liquide vaisselle', 'Entretien & Nettoyage'],
  ['balai', 'Entretien & Nettoyage'],
  ['serpilliere', 'Entretien & Nettoyage'],
  ['detache', 'Entretien & Nettoyage'],
  ['adoucissant', 'Entretien & Nettoyage'],
  ['essuie-tout', 'Entretien & Nettoyage'],
  ['menage', 'Entretien & Nettoyage'],
  // Après Entretien : « liquide vaisselle » reste du nettoyage.
  ['ampoule', 'Maison & Décoration'],
  ['bougie', 'Maison & Décoration'],
  ['cadre', 'Maison & Décoration'],
  ['rideau', 'Maison & Décoration'],
  ['nappe', 'Maison & Décoration'],
  ['coussin', 'Maison & Décoration'],
  ['miroir', 'Maison & Décoration'],
  ['vase', 'Maison & Décoration'],
  ['decoration', 'Maison & Décoration'],
  ['tapis', 'Maison & Décoration'],
  ['plante', 'Maison & Décoration'],
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
