/**
 * Edge Function `off-search`.
 *
 * Point d'entrée : `POST /functions/v1/off-search`
 * Corps : `{ q: string, limit?: number }`
 *
 * Proxy de recherche Open Food Facts avec cache. Contexte : l'endpoint
 * historique `/api/v2/search?search_terms=` ne filtre plus (constaté en
 * 2026-10 : `count` ~4,79 M, catalogue brut quelle que soit la requête —
 * `world` répond même du HTML « temporarily unavailable », `fr` du 503).
 * La recherche passe donc par le moteur officiel `search.openfoodfacts.org`
 * (search-a-licious), qui ne renvoie ni photo ni `categories_tags` : chaque
 * code est enrichi via la fiche produit `/api/v2/product/{code}.json`
 * (le même endpoint que le scan, éprouvé), avec bascule entre miroirs.
 *
 * Le proxy contourne trois problèmes : bascule entre miroirs côté serveur
 * (insensible au CORS — un 503 sans en-têtes CORS affiche « CORS » dans le
 * navigateur pour une panne serveur), cache d'une heure (les recherches
 * répétées ne touchent plus OFF), quota miroir d'OFF.
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user']` — session obligatoire. Les lectures OFF sont publiques,
 *   mais un proxy ouvert à la clé publiable serait un relais d'abus (notre IP
 *   bannie chez OFF) : seuls les utilisateurs connectés cherchent.
 *
 * CONTRAT DE RÉPONSE
 *   search -> { hits: [{ ean, name, brand, imageUrl, categoriesTags, lang }] }
 *   (hits triés par pertinence, vide si aucun pertinent : le moteur renvoie
 *   parfois du bruit, que le proxy ne met plus en cache tel quel)
 *   erreurs -> { error } (400 validation, 429 quota, 502 OFF injoignable)
 */

import { withSupabase } from '@supabase/server';
import { z } from 'npm:zod@4.6.5';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const OFF_HOSTS = [
  'https://world.openfoodfacts.org',
  'https://api.openfoodfacts.org',
  'https://fr.openfoodfacts.org',
];
/** Moteur de recherche officiel (search-a-licious) : seul hôte, pas de miroirs. */
const SEARCH_ENGINE_URL = 'https://search.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_fr,brands,image_front_url,categories_tags,lang';
const OFF_TIMEOUT_MS = 8000;
const OFF_IMAGE_HOST = /^https:\/\/images\.openfoodfacts\.org\//;

/** Quota miroir d'OFF côté recherche : 10 req/min/IP. */
const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 10;
const MAX_TRACKED_CLIENTS = 5_000;
const counters = new Map<string, { count: number; resetAt: number }>();

/** Cache best-effort : 1 h, 200 requêtes max (mémoire d'instance). */
const CACHE_TTL_MS = 3_600_000;
const CACHE_MAX = 200;
const cache = new Map<string, { expiresAt: number; hits: OffHit[] }>();

const requestSchema = z.object({
  q: z.string().trim().min(2, 'Recherche trop courte.').max(80),
  limit: z.number().int().min(1).max(5).optional(),
});

interface OffHit {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  categoriesTags: string[];
  lang: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? request.headers.get('cf-connecting-ip') ?? 'inconnu').trim();
}

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  const key = `search:${clientAddress(request)}`;
  const entry = counters.get(key);
  if (entry && entry.resetAt > now) {
    entry.count += 1;
    return entry.count > LIMIT_PER_MINUTE;
  }
  if (counters.size > MAX_TRACKED_CLIENTS) counters.clear();
  counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
  return false;
}

function cleanImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('https://')) return null;
  return OFF_IMAGE_HOST.test(value) ? value : null;
}

/**
 * Pertinence face à la requête, miroir de `rankSearchHits` (off-client.ts) :
 * OFF renvoie parfois un catalogue non filtré (sondes live : `count` ~4,79 M,
 * aucun nom/marque pertinent pour « snickers »). Score nom/marque exact (3),
 * tous jetons (2), un jeton (1), sinon 0 ; aucun pertinent → vide (le dialogue
 * affiche sa création manuelle) plutôt que du bruit mis en cache 1 h.
 */
function normalizeHitText(value: string): string {
  return value
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function rankHits(hits: OffHit[], query: string): OffHit[] {
  const full = normalizeHitText(query);
  const tokens = full.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const scored = hits.map((hit) => {
    const name = normalizeHitText(hit.name);
    const brand = normalizeHitText(hit.brand ?? '');
    let score = 0;
    if (full.length > 0 && name.includes(full)) score = 3;
    else if (tokens.length > 0 && tokens.every((token) => name.includes(token) || brand.includes(token))) score = 2;
    else if (tokens.some((token) => name.includes(token) || brand.includes(token))) score = 1;
    return { hit, score };
  });
  if (!scored.some((entry) => entry.score > 0)) return [];
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit);
}

