/**
 * Edge Function `place-search`.
 *
 * Point d'entrée : `POST /functions/v1/place-search`
 * Corps : `{ q: string, limit?: number }`
 *
 * Proxy de recherche d'adresse Nominatim (OpenStreetMap) avec cache.
 * Contexte : le formulaire de lieu demande une rue, un code postal et une
 * ville à la main ; la recherche en ligne les préremplit. Nominatim passe par
 * un proxy pour trois raisons : la politique d'usage exige un User-Agent
 * identifié (impossible à poser depuis un navigateur), le quota (1 req/s)
 * doit être borné côté serveur, et un cache évite de re-questionner OSM pour
 * la même adresse tapée deux fois.
 *
 * La lecture de la réponse vit dans `nominatim.ts`, module pur testé par la
 * suite Vitest du frontend (motif `web-push.ts` de `push-notify`) ; ce
 * fichier porte tout ce qui demande le runtime Deno.
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user']` — session obligatoire. Le géocodage public est gratuit,
 *   mais un proxy ouvert à la clé publiable serait un relais d'abus (notre IP
 *   bloquée par OSM) : seuls les utilisateurs connectés cherchent.
 *
 * CONTRAT DE RÉPONSE
 *   succès -> { hits: [{ name, street, postalCode, city, label }] }
 *   (hits triés par pertinence Nominatim ; `label` est la ligne complète
 *   lisible, `name` le nom du lieu quand OSM en connaît un)
 *   erreurs -> { error } (400 validation, 429 quota, 502 OSM injoignable)
 */

import { withSupabase } from '@supabase/server';
import { z } from 'npm:zod@4.6.5';
import { parseNominatimSearch, type PlaceHit } from './nominatim.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_TIMEOUT_MS = 8000;
/** Identifiant imposé par la politique d'usage de Nominatim. */
const NOMINATIM_USER_AGENT = 'EnsembleOrganises/1.0 (jeremymaillot@gmail.com)';

/** Quota côté proxy : 6 requêtes/min/IP (marge sous le 1 req/s d'OSM). */
const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 6;
const MAX_TRACKED_CLIENTS = 5_000;
const counters = new Map<string, { count: number; resetAt: number }>();

/** Cache best-effort : 1 h, 200 requêtes max (mémoire d'instance). */
const CACHE_TTL_MS = 3_600_000;
const CACHE_MAX = 200;
const cache = new Map<string, { expiresAt: number; hits: PlaceHit[] }>();

const requestSchema = z.object({
  q: z.string().trim().min(3, 'Recherche trop courte.').max(120),
  limit: z.number().int().min(1).max(8).optional(),
});

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
  const key = `place:${clientAddress(request)}`;
  const entry = counters.get(key);
  if (entry && entry.resetAt > now) {
    entry.count += 1;
    return entry.count > LIMIT_PER_MINUTE;
  }
  if (counters.size > MAX_TRACKED_CLIENTS) counters.clear();
  counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
  return false;
}

async function fetchNominatim(terms: string, limit: number): Promise<PlaceHit[] | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: terms,
    limit: String(limit),
    addressdetails: '1',
    'accept-language': 'fr',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      signal: controller.signal,
    });
    if (response.status === 429 || response.status >= 500) return null;
    if (!response.ok) return null;
    return parseNominatimSearch(await response.json().catch(() => null));
  } catch {
    return null;
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

      const hits = await fetchNominatim(terms, limit);
      if (hits === null) {
        return json({ error: 'La recherche d’adresse est indisponible pour le moment.' }, 502);
      }
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, hits });
      return json({ hits });
    } catch (error) {
      console.error('place-search: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
