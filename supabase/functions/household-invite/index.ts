/**
 * Edge Function `household-invite`.
 *
 * Point d'entrée : `POST /functions/v1/household-invite`
 * Corps : `{ action: 'create' | 'revoke' | 'summary' | 'redeem', ... }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`
 *   * `user`        → session utilisateur (`Authorization: Bearer <JWT>`).
 *                     C'est le seul mode qui exécute une action : il donne
 *                     l'identité de l'appelant, indispensable pour rattacher un
 *                     membre ou vérifier un rôle.
 *   * `publishable` → accepté par la passerelle (une personne qui a la clé
 *                     publiable sans être encore connectée), mais REFUSÉ ici avec
 *                     401 SANS valider le token. Aucun oracle de validité n'est
 *                     donc exposé aux appels non authentifiés.
 *
 *   create / revoke / summary : rôle `admin` du foyer, revérifié EN BASE par
 *                               `public.create_household_invite_token`,
 *                               `public.revoke_household_invite_tokens` et
 *                               `public.household_invite_token_summary`.
 *   redeem                    : `user` + transaction unique côté base
 *                               (`public.redeem_household_invite_token`).
 *
 * Ces quatre fonctions SQL sont `SECURITY DEFINER` et leur `EXECUTE` n'est
 * accordé qu'à `service_role` : un client porteur d'un JWT utilisateur est
 * `authenticated` et se voit refuser l'appel. Elles revérifient le rôle de
 * l'acteur en base, donc même cette fonction compromise ne peut pas agir pour
 * un non-administrateur.
 *
 * SÉCURITÉ DU TOKEN
 *   * 24 octets aléatoires → 32 caractères base64url (≥ 22 exigés par
 *     `app/src/lib/invites.ts`, ≥ 128 bits exigés par AGENTS.md §4).
 *   * La base ne stocke QUE `HMAC-SHA-256(secret, token)` en hexadécimal.
 *   * `INVITE_TOKEN_HMAC_SECRET` n'est lu QUE dans cette fonction, vient de
 *     l'environnement serveur (jamais du client, jamais de la base).
 *   * Le token brut n'est ni persisté ni journalisé : il n'est renvoyé qu'à sa
 *     création.
 *   * La comparaison des empreintes est faite EN BASE, à temps constant, sous
 *     verrou de ligne (`private.token_hash_matches`, cf. migration 0006). C'est
 *     le seul point de comparaison : il n'y en a pas de second, divergent, en
 *     JavaScript.
 *
 * CONTRAT DE RÉPONSE (aligné sur `app/src/types/index.ts`)
 *   create  -> InviteTokenPreview  { token, expiresAt, maxUses, householdId }
 *   revoke  -> { revoked: number }
 *   summary -> InviteTokenSummary | null
 *   redeem  -> { household_id: string }
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`, forme équivalente à `export default { fetch }` pour le
 * runtime Deno de la stack auto-hébergée.
 */

// Spécificateur BARE, et non `npm:@supabase/server` : le runtime publie une
// table d'importation à sa racine (`volumes/functions/deno.jsonc`) qui épingle
// `@supabase/server` à `npm:@supabase/server@^1`. C'est ce mécanisme que
// Deno applique aux fonctions du fournisseur, et il doit s'appliquer aux
// nôtres.
//
// Un `npm:` non épinglé est résolu à chaque démarrage à froid, depuis la
// dernière version publiée. Le jour où `@supabase/server` publie une v2, les
// trois fonctionschangeraient de comportement sans commit, sans revue et sans
// test — et le premier signe serait une 500 en production, sur un déploiement
// pourtant inchangé. On dépend donc de l'épinglage du runtime, au même titre
// que les fonctions qu'il fournit.

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

const MAX_USES_DEFAULT = 10;
/** Plafond également retenu en base (migration 0006) : la base fait foi. */
const MAX_USES_LIMIT = 100;

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
 * Les identifiants métier sont des `text` préfixés (`household_<uuid>`), pas des
 * uuid : la validation ne doit surtout pas imposer un format uuid.
 */
