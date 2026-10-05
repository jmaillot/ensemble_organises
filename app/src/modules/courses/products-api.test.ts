import { describe, expect, it } from 'vitest';
import { data } from '@/lib/data';
import type { ProductRow, ShoppingListItemRow, ShoppingListRow } from '@/types';
import {
  findOrCreateProduct,
  PRODUCTS_TABLE,
  productInputFromOff,
  resolveScannedProduct,
} from './products-api';
import { SHOPPING_ITEMS_TABLE } from './api';
import type { OffProduct } from './off-client';

/**
 * La resolution scan→produit→item s'exerce sur l'adaptateur local (IndexedDB
 * simule) : sans configuration Supabase en test, `data` est local et les
 * ecritures passent par le meme contrat que PostgREST (list/create/update).
 */

const HOUSEHOLD = 'household-scan-test';
const OTHER_HOUSEHOLD = 'household-scan-test-autre';

async function createList(householdId: string, name: string): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>('shopping_lists', {
    household_id: householdId,
    name,
    created_by: null,
    created_at: new Date().toISOString(),
  });
}

async function productsOf(householdId: string): Promise<ProductRow[]> {
  return data.list<ProductRow>(PRODUCTS_TABLE, { household_id: householdId });
}

async function itemsOf(listId: string): Promise<ShoppingListItemRow[]> {
  return data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, { list_id: listId });
}

const NUTELLA_OFF: OffProduct = {
  ean: '3017620422003',
  name: 'Nutella',
  brand: 'Nutella, Ferrero',
  imageUrl: 'https://images.openfoodfacts.org/front_fr.jpg',
  categoriesTags: ['en:spreads'],
  lang: 'fr',
};

describe('findOrCreateProduct', () => {
  it('cree le produit du foyer au premier scan', async () => {
    const product = await findOrCreateProduct({
      householdId: HOUSEHOLD,
      ean: NUTELLA_OFF.ean,
      name: NUTELLA_OFF.name,
      brand: NUTELLA_OFF.brand,
    });
    expect(product.ean).toBe('3017620422003');
    expect(product.name).toBe('Nutella');
    expect(product.household_id).toBe(HOUSEHOLD);
  });

  it('retourne l\'existant sans doublon au second appel', async () => {
    const first = await findOrCreateProduct({
      householdId: HOUSEHOLD,
      ean: '5000159461122',
      name: 'The',
    });
    const second = await findOrCreateProduct({
      householdId: HOUSEHOLD,
      ean: '5000159461122',
      name: 'The renomme',
    });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('The');
    const rows = await data.list<ProductRow>(PRODUCTS_TABLE, {
      household_id: HOUSEHOLD,
      ean: '5000159461122',
    });
    expect(rows).toHaveLength(1);
  });

  it('isole les catalogues : meme EAN dans deux foyers', async () => {
    const a = await findOrCreateProduct({ householdId: HOUSEHOLD, ean: '4000400107029', name: 'Miel A' });
    const b = await findOrCreateProduct({
      householdId: OTHER_HOUSEHOLD,
      ean: '4000400107029',
      name: 'Miel B',
    });
    expect(a.id).not.toBe(b.id);
    expect(await productsOf(OTHER_HOUSEHOLD)).toHaveLength(1);
  });
});

describe('productInputFromOff', () => {
  it('ne copie jamais l\'image OFF dans photo_url (D-05)', async () => {
    const product = await findOrCreateProduct(productInputFromOff(HOUSEHOLD, NUTELLA_OFF));
    expect(product.photo_url).toBeNull();
    expect(product.off_data.image_url).toBe(NUTELLA_OFF.imageUrl);
  });
});

describe('resolveScannedProduct', () => {
  it('enregistre le produit ET l\'ajoute a la liste en un tap (D-02)', async () => {
    const list = await createList(HOUSEHOLD, 'Fresque');
    const resolution = await resolveScannedProduct({
      householdId: HOUSEHOLD,
      listId: list.id,
      ean: '8076809530358',
      name: 'Pates',
      brand: 'Barilla',
      category: 'Divers',
    });
    expect(resolution.incremented).toBe(false);
    expect(resolution.item.product_id).toBe(resolution.product.id);
    expect(resolution.item.name).toBe('Pates');
    expect(await itemsOf(list.id)).toHaveLength(1);
  });

  it('re-scan : quantite +1, zero nouvelle ligne, zero nouveau produit (D-04)', async () => {
    const list = await createList(HOUSEHOLD, 'Maison');
    const input = {
      householdId: HOUSEHOLD,
      listId: list.id,
      ean: '8002270014901',
      name: 'Riz',
      category: 'Divers' as const,
    };
    const first = await resolveScannedProduct(input);
    expect(first.incremented).toBe(false);
    const second = await resolveScannedProduct(input);
    expect(second.incremented).toBe(true);
    expect(second.product.id).toBe(first.product.id);
    const items = await itemsOf(list.id);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it('re-scan d\'un article coche : decoche + quantite +1', async () => {
    const list = await createList(HOUSEHOLD, 'Courses');
    const input = {
      householdId: HOUSEHOLD,
      listId: list.id,
      ean: '3175681122497',
      name: 'Lentilles',
      category: 'Divers' as const,
    };
    const first = await resolveScannedProduct(input);
    await data.update<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, first.item.id, { checked: true });
    const second = await resolveScannedProduct(input);
    expect(second.incremented).toBe(true);
    expect(second.item.checked).toBe(false);
    expect(second.item.quantity).toBe(2);
    expect(await itemsOf(list.id)).toHaveLength(1);
  });
});
