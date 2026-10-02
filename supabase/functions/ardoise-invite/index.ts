/**
 * Edge Function `ardoise-invite`.
 *
 * Point d'entrée : `POST /functions/v1/ardoise-invite`
 * Corps : `{ action: 'create' | 'revoke' | 'summary' | 'join' | 'redeem-guest', ... }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`
 *   * `user`        → session utilisateur. Seul mode qui exécute `create`,
 *                     `revoke`, `summary` et `join` (membre du foyer qui
 *                     rejoint via code, idempotent).
 *   * `publishable` → accepté par la passerelle, mais REFUSÉ ici avec 401
 *                     SANS valider le code, SAUF pour `redeem-guest` : c'est
 *                     le seul chemin des invités externes, qui n'ont pas de
 *                     compte et donc pas de JWT.
 *
 * SÉCURITÉ DU CODE
 *   * 24 octets aléatoires → 32 caractères base64url (≥ 128 bits).
 *   * La base ne stocke QUE `HMAC-SHA-256(secret, code)` en hexadécimal
 *     (`ardoises.invite_hash`) ; le ticket invité suit le même régime
 *     (`ardoise_guests.ticket_hash`).
 *   * `ARDOISE_HMAC_SECRET` dédié (jamais `INVITE_TOKEN_HMAC_SECRET`), lu dans
 *     l'environnement serveur uniquement.
 *   * Le code et le ticket bruts ne sont ni persistés ni journalisés : rendus
 *     une seule fois, à leur création.
 *   * Arrêt du partage (`revoke`) : `invite_hash = NULL`, `is_active = false`,
 *     historique (dépenses, invités, tickets) conservé.
 *
 * CONTRAT DE RÉPONSE
 *   create-ardoise -> ardoise (ligne `ardoises` : id, household_id, name, …)
 *   create      -> { code, expiresAt, maxUses, ardoiseId }
 *   revoke      -> { ardoise_id, revoked: true }
 *   summary     -> { ardoise_id, is_active, has_code, expires_at, max_uses, use_count } | null
 *   join        -> { ardoise_id, already_member: true }
 *   redeem-guest -> { ardoise_id, guest_ticket }
 */

// Spécificateur BARE, comme `household-invite` : le runtime épingle
// `@supabase/server` via sa table d'importation (`volumes/functions/deno.jsonc`).
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-ardoise-guest',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const MAX_USES_DEFAULT = 10;
const MAX_USES_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class ArdoiseInviteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ArdoiseInviteError(500, `Configuration serveur absente : ${name}.`);
  return value;
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

const ardoiseField = z.string().trim().min(1).max(128);

const isoInstant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null);

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-ardoise'),
    name: z.string().trim().min(1, 'Nommez votre ardoise.').max(120),
    description: z.string().trim().max(500).optional(),
    coverUrl: z.string().trim().max(500).optional(),
    householdId: ardoiseField.optional(),
    /** Sélection initiale : identifiants de membres du foyer (admin/membre).
     * Absent = tous (régime historique) ; les inconnus et enfants sont ignorés. */
    memberIds: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  }),
  z.object({
    action: z.literal('create'),
    ardoiseId: ardoiseField,
    expiresAt: isoInstant,
    maxUses: z.number().int().min(1).max(MAX_USES_LIMIT).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    ardoiseId: ardoiseField,
  }),
  z.object({
    action: z.literal('summary'),
    ardoiseId: ardoiseField,
  }),
  z.object({
    action: z.literal('join'),
    /** Code brut tel qu'affiché à la génération. */
    code: z
      .string()
      .trim()
      .min(22, 'Un code fait au moins 22 caractères.')
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.'),
  }),
  z.object({
    action: z.literal('redeem-guest'),
    code: z
      .string()
      .trim()
      .min(22, 'Un code fait au moins 22 caractères.')
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.'),
    displayName: z.string().trim().min(1, 'Indiquez un pseudonyme.').max(120),
  }),
]);

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ArdoiseInviteError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ArdoiseInviteError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Code et empreinte
// ---------------------------------------------------------------------------

