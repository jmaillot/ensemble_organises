import { data, DataError } from '@/lib/data';
import type { ProductRow, ShoppingListItemRow } from '@/types';
import { createShoppingItem, SHOPPING_ITEMS_TABLE } from './api';
import { type OffProduct } from './off-client';
import { normalizeRayon } from './types';

/**
 * Resolution scan → produit du foyer → article en liste (D-02, D-04, D-09).
 *
 * Le produit est la cle (foyer, EAN) : un re-scan ne duplique jamais, il
 * incremente la quantite de l'article existant. L'image OpenFoodFacts ne
 * transite que par `off_data` : `photo_url` reste reserve a la photo locale
 * signee (D-05, T-04-02).
 */

export const PRODUCTS_TABLE = 'products';

export interface FindProductInput {
  householdId: string;
  ean: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  offData?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface ResolveScanInput extends FindProductInput {
  listId: string;
  addedBy?: string | null;
}

export interface ScanResolution {
  product: ProductRow;
  item: ShoppingListItemRow;
  /** Vrai quand le re-scan a incremente un article existant (D-04). */
  incremented: boolean;
}

function productPayload(input: FindProductInput) {
  return {
    household_id: input.householdId,
    ean: input.ean.trim(),
    name: input.name.trim(),
    brand: input.brand?.trim().slice(0, 200) || null,
    category: normalizeRayon(input.category),
    photo_url: null,
    off_data: input.offData ?? {},
    created_by: input.createdBy ?? null,
  };
}

/**
 * Retrouve le produit (foyer, EAN) ou le cree. La course a la creation entre
 * deux appareils se resout sur la contrainte unique : relecture et retour de
 * la ligne gagnante, jamais d'exception vers l'UI.
 */
export async function findOrCreateProduct(input: FindProductInput): Promise<ProductRow> {
  const existing = await data.list<ProductRow>(PRODUCTS_TABLE, {
    household_id: input.householdId,
    ean: input.ean.trim(),
  });
  if (existing.length > 0) return existing[0];
  try {
    return await data.create<ProductRow>(PRODUCTS_TABLE, {
      ...productPayload(input),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    const raced = await data.list<ProductRow>(PRODUCTS_TABLE, {
      household_id: input.householdId,
      ean: input.ean.trim(),
    });
    if (raced.length > 0) return raced[0];
    throw error;
  }
}

/** Construit l'entree `findOrCreateProduct` depuis un enrichissement OFF. */
export function productInputFromOff(
  householdId: string,
  off: OffProduct,
  overrides: { category?: string | null; createdBy?: string | null } = {},
): FindProductInput {
  return {
    householdId,
    ean: off.ean,
    name: off.name,
    brand: off.brand,
    category: overrides.category ?? null,
    offData: {
      code: off.ean,
      brands: off.brand,
      image_url: off.imageUrl,
      lang: off.lang,
      fetched_at: new Date().toISOString(),
    },
    createdBy: overrides.createdBy ?? null,
  };
}

/**
 * Totale 1-tap de la fiche (D-02) : enregistre le produit ET l'ajoute a la
 * liste courante. Re-scan d'un produit deja present : quantite +1 sur
 * l'article existant (decoché au passage), zero nouvelle ligne (D-04).
 */
export async function resolveScannedProduct(input: ResolveScanInput): Promise<ScanResolution> {
  const product = await findOrCreateProduct(input);
  const siblings = await data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: input.householdId,
    list_id: input.listId,
    product_id: product.id,
  });
  const current = siblings[0];
  if (current) {
    const item = await data.update<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, current.id, {
      quantity: (current.quantity ?? 0) + 1,
      checked: false,
    });
    return { product, item, incremented: true };
  }
  const item = await createShoppingItem({
    householdId: input.householdId,
    listId: input.listId,
    name: product.name,
    quantity: null,
    unit: null,
    rayon: normalizeRayon(product.category),
    addedBy: input.addedBy ?? null,
    productId: product.id,
  });
  return { product, item, incremented: false };
}
