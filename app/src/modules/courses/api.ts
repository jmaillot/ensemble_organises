import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type { ShoppingListItemRow, ShoppingListRow } from '@/types';
import { normalizeRayon, type ShoppingItemInput, type ShoppingListInput } from './types';
import type { OffSearchHit } from './off-client';

export const SHOPPING_LISTS_TABLE = 'shopping_lists';
export const SHOPPING_ITEMS_TABLE = 'shopping_list_items';

/**
 * Écritures du module. Les lectures passent par `useResource`
 * (`src/lib/data/useResource.ts`), qui filtre sur le foyer courant, gère le
 * cache et l'invalidation ; seules les écritures propres au domaine sont ici.
 * `household_id` est renseigné explicitement : la RLS reste la seule barrière
 * d'autorisation côté serveur.
 */

export async function createShoppingList(input: ShoppingListInput): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>(SHOPPING_LISTS_TABLE, {
    household_id: input.householdId,
    name: input.name.trim(),
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
  });
}

export async function renameShoppingList(id: string, name: string): Promise<ShoppingListRow> {
  return data.update<ShoppingListRow>(SHOPPING_LISTS_TABLE, id, { name: name.trim() });
}

/** Erreur proxy avec repli direct autorisé (infra Edge, pas quota ni validation). */
export class OffProxyFallback extends Error {
  constructor() {
    super('proxy');
  }
}

/**
 * Recherche via le proxy Edge (cache 1 h, bascule miroirs côté serveur),
 * avec repli direct navigateur quand le proxy est injoignable — jamais sur
 * quota/validation (le direct aggraverait ou échouerait pareil).
 */
export async function searchOffCatalog(query: string, limit = 5): Promise<OffSearchHit[]> {
  const terms = query.trim();
  if (terms.length < 2) return [];
  if (isSupabaseConfigured && supabaseFunctionsBase && supabase) {
    try {
      return await searchOffProxy(terms, limit);
    } catch (proxyError) {
      if (!(proxyError instanceof OffProxyFallback)) throw proxyError;
    }
  }
  const { searchOffProducts } = await import('./off-client');
  return searchOffProducts(terms, { limit });
}

async function searchOffProxy(query: string, limit: number): Promise<OffSearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { data: authData } = await supabase!.auth.getSession();
    const response = await fetch(`${supabaseFunctionsBase}/off-search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        ...(authData.session?.access_token ? { authorization: `Bearer ${authData.session.access_token}` } : {}),
      },
      body: JSON.stringify({ q: query, limit }),
      signal: controller.signal,
    });
    if (response.status === 401) {
      // Session absente/expirée (JWT 1 h) : withSupabase répond
      // MISSING_CREDENTIALS/INVALID_JWT, un format sans champ `error`.
      // Dire quoi faire plutôt que « Recherche impossible ».
      throw new Error('Session expirée : reconnectez-vous puis réessayez.');
    }
    if (response.status === 400 || response.status === 429) {
      const detail = await response.json().catch(() => null);
      throw new Error((detail as { error?: string } | null)?.error ?? 'Recherche impossible.');
    }
    if (!response.ok) throw new OffProxyFallback();
    const payload = (await response.json().catch(() => null)) as { hits?: unknown } | null;
    if (!payload || !Array.isArray(payload.hits)) throw new OffProxyFallback();
    return (payload.hits as OffSearchHit[]).filter(
      (hit) => hit && typeof hit.name === 'string' && hit.name.length > 0,
    );
  } catch (error) {
    if (error instanceof OffProxyFallback) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error instanceof TypeError)) {
      throw new OffProxyFallback();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Supprime une liste puis ses articles : les deux écritures sont liées. */
export async function deleteShoppingList(id: string, householdId: string): Promise<void> {
  const items = await data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: householdId,
    list_id: id,
  });
  await Promise.all(items.map((item) => data.remove(SHOPPING_ITEMS_TABLE, item.id)));
  await data.remove(SHOPPING_LISTS_TABLE, id);
}

export async function createShoppingItem(input: ShoppingItemInput): Promise<ShoppingListItemRow> {
  return data.create<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: input.householdId,
    list_id: input.listId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    category: normalizeRayon(input.rayon),
    checked: false,
    added_by: input.addedBy,
    product_id: input.productId ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await data.remove(SHOPPING_ITEMS_TABLE, id);
}

export interface ShoppingItemUpdate {
  name: string;
  quantity: number | null;
  unit: string | null;
  rayon: string;
}

/** Renomme / re-quantifie / change le rayon d'un article (crop RLS existant). */
export async function updateShoppingItem(id: string, input: ShoppingItemUpdate): Promise<ShoppingListItemRow> {
  return data.update<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, id, {
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    category: normalizeRayon(input.rayon),
  });
}