const householdField = z.string().trim().min(1).max(128);

const isoInstant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null);

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    /** Foyer visé ; par défaut, le premier foyer de l'appelant. */
    householdId: householdField.optional(),
    expiresAt: isoInstant,
    maxUses: z.number().int().min(1).max(MAX_USES_LIMIT).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    householdId: householdField.optional(),
  }),
  z.object({
    action: z.literal('summary'),
    householdId: householdField.optional(),
  }),
  z.object({
    action: z.literal('redeem'),
    /** Base64url : ni `+`, ni `/`, ni `=`. */
    token: z
      .string()
      .trim()
      .min(22, 'Un token fait au moins 22 caractères.')
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/, 'Token invalide.'),
  }),
]);

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
// Token et empreinte
// ---------------------------------------------------------------------------

/** 24 octets aléatoires → 32 caractères base64url (≥ 128 bits, ≥ 22 caractères). */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
// Compteur en mémoire, par IP et par action : suffisant pour une stack
// mono-instance. Si le service tourne en réplique, ce compteur devra être
// partagé (table ou Redis) — voir docs/BACKEND.md.

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
// Accès base
// ---------------------------------------------------------------------------

interface Membership {
  household_id: string;
  role: 'admin' | 'membre' | 'enfant';
  households: { id: string; name: string } | null;
}

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

interface TokenIssueResult {
  token_id: string;
  household_id: string;
  expires_at: string | null;
  max_uses: number;
}

interface TokenSummaryRow {
  household_id: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number;
  use_count: number;
  created_at: string;
}

