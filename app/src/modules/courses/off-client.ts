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

/** Résultat de recherche par nom : photo + rayon récupérables (WR-04 manuel). */
export interface OffSearchHit {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  categoriesTags: string[];
  lang: string | null;
}

const offSearchSchema = z.object({
  products: z
    .array(
      z.object({
        code: z.string().optional(),
        product_name: z.string().optional(),
        product_name_fr: z.string().optional(),
        brands: z.string().optional(),
        image_front_url: z.string().optional(),
        image_url: z.string().optional(),
        categories_tags: z.array(z.string()).optional(),
        lang: z.string().optional(),
      }),
    )
    .optional(),
});

function searchPath(query: string, limit: number): string {
  const params = new URLSearchParams({
    search_terms: query.trim(),
    page_size: String(Math.min(Math.max(limit, 1), 10)),
    fields: OFF_FIELDS,
  });
  return `/api/v2/search?${params.toString()}`;
}

interface OffSearchPayload {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  image_front_url?: string;
  image_url?: string;
  categories_tags?: string[];
  lang?: string;
}

function toSearchHit(payload: OffSearchPayload): OffSearchHit | null {
  const name = (payload.product_name_fr ?? payload.product_name ?? '').trim();
  if (name.length < 1 || name.length > 200) return null;
  return {
    ean: (payload.code ?? '').trim(),
    name,
    brand: (payload.brands ?? '').trim().slice(0, 200) || null,
    imageUrl: cleanOffImageUrl(payload.image_front_url) ?? cleanOffImageUrl(payload.image_url),
    categoriesTags: payload.categories_tags ?? [],
    lang: payload.lang ?? null,
  };
}

/**
 * Recherche par nom (saisie manuelle) : un tap explicite, pas d'autocomplete
 * (10 req/min côté recherche). Lève sur erreur réseau/timeout (le dialogue
 * affiche « réessayer ») ; tableau vide = aucun résultat → création manuelle.
 */
export async function searchOffProducts(query: string, options: FetchOffOptions & { limit?: number } = {}): Promise<OffSearchHit[]> {
  const terms = query.trim();
  if (terms.length < 2) return [];
  const timeoutMs = options.timeoutMs ?? OFF_TIMEOUT_MS;
  const userAgent = options.userAgent ?? OFF_USER_AGENT;
  const response = await getOff(searchPath(terms, options.limit ?? 5), timeoutMs, userAgent);
  if (!response.ok) throw new Error(`Recherche impossible (${response.status}).`);
  const parsed = offSearchSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Réponse de recherche inattendue.');
  return (parsed.data.products ?? [])
    .map(toSearchHit)
    .filter((hit): hit is OffSearchHit => hit !== null)
    .slice(0, 5);
}

function offProductPath(ean: string): string {
  return `/api/v2/product/${encodeURIComponent(ean)}.json?fields=${OFF_FIELDS}`;
}

const OFF_HOSTS = [
  'https://world.openfoodfacts.org',
  'https://api.openfoodfacts.org',
  'https://fr.openfoodfacts.org',
];

/** Erreur quota/surcharge : pas de bascule ni de retry, ça aggraverait. */
class OffOverloadedError extends Error {
  constructor() {
    super('Trop de recherches rapprochées ou Open Food Facts surchargé : patientez une minute.');
  }
}

async function getOnce(url: string, timeoutMs: number, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'X-User-Agent': userAgent },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET sur les miroirs OFF dans l'ordre, au premier succès technique : la
 * recherche flappe en 503 selon l'hôte/backend (constaté : world 503 pendant
 * que api répond 200, et inversement). 429 → quota immédiat, sans bascule.
 */
async function getOff(path: string, timeoutMs: number, userAgent: string): Promise<Response> {
  let lastError: unknown = null;
  for (const host of OFF_HOSTS) {
    let response: Response;
    try {
      response = await getOnce(`${host}${path}`, timeoutMs, userAgent);
    } catch (error) {
      lastError = error;
      continue;
    }
    if (response.status === 429) throw new OffOverloadedError();
    if (response.status >= 500) {
      lastError = new OffOverloadedError();
      continue;
    }
    return response;
  }
  if (lastError instanceof OffOverloadedError) throw lastError;
  throw new Error('Recherche impossible (réseau).');
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
 * Pertinence d'un résultat face à la requête (OFF renvoie parfois du bruit :
 * « snickers » peut ramener de l'eau minérale, voire un catalogue non filtré
 * — constaté en sondes live : `count` ~4,79 M, aucun nom/marque pertinent).
 * Score : nom contenant toute la requête (3), tous les jetons utiles dans
 * nom/marque (2), un jeton (1), sinon 0. Les zéros sont écartés ; si AUCUN
 * résultat ne score, on renvoie vide (création manuelle via l'état vide du
 * dialogue) plutôt que du bruit — afficher 5 produits sans rapport est pire
 * qu'aucun.
 */
export function rankSearchHits(hits: OffSearchHit[], query: string): OffSearchHit[] {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const full = normalize(query);
  const tokens = full.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const scored = hits.map((hit) => {
    const name = normalize(hit.name);
    const brand = normalize(hit.brand ?? '');
    let score = 0;
    if (full.length > 0 && name.includes(full)) score = 3;
    else if (tokens.length > 0 && tokens.every((token) => name.includes(token) || brand.includes(token))) score = 2;
    else if (tokens.some((token) => name.includes(token) || brand.includes(token))) score = 1;
    return { hit, score };
  });
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  if (best === 0) return [];
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit);
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
    response = await getOff(offProductPath(code), timeoutMs, userAgent);
  } catch {
    return { status: 'error' };
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