/** 24 octets aléatoires → 32 caractères base64url (≥ 128 bits, ≥ 22 caractères). */
function generateCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC-SHA-256 du code, en hexadécimal minuscule (64 caractères). */
async function hmacSha256Hex(code: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(code));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Limitation de débit (compteur mémoire, mono-instance — cf. household-invite)
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { 'redeem-guest': 8, join: 8, create: 20, 'create-ardoise': 10, revoke: 20, summary: 30 };
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
      throw new ArdoiseInviteError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
    }
    return;
  }

  if (counters.size > MAX_TRACKED_CLIENTS) {
    for (const [candidate, value] of counters) {
      if (value.resetAt <= now) counters.delete(candidate);
    }
  }

  counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

// ---------------------------------------------------------------------------
// Accès base
// ---------------------------------------------------------------------------

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

/** Traduit une erreur PostgreSQL en réponse HTTP lisible, sans oracle. */
function translateRpcError(error: { code?: string; message: string }): ArdoiseInviteError {
  const message = error.message ?? '';

  // Même message que le hash soit inconnu, expiré, épuisé ou révoqué : la
  // fonction SQL ne distingue pas (`code invalide`), et on ne rajoute rien.
  if (message.includes('code invalide')) return new ArdoiseInviteError(404, 'Ce code est invalide.');
  if (message.includes('session requise')) return new ArdoiseInviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('nom d’ardoise invalide')) return new ArdoiseInviteError(400, 'Nommez votre ardoise (1 à 120 caractères).');
  if (message.includes('session requise')) return new ArdoiseInviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('gestion de l’ardoise réservée') || error.code === '42501') {
    return new ArdoiseInviteError(403, 'Seul un administrateur du foyer ou le créateur de l’ardoise peut faire cette opération.');
  }
  if (message.includes('expiration invalide') || message.includes('nombre d’utilisations invalide')) {
    return new ArdoiseInviteError(400, 'Paramètres de partage invalides.');
  }
  if (message.includes('pseudonyme invalide')) {
    return new ArdoiseInviteError(400, 'Indiquez un pseudonyme.');
  }
  if (error.code === '23505') {
    return new ArdoiseInviteError(409, 'Ce code existe déjà. Régénérez-le.');
  }

  console.error('ardoise-invite: erreur RPC', { code: error.code, message });
  return new ArdoiseInviteError(500, 'Opération impossible.');
}

function checkSecret(): string {
  const secret = env('ARDOISE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new ArdoiseInviteError(500, 'ARDOISE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}

async function handleCreateArdoise(admin: AdminClient, userId: string, body: RequestBody & { action: 'create-ardoise' }) {
  const { data: membership } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);

  const households = ((membership ?? []) as { household_id: string }[]).map((row) => row.household_id);
  const householdId = body.householdId ?? households[0];
  if (!householdId || (body.householdId && !households.includes(body.householdId))) {
    throw new ArdoiseInviteError(403, 'Vous n’appartenez pas à ce foyer.');
  }

  const { data, error } = await admin.rpc('create_ardoise', {
    p_actor_id: userId,
    p_household_id: householdId,
    p_name: body.name,
    p_description: body.description ?? null,
    p_cover_url: body.coverUrl ?? null,
    p_invite_hash: null,
    p_member_ids: body.memberIds ?? null,
  });

  if (error) throw translateRpcError(error);
  return json(data ?? null);
}

async function handleCreate(admin: AdminClient, userId: string, body: RequestBody & { action: 'create' }) {
  const secret = checkSecret();
  const code = generateCode();
  const codeHash = await hmacSha256Hex(code, secret);

  const { data, error } = await admin.rpc('create_ardoise_invite', {
    p_actor_id: userId,
    p_ardoise_id: body.ardoiseId,
    p_invite_hash: codeHash,
    p_expires_at: body.expiresAt ?? null,
    p_max_uses: body.maxUses ?? MAX_USES_DEFAULT,
  });

  if (error) throw translateRpcError(error);

  const issued = (data ?? {}) as { expires_at?: string | null; max_uses?: number };
  return json({
    code,
    expiresAt: issued.expires_at ?? body.expiresAt ?? null,
    maxUses: issued.max_uses ?? body.maxUses ?? MAX_USES_DEFAULT,
    ardoiseId: body.ardoiseId,
  });
}

