/**
 * Edge Function `household-invite-preview`.
 *
 * Point d'entrée : `POST /functions/v1/household-invite-preview`
 * Corps : `{ token: '<base64url>' }`
 *
 * Consultation pré-auth du pré-écran d'inscription (phase 31, D-01) : avant de
 * créer un compte, la personne qui reçoit un lien d'invitation voit QUEL foyer
 * l'invite — sans session, sans consommer le token.
 *
 * MODE D'AUTHENTIFICATION DÉCLARÉ
 *   `auth: ['publishable']` → clé publiable, aucun JWT requis. C'est le seul
 *   mode : cette fonction n'exécute AUCUNE action, elle lit via le RPC
 *   `preview_household_invite_token` (0176), le seul callable pré-auth du lot.
 *
 * SÉCURITÉ
 *   * Le JavaScript ne compare JAMAIS l'empreinte : le HMAC est calculé ici,
 *     puis la comparaison à temps constant se joue EN BASE
 *     (`private.token_hash_matches`, migration 0176).
 *   * LECTURE PURE (D-05) : le RPC ne touche ni `use_count` ni `is_active` —
 *     consultait un lien ne le consomme jamais (prouvé par le test SQL 0176
 *     cas d). Cette fonction ne contient aucune écriture.
 *   * RÉPONSE MINIMALE (D-02) : au succès, uniquement `householdName` et
 *     `inviterFirstName` — pas de couleur, pas d'avatar, pas de compteur.
 *   * RÉPONSE UNIFORME (D-03) : tout motif d'échec (token inconnu, expiré,
 *     épuisé, révoqué, empreinte malformée, erreur) produit LA MÊME réponse
 *     404 avec le même message — aucune énumération possible. La distinction
 *     des motifs n'existe QUE côté redeem authentifié (household-invite).
 *   * RATE LIMIT (D-04) : mécanique applicative du gabarit household-invite,
 *     clé `preview`, seuil 8/min/IP (≤ redeem). Pas de barrière Traefik
 *     additionnelle — la discretion est portée ici.
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`, forme équivalente à `export default { fetch }`.
 */

// Spécificateur BARE (pas `npm:`) : le runtime publie une table d'importation
// à sa racine (`volumes/functions/deno.jsonc`) qui épingle `@supabase/server`
// à `npm:@supabase/server@^1`. Dépendre de cet épinglage, au même titre que
// les fonctions du fournisseur.

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

/**
 * Réponse d'échec UNIFORME (D-03) : même code (404), même message, quel que
 * soit le motif. Un seul objet, une seule porte de sortie.
 */
const UNAVAILABLE_ERROR = 'Ce lien d’invitation n’est plus valable.';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class InviteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new InviteError(500, `Configuration serveur absente : ${name}.`);
  return value;
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

/**
 * Règle EXACTE de redeem (household-invite) : le même encodage base64url,
 * les mêmes bornes. Un token de forme invalide est rejeté AVANT tout HMAC.
 */
const tokenField = z
  .string()
  .trim()
  .min(22, 'Un token fait au moins 22 caractères.')
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Token invalide.');

const requestSchema = z.object({ token: tokenField });

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InviteError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InviteError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Empreinte
// ---------------------------------------------------------------------------

/** HMAC-SHA-256 du token, en hexadécimal minuscule (64 caractères). */
async function hmacSha256Hex(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Limitation de débit
//
// Même mécanique que le gabarit household-invite : compteur en mémoire, par IP
// et par action, suffisant pour une stack mono-instance. Si le service tourne
// en réplique, ce compteur devra être partagé (table ou Redis) — voir
// docs/BACKEND.md.

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { preview: 8 };
const MAX_TRACKED_CLIENTS = 5_000;

const counters = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? request.headers.get('cf-connecting-ip') ?? 'inconnu').trim();
}

function enforceRateLimit(request: Request, action: string): void {
  const now = Date.now();
  const key = `${action}:${clientAddress(request)}`;
  const entry = counters.get(key);

  if (entry && entry.resetAt > now) {
    entry.count += 1;
    if (entry.count > (LIMITS[action] ?? 20)) {
      throw new InviteError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
    }
    return;
  }

  // Purge opportuniste : le compteur ne doit pas grossir indéfiniment.
  if (counters.size > MAX_TRACKED_CLIENTS) {
    for (const [candidate, value] of counters) {
      if (value.resetAt <= now) counters.delete(candidate);
    }
  }

  counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: ['publishable'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const body = await parseBody(request);
      enforceRateLimit(request, 'preview');

      const secret = env('INVITE_TOKEN_HMAC_SECRET');
      if (secret.length < 32) {
        throw new InviteError(500, 'INVITE_TOKEN_HMAC_SECRET doit faire au moins 256 bits.');
      }

      const tokenHash = await hmacSha256Hex(body.token, secret);

      // Lecture pure en base : le RPC fait la comparaison à temps constant et
      // renvoie `{}` sur TOUT motif d'échec (inconnu, expiré, épuisé, révoqué,
      // empreinte malformée). Aucune écriture, aucune distinction de motif ici.
      const { data, error } = await ctx.supabaseAdmin.rpc('preview_household_invite_token', {
        p_token_hash: tokenHash,
      });

      if (error) {
        // D-03 : l'échec RPC ne crée AUCUNE distinction observable — le détail
        // est journalisé sans secret, la réponse publique reste uniforme.
        console.error('household-invite-preview: erreur RPC', { code: error.code, message: error.message });
        return json({ error: UNAVAILABLE_ERROR }, 404);
      }

      const preview = (data ?? {}) as { household_name?: string | null; inviter_first_name?: string | null };

      // Résultat vide = token mort : la réponse uniforme (D-03), pas un 200 vide.
      if (!preview.household_name) return json({ error: UNAVAILABLE_ERROR }, 404);

      // D-02 : seuls ces deux champs quittent la fonction.
      const response: { householdName: string; inviterFirstName?: string } = {
        householdName: preview.household_name,
      };
      if (preview.inviter_first_name) response.inviterFirstName = preview.inviter_first_name;
      return json(response, 200);
    } catch (err) {
      if (err instanceof InviteError) return json({ error: err.message }, err.status);

      console.error('household-invite-preview: erreur inattendue', {
        message: err instanceof Error ? err.message : String(err),
      });
      // D-03 : même sur une erreur interne, la réponse publique reste la
      // réponse uniforme — le détail ne vit que dans les journaux serveur.
      return json({ error: UNAVAILABLE_ERROR }, 404);
    }
  }),
);
