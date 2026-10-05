/**
 * Edge Function `gift-list-invite`.
 *
 * Point d'entrée : `POST /functions/v1/gift-list-invite`
 * Corps : `{ action: 'create' | 'revoke' | 'summary' | 'redeem', ... }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`
 *   * `user`        → session utilisateur (`Authorization: Bearer <JWT>`).
 *                     C'est le seul mode qui exécute une action : il donne
 *                     l'identité de l'appelant, indispensable pour vérifier la
 *                     gestion (propriétaire OU admin, revérifiée EN BASE).
 *   * `publishable` → accepté par la passerelle, mais REFUSÉ ici avec 401
 *                     SANS valider le code. Aucun oracle de validité n'est
 *                     donc exposé aux appels non authentifiés.
 *
 * DÉCISION OQ-1 VERROUILLÉE — OPTION A (plan 05-03) : l'Edge reste user-only,
 * sans action publishable/invitée. Le lien envoyé à un externe
 * (`/invitation/cadeau?code=…`) mène vers inscription/connexion avec l'e-mail
 * invité, puis l'échange active le partage via la branche e-mail existante de
 * `redeem_gift_list_invite` (0079). Choisir l'anonymat imposerait une action
 * publishable supplémentaire et rouvrirait T-05-04 : refusé.
 *
 *   create / revoke / summary : gestion propriétaire-OU-admin de la liste,
 *                               revérifiée EN BASE par
 *                               `public.create_gift_list_invite`,
 *                               `public.revoke_gift_list_invite` et
 *                               `public.gift_list_invite_summary`.
 *   redeem                    : `user` + transaction unique côté base
 *                               (`public.redeem_gift_list_invite`). Membre du
 *                               foyer → partage idempotent sans e-mail ;
 *                               externe → e-mail explicite (celui de son
 *                               compte après signup, OPTION A), partage
 *                               `reservation` idempotent. Jamais d'admin, jamais
 *                               de réserve aveugle (D-17).
 *
 * Ces quatre fonctions SQL sont `SECURITY DEFINER` et leur `EXECUTE` n'est
 * accordé qu'à `service_role` : un client porteur d'un JWT utilisateur est
 * `authenticated` et se voit refuser l'appel direct. Elles revérifient la
 * gestion en base, donc même cette fonction compromise ne peut pas agir pour
 * un non-gestionnaire.
 *
 * SÉCURITÉ DU CODE
 *   * 24 octets aléatoires → 32 caractères base64url (≥ 128 bits, D-15).
 *   * La base ne stocke QUE `HMAC-SHA-256(secret, code)` en hexadécimal
 *     (`gift_list_invites.token_hash`).
 *   * `GIFT_LIST_INVITE_HMAC_SECRET` dédié (jamais `ARDOISE_HMAC_SECRET` ni
 *     `INVITE_TOKEN_HMAC_SECRET`), lu dans l'environnement serveur uniquement.
 *     Absent ou court → 500 explicite AVANT toute signature : la fonction
 *     échoue fermée au lieu de signer avec du vide (T-05-06).
 *   * Le code brut n'est ni persisté ni journalisé : rendu une seule fois, à
 *     sa création. Régénérer désactive aussitôt le précédent DE CETTE LISTE ;
 *     révoquer (`revoke`) désactive tous les codes actifs, historique conservé.
 *
 * CONTRAT DE RÉPONSE
 *   create  -> { code, expiresAt, maxUses, listId }
 *   revoke  -> { list_id, revoked }
 *   summary -> { listId, isActive, hasCode, expiresAt, maxUses, useCount } | null
 *   redeem  -> { list_id, already_shared }
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
  'access-control-allow-headers': 'authorization, apikey, content-type, x-invite-token',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Défaut également retenu en base (migration 0079) : la base fait foi. */
const MAX_USES_DEFAULT = 20;
/** Plafond également retenu en base (migration 0079) : la base fait foi. */
const MAX_USES_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class GiftListInviteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new GiftListInviteError(500, `Configuration serveur absente : ${name}.`);
  return value;
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

/**
 * Les identifiants métier sont des `text` préfixés (`gift-list_<uuid>`), pas
 * des uuid : la validation ne doit surtout pas imposer un format uuid.
 */
const listField = z.string().trim().min(1).max(128);

const isoInstant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null);

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    listId: listField,
    expiresAt: isoInstant,
    maxUses: z.number().int().min(1).max(MAX_USES_LIMIT).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    listId: listField,
  }),
  z.object({
    action: z.literal('summary'),
    listId: listField,
  }),
  z.object({
    action: z.literal('redeem'),
    /** Base64url : ni `+`, ni `/`, ni `=`. */
    code: z
      .string()
      .trim()
      .min(22, 'Un code fait au moins 22 caractères.')
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.'),
    /**
     * E-mail de l'appelant pour la branche externe (OPTION A : compte créé
     * avec l'e-mail invité, partage activé à l'échange). Absent pour un
     * membre du foyer : la branche membre est essayée d'abord en base.
     */
    email: z.string().trim().email('Adresse e-mail invalide.').max(320).optional(),
  }),
]);

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new GiftListInviteError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GiftListInviteError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Code et empreinte (verbatim `ardoise-invite` : même entropie, même HMAC)
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
const LIMITS: Record<string, number> = { redeem: 8, create: 20, revoke: 20, summary: 30 };
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
      throw new GiftListInviteError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
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
// Accès base
// ---------------------------------------------------------------------------

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

