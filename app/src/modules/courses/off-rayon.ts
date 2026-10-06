import { DEFAULT_RAYON, normalizeRayon, type Rayon } from './types';

/**
 * Derive le rayon d'un produit OpenFoodFacts depuis `categories_tags`.
 * Premiere correspondance gagne ; inconnu ou vide : `Divers` via
 * `normalizeRayon` (jamais de rayon invente hors RAYONS).
 *
 * Les etiquettes portent un prefixe de langue (`en:`, `fr:`) que la table
 * ignore : la cle est le slug nu en minuscules.
 */

const TAG_TO_RAYON: Record<string, Rayon> = {
  // Crèmerie
  dairies: 'Crèmerie & Produits laitiers',
  'fresh-foods': 'Crèmerie & Produits laitiers',
  yogurts: 'Crèmerie & Produits laitiers',
  cheeses: 'Crèmerie & Produits laitiers',
  eggs: 'Crèmerie & Produits laitiers',
  'plant-based-foods': 'Crèmerie & Produits laitiers',
  // Viande & Poissons
  meats: 'Viande & Poissons',
  fishes: 'Viande & Poissons',
  seafood: 'Viande & Poissons',
  // Charcuterie & Traiteur
  'cold-cuts': 'Charcuterie & Traiteur',
  // Boulangerie
  breads: 'Boulangerie',
  'breakfast-cereals': 'Boulangerie',
  biscuits: 'Boulangerie',
  pastries: 'Boulangerie',
  viennoiseries: 'Boulangerie',
  // Épicerie salée
  pastas: 'Épicerie salée',
  rice: 'Épicerie salée',
  'pâtes alimentaires': 'Épicerie salée',
  riz: 'Épicerie salée',
  condiments: 'Épicerie salée',
  sauces: 'Épicerie salée',
  oils: 'Épicerie salée',
  'canned-foods': 'Épicerie salée',
  // Épicerie sucrée
  chocolates: 'Épicerie sucrée',
  spreads: 'Épicerie sucrée',
  flours: 'Épicerie sucrée',
  sugars: 'Épicerie sucrée',
  // Bébé
  'baby-foods': 'Bébé',
  'infant-formulas': 'Bébé',
  diapers: 'Bébé',
  // Animalerie
  'pet-foods': 'Animalerie',
  'dog-foods': 'Animalerie',
  'cat-foods': 'Animalerie',
  // Fruits & legumes
  'fruits-and-vegetables': 'Fruits & légumes',
  fruits: 'Fruits & légumes',
  vegetables: 'Fruits & légumes',
  legumes: 'Fruits & légumes',
  // Hygiene & Beauté
  hygiene: 'Hygiène & Beauté',
  'oral-hygiene': 'Hygiène & Beauté',
  soaps: 'Hygiène & Beauté',
  shampoos: 'Hygiène & Beauté',
  // Entretien & Nettoyage
  'household-maintenance': 'Entretien & Nettoyage',
  detergents: 'Entretien & Nettoyage',
  'laundry-detergents': 'Entretien & Nettoyage',
  // Surgeles
  'frozen-foods': 'Surgelés',
  'ice-creams': 'Surgelés',
  // Boissons
  beverages: 'Boissons',
  sodas: 'Boissons',
  juices: 'Boissons',
  waters: 'Boissons',
  coffees: 'Boissons',
  teas: 'Boissons',
  beers: 'Boissons',
  wines: 'Boissons',
};

/** Normalise une etiquette OFF (`fr:Pâtes à tartiner`) en cle de table. */
function tagKey(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, '').trim().toLowerCase();
}

/**
 * Mappe `categories_tags` vers un rayon. Les libelles francais libres
 * (`fr:Pâtes à tartiner`) tentent d'abord `normalizeRayon` au cas ou OFF
 * nommerait directement un rayon ; sinon la table ci-dessus tranche.
 */
export function offCategoriesToRayon(categoriesTags: string[] | null | undefined): Rayon {
  if (!categoriesTags) return DEFAULT_RAYON;
  for (const tag of categoriesTags) {
    const key = tagKey(tag);
    if (key.length === 0) continue;
    // Table des slugs d'abord ; sinon nom de rayon (ou ancien nom, via les
    // alias de `normalizeRayon` : les lignes existantes convergent sans migration).
    const mapped = TAG_TO_RAYON[key];
    if (mapped) return mapped;
    const renamed = normalizeRayon(key);
    if (renamed !== DEFAULT_RAYON) return renamed;
  }
  return DEFAULT_RAYON;
}

/** Re-export de convenance : le rayon d'un produit OFF en une passe. */
export function offProductRayon(product: { categoriesTags: string[] } | null | undefined): Rayon {
  if (!product) return DEFAULT_RAYON;
  return offCategoriesToRayon(product.categoriesTags);
}

export { normalizeRayon };