async function handleRevoke(admin: AdminClient, userId: string, body: RequestBody & { action: 'revoke' }) {
  const { data, error } = await admin.rpc('revoke_ardoise_invite', {
    p_actor_id: userId,
    p_ardoise_id: body.ardoiseId,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? { revoked: false }) as { revoked: boolean });
}

async function handleSummary(admin: AdminClient, userId: string, body: RequestBody & { action: 'summary' }) {
  const { data, error } = await admin.rpc('ardoise_invite_summary', {
    p_actor_id: userId,
    p_ardoise_id: body.ardoiseId,
  });

  if (error) throw translateRpcError(error);
  if (!data) return json(null);

  const summary = data as {
    ardoise_id: string;
    is_active: boolean;
    has_code: boolean;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
  };
  return json({
    ardoiseId: summary.ardoise_id,
    isActive: summary.is_active,
    hasCode: summary.has_code,
    expiresAt: summary.expires_at,
    maxUses: summary.max_uses,
    useCount: summary.use_count,
  });
}

async function handleJoin(admin: AdminClient, user: SupabaseClient, userId: string, body: RequestBody & { action: 'join' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  // Message clair quand l'appelant n'est pas du foyer : `redeem` le prendrait
  // pour un invité et réclamerait un pseudonyme.
  const { data: ardoise } = await admin
    .from('ardoises')
    .select('id, household_id')
    .eq('invite_hash', codeHash)
    .maybeSingle();
  if (ardoise) {
    const { data: membership } = await user
      .from('household_members')
      .select('id')
      .eq('household_id', (ardoise as { household_id: string }).household_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) {
      throw new ArdoiseInviteError(403, 'Vous n’appartenez pas au foyer de cette ardoise : utilisez le lien invité.');
    }
  }

  const { data, error } = await admin.rpc('redeem_ardoise_invite', {
    p_invite_hash: codeHash,
    p_actor_id: userId,
    p_display_name: null,
  });

  if (error) throw translateRpcError(error);
  return json({ ardoise_id: (data as { ardoise_id?: string } | null)?.ardoise_id ?? null, already_member: true });
}

async function handleRedeemGuest(admin: AdminClient, body: RequestBody & { action: 'redeem-guest' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  const { data, error } = await admin.rpc('redeem_ardoise_invite', {
    p_invite_hash: codeHash,
    p_actor_id: null,
    p_display_name: body.displayName,
  });

  if (error) throw translateRpcError(error);

  const redeemed = (data ?? {}) as { ardoise_id?: string; guest_ticket?: string };
  return json({ ardoise_id: redeemed.ardoise_id ?? null, guest_ticket: redeemed.guest_ticket ?? null });
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: ['user', 'publishable'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const body = await parseBody(request);
      enforceRateLimit(request, body.action);

      const userId = ctx.userClaims?.id;
      const isUser = ctx.authMode === 'user' && Boolean(userId);
      const admin = ctx.supabaseAdmin;

      // `redeem-guest` est le seul chemin sans session : les invités n'ont
      // pas de compte. Tout le reste exige une session, sans valider le code.
      if (body.action === 'redeem-guest') {
        return await handleRedeemGuest(admin, body);
      }
      if (!isUser || !userId) {
        return json({ error: 'Connectez-vous pour rejoindre une ardoise.' }, 401);
      }

      if (body.action === 'create-ardoise') return await handleCreateArdoise(admin, userId, body);
      if (body.action === 'create') return await handleCreate(admin, userId, body);
      if (body.action === 'revoke') return await handleRevoke(admin, userId, body);
      if (body.action === 'summary') return await handleSummary(admin, userId, body);
      return await handleJoin(admin, ctx.supabase, userId, body);
    } catch (error) {
      if (error instanceof ArdoiseInviteError) return json({ error: error.message }, error.status);

      console.error('ardoise-invite: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