/** Foyer visé : celui demandé s'il est fourni, sinon le premier de l'appelant. */
async function resolveHousehold(
  admin: AdminClient,
  userId: string,
  requested: string | undefined,
): Promise<Membership> {
  let query = admin
    .from('household_members')
    .select('household_id, role, households(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (requested) query = query.eq('household_id', requested);

  const { data, error } = await query.maybeSingle();

  if (error) throw new InviteError(500, 'Foyer introuvable.');
  if (!data) throw new InviteError(404, 'Vous n’appartenez à aucun foyer.');

  return data as Membership;
}

/** Traduit une erreur PostgreSQL en réponse HTTP lisible. */
function translateRpcError(error: { code?: string; message: string }): InviteError {
  const message = error.message ?? '';

  // Les motifs sont posés en base (migration 0006) : la base est l'unique
  // source de vérité sur la raison d'un refus.
  if (message.includes('réservée aux administrateurs')) {
    return new InviteError(403, 'Seul un administrateur du foyer peut faire cette opération.');
  }
  if (message.includes('token inconnu')) return new InviteError(404, 'Ce token est introuvable.');
  if (message.includes('token révoqué')) return new InviteError(410, 'Ce token a été révoqué.');
  if (message.includes('token expiré')) return new InviteError(410, 'Ce token est expiré.');
  if (message.includes('token épuisé')) {
    return new InviteError(410, 'Ce token a atteint son nombre d’utilisations maximal.');
  }
  if (message.includes('session requise')) return new InviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('expiration doit être dans le futur')) {
    return new InviteError(400, 'La date d’expiration doit être dans le futur.');
  }
  if (message.includes('empreinte de token invalide') || message.includes('token invalide')) {
    return new InviteError(400, 'Ce token est incomplet.');
  }
  if (error.code === '42501') {
    return new InviteError(403, 'Seul un administrateur du foyer peut faire cette opération.');
  }
  if (error.code === '23505') {
    return new InviteError(409, 'Ce token existe déjà. Régénérez-le.');
  }

  // Le détail technique n'est jamais renvoyé au client : il est journalisé côté
  // serveur (sans secret) pour le diagnostic.
  console.error('household-invite: erreur RPC', { code: error.code, message });
  return new InviteError(500, 'Opération impossible.');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleCreate(admin: AdminClient, userId: string, body: RequestBody & { action: 'create' }) {
  const membership = await resolveHousehold(admin, userId, body.householdId);
  const secret = env('INVITE_TOKEN_HMAC_SECRET');
  if (secret.length < 32) {
    throw new InviteError(500, 'INVITE_TOKEN_HMAC_SECRET doit faire au moins 256 bits.');
  }

  const token = generateToken();
  const tokenHash = await hmacSha256Hex(token, secret);

  const { data, error } = await admin.rpc('create_household_invite_token', {
    p_actor_id: userId,
    p_household_id: membership.household_id,
    p_token_hash: tokenHash,
    p_expires_at: body.expiresAt ?? null,
    p_max_uses: body.maxUses ?? MAX_USES_DEFAULT,
  });

  if (error) throw translateRpcError(error);

  // La base fait foi sur les bornes appliquées (max_uses, expiration).
  const issued = (data ?? {}) as TokenIssueResult;

  // Le token brut quitte la fonction ici et n'est jamais stocké ni journalisé.
  return json({
    token,
    expiresAt: issued.expires_at ?? null,
    maxUses: issued.max_uses ?? MAX_USES_DEFAULT,
    householdId: issued.household_id ?? membership.household_id,
  });
}

async function handleRevoke(admin: AdminClient, userId: string, body: RequestBody & { action: 'revoke' }) {
  const membership = await resolveHousehold(admin, userId, body.householdId);

  const { data, error } = await admin.rpc('revoke_household_invite_tokens', {
    p_actor_id: userId,
    p_household_id: membership.household_id,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? { revoked: 0 }) as { revoked: number });
}

async function handleSummary(admin: AdminClient, userId: string, body: RequestBody & { action: 'summary' }) {
  const membership = await resolveHousehold(admin, userId, body.householdId);

  const { data, error } = await admin.rpc('household_invite_token_summary', {
    p_actor_id: userId,
    p_household_id: membership.household_id,
  });

  if (error) throw translateRpcError(error);
  if (!data) return json(null);

  const summary = data as TokenSummaryRow;
  return json({
    householdId: summary.household_id,
    isActive: summary.is_active,
    expiresAt: summary.expires_at,
    maxUses: summary.max_uses,
    useCount: summary.use_count,
    createdAt: summary.created_at,
  });
}

async function handleRedeem(admin: AdminClient, userId: string, body: RequestBody & { action: 'redeem' }) {
  const tokenHash = await hmacSha256Hex(body.token, env('INVITE_TOKEN_HMAC_SECRET'));

  // Le nom d'affichage provient du profil créé à la première connexion.
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  // Contrôle d'activité, d'expiration, de compteur, incrément et rattachement du
  // membre : tout se joue dans UNE transaction base, sous verrou de ligne, avec
  // comparaison de l'empreinte à temps constant.
  const { data, error } = await admin.rpc('redeem_household_invite_token', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_display_name: (profile as { display_name?: string } | null)?.display_name ?? null,
    p_avatar_url: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    p_role: 'membre',
  });

  if (error) throw translateRpcError(error);

  const redeemed = (data ?? {}) as { household_id?: string };
  return json({ household_id: redeemed.household_id ?? null });
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
      // token n'est pas validé, donc aucune fuite d'information n'est possible.
      // `UserClaims.id` est le `sub` normalisé du JWT (`@supabase/server`).
      const userId = ctx.userClaims?.id;
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour rejoindre un foyer.' }, 401);
      }

      const admin = ctx.supabaseAdmin;

      if (body.action === 'create') return await handleCreate(admin, userId, body);
      if (body.action === 'revoke') return await handleRevoke(admin, userId, body);
      if (body.action === 'summary') return await handleSummary(admin, userId, body);
      return await handleRedeem(admin, userId, body);
    } catch (error) {
      if (error instanceof InviteError) return json({ error: error.message }, error.status);

      // Message générique : le détail reste dans les journaux serveur.
      console.error('household-invite: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
