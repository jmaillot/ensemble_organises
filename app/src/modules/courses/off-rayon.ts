import { DEFAULT_RAYON, normalizeRayon, RAYONS, type Rayon } from './types';

/**
 * Derive le rayon d'un produit OpenFoodFacts depuis `categories_tags`.
 * Premiere correspondance gagne ; inconnu ou vide : `Divers` via
 * `normalizeRayon` (jamais de rayon invente hors RAYONS).
 *
 * Les etiquettes portent un prefixe de langue (`en:`, `fr:`) que la table
 * ignore : la cle est le slug nu en minuscules.
 */

const TAG_TO_RAYON: Record<string, Rayon> = {
  // Frais / laitages
  dairies: 'Frais',
  'fresh-foods': 'Frais',
  yogurts: 'Frais',
  cheeses: 'Frais',
  eggs: 'Frais',
  'plant-based-foods': 'Frais',
  // Boucherie / poisson
  meats: 'Boucherie',
  'cold-cuts': 'Boucherie',
  // Boulangerie
  breads: 'Boulangerie',
  'breakfast-cereals': 'Boulangerie',
  biscuits: 'Boulangerie',
  pastries: 'Boulangerie',
  viennoiseries: 'Boulangerie',
  // Poissonnerie (séparée de la Boucherie)
  fishes: 'Poissonnerie',
  seafood: 'Poissonnerie',
  // Épicerie
  pastas: 'Épicerie',
  rice: 'Épicerie',
  'pâtes alimentaires': 'Épicerie',
  riz: 'Épicerie',
  condiments: 'Épicerie',
  sauces: 'Épicerie',
  chocolates: 'Épicerie',
  spreads: 'Épicerie',
  flours: 'Épicerie',
  sugars: 'Épicerie',
  oils: 'Épicerie',
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
  // Hygiene
  hygiene: 'Hygiène',
  'oral-hygiene': 'Hygiène',
  soaps: 'Hygiène',
  shampoos: 'Hygiène',
  // Menage
  'household-maintenance': 'Ménage',
  detergents: 'Ménage',
  'laundry-detergents': 'Ménage',
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
    // Un libelle qui EST un rayon l'emporte sur la table.
    const direct = RAYONS.find((rayon) => rayon.toLowerCase() === key.replace(/-/g, ' '));
    if (direct) return direct;
    const mapped = TAG_TO_RAYON[key];
    if (mapped) return mapped;
  }
  return DEFAULT_RAYON;
}

/** Re-export de convenance : le rayon d'un produit OFF en une passe. */
export function offProductRayon(product: { categoriesTags: string[] } | null | undefined): Rayon {
  if (!product) return DEFAULT_RAYON;
  return offCategoriesToRayon(product.categoriesTags);
}

export { normalizeRayon };