/**
 * Traduit une erreur PostgreSQL en réponse HTTP lisible, avec oracle unique :
 * inconnu, expiré, épuisé, révoqué, liste disparue ou sans destinataire
 * rendent tous `Ce code est invalide.` — le client n'apprend rien de plus
 * (T-05-04 repris de 0079).
 */
function translateRpcError(error: { code?: string; message: string }): GiftListInviteError {
  const message = error.message ?? '';

  // Même message quel que soit l'état du code : la fonction SQL ne distingue
  // pas (`code invalide`), et on ne rajoute rien.
  if (message.includes('code invalide')) return new GiftListInviteError(404, 'Ce code est invalide.');
  if (message.includes('session requise')) return new GiftListInviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('liste introuvable')) return new GiftListInviteError(404, 'Liste introuvable.');
  if (message.includes('gestion de la liste réservée') || error.code === '42501') {
    return new GiftListInviteError(403, 'Seul le propriétaire de la liste ou un administrateur du foyer peut faire cette opération.');
  }
  if (message.includes('expiration invalide') || message.includes("nombre d'utilisations invalide")) {
    return new GiftListInviteError(400, 'Paramètres de partage invalides.');
  }
  if (message.includes('adresse e-mail invalide')) {
    return new GiftListInviteError(400, 'Adresse e-mail invalide.');
  }
  if (message.includes("empreinte d'invitation invalide")) {
    return new GiftListInviteError(500, 'Opération impossible.');
  }
  if (error.code === '23505') {
    return new GiftListInviteError(409, 'Ce code existe déjà. Régénérez-le.');
  }

  console.error('gift-list-invite: erreur RPC', { code: error.code, message });
  return new GiftListInviteError(500, 'Opération impossible.');
}

/**
 * Échec fermé (T-05-06) : sans secret dédié provisionné, aucune signature
 * n'est produite — la fonction répond 500 explicite au lieu de signer avec
 * du vide.
 */
function checkSecret(): string {
  const secret = env('GIFT_LIST_INVITE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new GiftListInviteError(500, 'GIFT_LIST_INVITE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleCreate(admin: AdminClient, userId: string, body: RequestBody & { action: 'create' }) {
  const secret = checkSecret();
  const code = generateCode();
  const codeHash = await hmacSha256Hex(code, secret);

  const { data, error } = await admin.rpc('create_gift_list_invite', {
    p_actor_id: userId,
    p_list_id: body.listId,
    p_token_hash: codeHash,
    p_expires_at: body.expiresAt ?? null,
    p_max_uses: body.maxUses ?? MAX_USES_DEFAULT,
  });

  if (error) throw translateRpcError(error);

  const issued = (data ?? {}) as { expires_at?: string | null; max_uses?: number };
  // Le code brut quitte la fonction ici et n'est jamais stocké ni journalisé.
  return json({
    code,
    expiresAt: issued.expires_at ?? body.expiresAt ?? null,
    maxUses: issued.max_uses ?? body.maxUses ?? MAX_USES_DEFAULT,
    listId: body.listId,
  });
}

async function handleRevoke(admin: AdminClient, userId: string, body: RequestBody & { action: 'revoke' }) {
  const { data, error } = await admin.rpc('revoke_gift_list_invite', {
    p_actor_id: userId,
    p_list_id: body.listId,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? { revoked: 0 }) as { revoked: number });
}

async function handleSummary(admin: AdminClient, userId: string, body: RequestBody & { action: 'summary' }) {
  const { data, error } = await admin.rpc('gift_list_invite_summary', {
    p_actor_id: userId,
    p_list_id: body.listId,
  });

  if (error) throw translateRpcError(error);
  if (!data) return json(null);

  const summary = data as {
    invite_id: string;
    list_id: string;
    is_active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
    created_at: string;
  };
  // L'empreinte ne quitte jamais la base : `hasCode` dit seulement si un
  // code actif existe, sans le rendre.
  return json({
    listId: summary.list_id,
    isActive: summary.is_active,
    hasCode: summary.is_active,
    expiresAt: summary.expires_at,
    maxUses: summary.max_uses,
    useCount: summary.use_count,
  });
}

async function handleRedeem(admin: AdminClient, userId: string, body: RequestBody & { action: 'redeem' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  // Membre du foyer : la branche membre est essayée d'abord en base, sans
  // consommer d'e-mail. Externe (OPTION A) : l'e-mail de son compte, saisi à
  // l'inscription avec l'e-mail invité, active son partage `reservation`.
  const { data, error } = await admin.rpc('redeem_gift_list_invite', {
    p_token_hash: codeHash,
    p_actor_id: userId,
    p_email: body.email ?? null,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? {}) as { list_id?: string; already_shared?: boolean });
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

      // Aucune action n'est exécutée pour un appelant non authentifié : le
      // code n'est pas validé, donc aucune fuite d'information n'est possible
      // (OQ-1 OPTION A : pas de chemin anonyme).
      const userId = ctx.userClaims?.id;
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour partager une liste de cadeaux.' }, 401);
      }

      const admin = ctx.supabaseAdmin;

      if (body.action === 'create') return await handleCreate(admin, userId, body);
      if (body.action === 'revoke') return await handleRevoke(admin, userId, body);
      if (body.action === 'summary') return await handleSummary(admin, userId, body);
      return await handleRedeem(admin, userId, body);
    } catch (error) {
      if (error instanceof GiftListInviteError) return json({ error: error.message }, error.status);

      console.error('gift-list-invite: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
