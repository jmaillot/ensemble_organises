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
 *
 * POURQUOI LES ARTICLES NE S'ÉCRIVENT PLUS ICI (G-34-1). `buildShoppingItemValues`
 * est le payload PUR de l'article : le hook `use-courses.ts` le transmet à
 * `itemResource.create/update` (couche mutation Tier 1) — c'est là que
 * l'identité client (`id` + `client_key` via prepareCreate), l'overlay
 * optimiste, la marque D-02 pour l'enfilage hors-ligne et la garde D-07 sont
 * posés. Un appel `data.*` brut ici contournerait toute la chaîne.
 *
 * POURQUOI LES LISTES RESTENT BRUTES. `shopping_lists` est HORS liste
 * blanche (WRITE_ALLOWLIST, write-policy.ts) : hors ligne, la garde
 * adaptateur les refuse avec `OFFLINE_WRITE_REFUSED_MESSAGE` — c'est un
 * choix assumé de D-07, pas un oubli : seul l'article (table `client_key`)
 * est rejouable de façon idempotente.
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

/** Supprime une liste puis ses articles : les deux écritures sont liées.
 *
 * `removeItem` est le mutateur Tier 1 (`itemResource.remove`) injecté par
 * `use-courses.ts` : la suppression des ARTICLES passe par la couche
 * mutation (marque D-02, enfilage) comme leurs autres écritures. La liste
 * elle-même reste un appel brut (`shopping_lists` hors liste blanche, voir
 * le commentaire d'en-tête).
 *
 * WR-04 : la liste part D'ABORD. Hors ligne, le refus D-07 sur
 * `shopping_lists` doit preceder tout enfilage : a l'inverse, les articles
 * partaient en file (table allowlistée) PUIS la liste etait refusee —
 * l'utilisateur voyait « suppression impossible » pendant que ses articles
 * partaient quand meme au rejeu, laissant une liste fantome vide cote
 * serveur. Si la liste part, les articles suivent ; si elle est refusee,
 * rien n'est enfile.
 */
export async function deleteShoppingList(
  id: string,
  householdId: string,
  removeItem: (itemId: string) => Promise<void>,
): Promise<void> {
  const items = await data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: householdId,
    list_id: id,
  });
  await data.remove(SHOPPING_LISTS_TABLE, id);
  await Promise.all(items.map((item) => removeItem(item.id)));
}

/** Articles d'une liste (lecture ciblée pour la fusion à l'envoi recette). */
export async function listShoppingItems(listId: string, householdId: string): Promise<ShoppingListItemRow[]> {
  return data.list<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, {
    household_id: householdId,
    list_id: listId,
  });
}

/**
 * Payload PUR d'un article : aucune écriture. Le consommateur (hook
 * `use-courses.ts`, mutateurs injectés dans `products-api.ts`) le transmet à
 * la couche mutation Tier 1 — voir le commentaire d'en-tête du module.
 */
export function buildShoppingItemValues(input: ShoppingItemInput): Partial<ShoppingListItemRow> {
  return {
    household_id: input.householdId,
    list_id: input.listId,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    category: normalizeRayon(input.rayon),
    checked: false,
    added_by: input.addedBy,
    product_id: input.productId ?? null,
    // Rang du foyer (0139) : un article ajouté à la suite vient APRÈS ceux
    // qui sont déjà là. Sans ce rang, il se retrouverait au premier rang.
    position: input.position ?? 0,
    created_at: new Date().toISOString(),
  };
}

/**
 * VOIES BRUTES CONSERVÉES HORS PÉRIMÈTRE 34-05 — NE PAS EN AJOUTER.
 *
 * Ces trois aides écrivent un article par un appel adaptateur brut, sans
 * couche mutation : aucune `client_key` posée par prepareCreate, aucun
 * enfilage D-02, aucun overlay. Elles ne restent que pour les appelants qui
 * ne possèdent PAS de couche hook (`sendRecipeIngredientsToCourses` côté
 * recettes, onglet voyage `trip-courses-tab`), dont le routage Tier 1 est un
 * chantier distinct. Hors ligne, la garde adaptateur (write-policy.ts,
 * T-34-05) laisse passer ces tables allowlistées et l'échec réseau remonte
 * tel quel à leur toast — comportement inchangé, refus clair seulement pour
 * les tables hors liste. Les chemins Courses du FOYER passent tous par
 * `use-courses.ts` (Tier 1) : ne pas rattacher de nouveau chemin ici.
 */
export async function createShoppingItem(input: ShoppingItemInput): Promise<ShoppingListItemRow> {
  return data.create<ShoppingListItemRow>(SHOPPING_ITEMS_TABLE, buildShoppingItemValues(input));
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

export async function deleteShoppingItem(id: string): Promise<void> {
  await data.remove(SHOPPING_ITEMS_TABLE, id);
}
