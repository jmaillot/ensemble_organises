import { z } from 'zod';

/**
 * Client OpenFoodFacts en appel direct navigateur (D-07 : pas de proxy Edge,
 * CORS `*` verifie par sondes). Lectures seules, sans cle : la reponse JSON
 * n'est jamais executee, elle est validee par zod avant tout usage (T-04-02).
 */

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';
/** Attribution obligatoire des lectures (D-08). */
export const OFF_USER_AGENT = 'EnsembleOrganises/1.0 (jeremymaillot@gmail.com)';
/** Delai d'abandon d'un appel : au-dela, repli creation manuelle (D-01). */
export const OFF_TIMEOUT_MS = 8000;

const OFF_FIELDS =
  'code,product_name,product_name_fr,brands,image_front_url,categories_tags,lang';

/** Un EAN interrogeable : 8 a 14 chiffres (contrainte SQL 0071). */
export function isQueryableEan(value: string | null | undefined): boolean {
  return /^\d{8,14}$/.test((value ?? '').trim());
}

/** Reponse OFF v2 : 200 + `status: 1` (trouve), 404 + `status: 0` (inconnu),
 *  200 + `status: 0` (code invalide). Seul le statut HTTP 404 discrimine
 *  l'inconnu de l'invalide : `fetch` ne rejette pas sur 404, la branche est
 *  donc explicite et ne leve jamais (D-01). */
const offResponseSchema = z.object({
  status: z.number(),
  status_verbose: z.string().optional(),
  code: z.string().optional(),
  product: z
    .object({
      code: z.string().optional(),
      product_name: z.string().optional(),
      product_name_fr: z.string().optional(),
      brands: z.string().optional(),
      image_front_url: z.string().optional(),
      image_url: z.string().optional(),
      categories_tags: z.array(z.string()).optional(),
      lang: z.string().optional(),
    })
    .optional(),
});

/** Hôte d'images officiel : toute autre origine est rejetée (CR-01). */
const OFF_IMAGE_HOST = /^https:\/\/images\.openfoodfacts\.org\//;

/**
 * URL d'illustration OFF validée : https + hôte officiel uniquement. OFF est
 * une base éditable par le public : sans allowlist, un éditeur peut pointer
 * l'image vers un hôte traqueur, non-HTTPS ou un schéma actif (`data:`).
 * React n'assainit pas les schémas d'URL en attribut.
 */
export function cleanOffImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && OFF_IMAGE_HOST.test(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/** Produit normalise pour la fiche : jamais de hotlink persistant, `imageUrl`
 *  n'est qu'un repli d'affichage transitoire (D-05). */
export interface OffProduct {
  ean: string;
  name: string;
  brand: string | null;
  /** URL OFF d'illustration, affichage seul : jamais copiee dans `photo_url`. */
  imageUrl: string | null;
  categoriesTags: string[];
  lang: string | null;
}

export interface FetchOffOptions {
  timeoutMs?: number;
  userAgent?: string;
}

function offUrl(ean: string): string {
  return `${OFF_BASE_URL}/api/v2/product/${encodeURIComponent(ean)}.json?fields=${OFF_FIELDS}`;
}

async function getOnce(ean: string, timeoutMs: number, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(offUrl(ean), {
      headers: { 'X-User-Agent': userAgent },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function toOffProduct(ean: string, payload: z.infer<typeof offResponseSchema>): OffProduct | null {
  if (payload.status !== 1 || !payload.product) return null;
  const name = (payload.product.product_name_fr ?? payload.product.product_name ?? '').trim();
  if (name.length < 1 || name.length > 200) return null;
  const brand = (payload.product.brands ?? '').trim().slice(0, 200) || null;
  return {
    ean,
    name,
    brand,
    imageUrl:
      cleanOffImageUrl(payload.product.image_front_url) ?? cleanOffImageUrl(payload.product.image_url),
    categoriesTags: payload.product.categories_tags ?? [],
    lang: payload.product.lang ?? null,
  };
}

/**
 * Résultat discriminant (WR-04) : `unknown` (404/valide-absent → création
 * manuelle) n'est PAS `error` (réseau/timeout/5xx/payload → réessayer).
 * Confondre les deux crée des doublons divergents pour un même EAN.
 */
export type OffFetchResult =
  | { status: 'found'; product: OffProduct }
  | { status: 'unknown' }
  | { status: 'error' };

export async function fetchOffResult(ean: string, options: FetchOffOptions = {}): Promise<OffFetchResult> {
  const code = ean.trim();
  if (!isQueryableEan(code)) return { status: 'unknown' };
  const timeoutMs = options.timeoutMs ?? OFF_TIMEOUT_MS;
  const userAgent = options.userAgent ?? OFF_USER_AGENT;

  let response: Response;
  try {
    response = await getOnce(code, timeoutMs, userAgent);
  } catch {
    // Unique retry sur erreur reseau/timeout, puis erreur franche.
    try {
      response = await getOnce(code, timeoutMs, userAgent);
    } catch {
      return { status: 'error' };
    }
  }
  if (response.status === 404) return { status: 'unknown' };
  if (!response.ok) return { status: 'error' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'error' };
  }
  const parsed = offResponseSchema.safeParse(body);
  if (!parsed.success) return { status: 'error' };
  const product = toOffProduct(code, parsed.data);
  return product ? { status: 'found', product } : { status: 'error' };
}

/**
 * Enrichit un EAN via OpenFoodFacts, ou `null` vers la creation manuelle :
 * EAN inconnu (404), code invalide (`status: 0`), EAN non interrogeable,
 * payload inattendu, reseau/timeout (apres un unique retry, T-04-04).
 */
export async function fetchOffProduct(
  ean: string,
  options: FetchOffOptions = {},
): Promise<OffProduct | null> {
  const result = await fetchOffResult(ean, options);
  return result.status === 'found' ? result.product : null;
}