const searchResponseSchema = z.object({
  hits: z.array(z.object({ code: z.string().optional() })).optional(),
});

const productResponseSchema = z.object({
  status: z.number(),
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

/**
 * Étape 1 : codes EAN pertinents depuis le moteur de recherche officiel.
 * `null` = panne technique (429/5xx/réseau) ; `[]` = aucun code.
 */
async function fetchSearchCodes(terms: string, fetchN: number): Promise<string[] | null> {
  const params = new URLSearchParams({ q: terms, page_size: String(fetchN) });
  let response: Response;
  try {
    response = await fetchUpstream(`${SEARCH_ENGINE_URL}/search?${params.toString()}`);
  } catch {
    return null;
  }
  if (response.status === 429 || response.status >= 500) return null;
  if (!response.ok) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  // TEMP-DIAG-429 : réponse brute du moteur, à retirer après résolution.
  const rawSample = JSON.stringify((parsed.hits ?? []).slice(0, 3).map((hit) => hit.code));
  console.log(`off-search diag moteur "${terms}" hits=${(parsed.hits ?? []).length} echantillon=${rawSample}`);
  return (parsed.hits ?? [])
    .map((hit) => (hit.code ?? '').trim())
    .filter((code) => /^\d{8,14}$/.test(code));
}

/**
 * Étape 2 : fiche produit (photo + `categories_tags`), même endpoint que le
 * scan, avec bascule entre miroirs. `null` = fiche inexploitable.
 */
async function fetchProductHit(code: string): Promise<OffHit | null> {
  const params = new URLSearchParams({ fields: OFF_FIELDS });
  const path = `/api/v2/product/${encodeURIComponent(code)}.json?${params.toString()}`;
  for (const host of OFF_HOSTS) {
    let response: Response;
    try {
      response = await fetchUpstream(`${host}${path}`);
    } catch {
      continue;
    }
    if (response.status === 429) return null;
    if (response.status >= 500) continue;
    if (!response.ok) continue;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      continue;
    }
    const parsed = productResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) continue;
    return toHit({ ...parsed.data.product, code });
  }
  return null;
}

function toHit(raw: Record<string, unknown>): OffHit | null {
  const name = String(raw.product_name_fr ?? raw.product_name ?? '').trim();
  if (name.length < 1 || name.length > 200) return null;
  const brands = String(raw.brands ?? '').trim().slice(0, 200) || null;
  const tags = Array.isArray(raw.categories_tags)
    ? raw.categories_tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20)
    : [];
  return {
    ean: String(raw.code ?? '').trim(),
    name,
    brand: brands,
    imageUrl: cleanImageUrl(raw.image_front_url) ?? cleanImageUrl((raw as { image_url?: unknown }).image_url),
    categoriesTags: tags,
    lang: typeof raw.lang === 'string' ? raw.lang : null,
  };
}

async function fetchUpstream(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'X-User-Agent': 'EnsembleOrganises/1.0 (jeremymaillot@gmail.com)' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(
  withSupabase({ auth: ['user'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }
      if (ctx.authMode !== 'user' || !ctx.userClaims?.id) {
        return json({ error: 'Connectez-vous pour rechercher.' }, 401);
      }

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'Corps de requête JSON invalide.' }, 400);
      }
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Recherche invalide.' }, 400);
      }
      const terms = parsed.data.q.trim();
      const limit = parsed.data.limit ?? 5;

      if (isRateLimited(request)) {
        return json({ error: 'Trop de recherches rapprochées : patientez une minute.' }, 429);
      }
      const cacheKey = `${terms.toLowerCase()}|${limit}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return json({ hits: cached.hits });
      }

      // Étape 1 : codes pertinents (moteur officiel), étape 2 : fiches
      // produit (photo + rayon), en parallèle. Marge d'enrichissement :
      // certaines fiches sont inexploitables, le rangement tranche ensuite.
      const fetchN = Math.min(limit + 3, 10);
      // TEMP-DIAG-429 : journal de diagnostic, à retirer après résolution.
      const codes = await fetchSearchCodes(terms, fetchN);
      const enriched = await Promise.all(codes === null ? [] : codes.slice(0, fetchN).map((code) => fetchProductHit(code)));
      const usable = enriched.filter((hit): hit is OffHit => hit !== null);
      console.log(`off-search diag q="${terms}" engine=${codes === null ? 'PANNE' : codes.length} codes enrichis=${usable.length}/${enriched.length}`);
      if (codes === null) {
        return json({ error: 'Open Food Facts injoignable pour le moment.' }, 502);
      }
      const hits = usable.slice(0, limit);
      const ranked = rankHits(hits, terms);
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, hits: ranked });
      return json({ hits: ranked });
    } catch (error) {
      console.error('off-search: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
