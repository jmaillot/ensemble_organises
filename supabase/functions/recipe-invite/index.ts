/**
 * Edge Function `recipe-invite` (phase 16, plan 16-01).
 *
 * Point d'entrée : `POST /functions/v1/recipe-invite`
 * Corps : `{ action: 'create' | 'revoke' | 'summary' | 'link-view', ... }`
 *
 * Copie le byte-motif de `gift-list-invite` / `trip-invite` (jamais un
 * design d'invitation main-levée) : même entropie, même HMAC, même oracle,
 * mêmes rate-limits, même child-guard. Périmètre réduit au lien seul
 * `link-view` (RESEARCH OQ-2 : pas d'inscription externe en lecture seule).
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`
 *   * `user`        → session utilisateur. Seul mode qui exécute
 *                     `create`, `revoke` et `summary`.
 *   * `publishable` → accepté par la passerelle, mais REFUSÉ ici avec 401
 *                     SANS valider le code, SAUF pour `link-view` : le seul
 *                     chemin des invités externes, qui n'ont pas de compte
 *                     et donc pas de JWT. Leur seule credence est le code,
 *                     vérifié en base par le RPC.
 *
 * SÉCURITÉ DU CODE
 *   * 24 octets aléatoires → 32 caractères base64url (≥ 128 bits).
 *   * La base ne stocke QUE `HMAC-SHA-256(secret, code)` en hexadécimal
 *     (`recipe_shares.share_hash`).
 *   * `RECIPE_INVITE_HMAC_SECRET` dédié (jamais une clé Supabase ni un autre
 *     HMAC), lu dans l'environnement serveur uniquement.
 *   * Le code brut n'est ni persisté ni journalisé : rendu une seule fois,
 *     à sa création. Régénérer désactive aussitôt le précédent DE CETTE
 *     RECETTE ; révoquer (`revoke`) désactive tous les liens actifs,
 *     historique conservé.
 *
 * CONTRAT DE RÉPONSE
 *   create    -> { code, expiresAt, maxUses, recipeId }
 *   revoke    -> { recipe_id, revoked }
 *   summary   -> { recipeId, isActive, hasCode, expiresAt, maxUses, useCount } | null
 *   link-view -> { recipeId, title, servings, prepMinutes, cookMinutes,
 *                  coverPhotoUrl, category, ingredients, steps, tags }
 *     (`coverPhotoUrl` est une URL signée ÉPHÉMÈRE (une heure) forgée par
 *     requête depuis la valeur brute `cover_photo`, ou null en échec fermé,
 *     jamais persistée ; `ingredients`/`steps` portent position + quantité
 *     de référence, le scaler restant pur client — 16-02.)
 *
 * REFUS ENFANT (R10) : chaque action `user` résout le rôle du foyer côté
 * serveur (lookup `household_members` en `service_role` — jamais un claim
 * client) et refuse `enfant` AVANT tout RPC, avec l'erreur uniforme de sa
 * famille (`child-guard.ts`, miroir byte-identique des sorties
 * `translateRpcError` ci-dessous). `link-view` reste sans identité, ouvert
 * par construction.
 *
 * Ces quatre fonctions SQL sont `SECURITY DEFINER` et leur `EXECUTE` n'est
 * accordé qu'à `service_role` : un client porteur d'un JWT utilisateur est
 * `authenticated` et se voit refuser l'appel direct (prouvé en 0054).
 * Elles revérifient la gestion en base, donc même cette fonction compromise
 * ne peut pas agir pour un non-gestionnaire.
 */

// Spécificateur BARE, comme `gift-list-invite` : le runtime épingle
// `@supabase/server` via sa table d'importation (`volumes/functions/deno.jsonc`).
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
import { childRefusal, isChildRole } from './child-guard.ts';
import type { ChildGuardAction } from './child-guard.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Défaut également retenu en base (migration 0122) : la base fait foi. */
const MAX_USES_DEFAULT = 20;
/** Plafond également retenu en base (migration 0122) : la base fait foi. */
const MAX_USES_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class RecipeInviteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new RecipeInviteError(500, `Configuration serveur absente : ${name}.`);
  return value;
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

/**
 * Les identifiants métier sont des `text` préfixés (`recipe_<uuid>`), pas
 * des uuid : la validation ne doit surtout pas imposer un format uuid.
 */
const recipeField = z.string().trim().min(1).max(128);

/** Code brut tel qu'affiché à la génération (base64url, ≥ 22 caractères). */
const codeField = z
  .string()
  .trim()
  .min(22, 'Un code fait au moins 22 caractères.')
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.');

const isoInstant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null);

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    recipeId: recipeField,
    expiresAt: isoInstant,
    maxUses: z.number().int().min(1).max(MAX_USES_LIMIT).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    recipeId: recipeField,
  }),
  z.object({
    action: z.literal('summary'),
    recipeId: recipeField,
  }),
  z.object({
    action: z.literal('link-view'),
    /** Code brut du lien : EST le contrôle d'accès (pas de session). */
    code: codeField,
  }),
]);

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new RecipeInviteError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RecipeInviteError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Code et empreinte (verbatim `gift-list-invite` : même entropie, même HMAC)
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
const LIMITS: Record<string, number> = {
  create: 20,
  revoke: 20,
  summary: 30,
  'link-view': 30,
};
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
      throw new RecipeInviteError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
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
 * inconnu, expiré, épuisé, révoqué ou recette disparue rendent tous
 * `Ce lien est invalide.` — le client n'apprend rien de plus (T-16-01).
 */
function translateRpcError(error: { code?: string; message: string }): RecipeInviteError {
  const message = error.message ?? '';

  // Même message quel que soit l'état du lien : la fonction SQL ne distingue
  // pas (`code invalide`), et on ne rajoute rien.
  if (message.includes('code invalide')) return new RecipeInviteError(404, 'Ce lien est invalide.');
  if (message.includes('session requise')) return new RecipeInviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('recette introuvable')) return new RecipeInviteError(404, 'Recette introuvable.');
  if (message.includes('écriture refusée') || error.code === '42501') {
    return new RecipeInviteError(403, 'Seul un administrateur ou un membre du foyer peut faire cette opération.');
  }
  if (message.includes('expiration invalide') || message.includes("nombre d'utilisations invalide")) {
    return new RecipeInviteError(400, 'Paramètres de partage invalides.');
  }
  if (message.includes('empreinte de partage invalide')) {
    return new RecipeInviteError(500, 'Opération impossible.');
  }
  if (error.code === '23505') {
    return new RecipeInviteError(409, 'Ce code existe déjà. Régénérez-le.');
  }

  console.error('recipe-invite: erreur RPC', { code: error.code, message });
  return new RecipeInviteError(500, 'Opération impossible.');
}

/**
 * Échec fermé : sans secret dédié provisionné, aucune signature n'est
 * produite — la fonction répond 500 explicite au lieu de signer avec du
 * vide. `RECIPE_INVITE_HMAC_SECRET` vit dans Vault/secret manager
 * uniquement (jamais en base ni en clair).
 */
function checkSecret(): string {
  const secret = env('RECIPE_INVITE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new RecipeInviteError(500, 'RECIPE_INVITE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Refus enfant (R10) : rôle résolu côté serveur, jamais fourni.
// ---------------------------------------------------------------------------

/**
 * Rôle de l'appelant dans le foyer, lu en `service_role` depuis la session
 * vérifiée — jamais un claim client. `null` = pas membre : on laisse alors
 * le RPC trancher (il possède l'oracle de ce cas).
 */
async function callerRole(
  admin: AdminClient,
  householdId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const role = (data as { role?: unknown }).role;
  return typeof role === 'string' ? role : null;
}

/** Foyer d'une recette, ou `null` si inconnue (le RPC possède cet oracle). */
async function recipeHousehold(admin: AdminClient, recipeId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('recipes')
    .select('household_id')
    .eq('id', recipeId)
    .maybeSingle();
  if (error || !data) return null;
  const householdId = (data as { household_id?: unknown }).household_id;
  return typeof householdId === 'string' ? householdId : null;
}

/**
 * Refuse l'enfant avec l'erreur uniforme de l'action, avant tout RPC.
 * Foyer inconnu ou non-membre : on laisse passer vers le RPC, seul
 * détenteur de ces oracles (jamais de 403 qui révélerait une existence).
 */
async function refuseEnfant(
  admin: AdminClient,
  userId: string,
  householdId: string | null,
  action: ChildGuardAction,
): Promise<void> {
  if (!householdId) return;
  if (isChildRole(await callerRole(admin, householdId, userId))) {
    const refusal = childRefusal(action);
    throw new RecipeInviteError(refusal.status, refusal.message);
  }
}

// ---------------------------------------------------------------------------
// Actions `user`
// ---------------------------------------------------------------------------

async function handleCreate(admin: AdminClient, userId: string, body: RequestBody & { action: 'create' }) {
  await refuseEnfant(admin, userId, await recipeHousehold(admin, body.recipeId), 'manage');
  const secret = checkSecret();
  const code = generateCode();
  const codeHash = await hmacSha256Hex(code, secret);

  const { data, error } = await admin.rpc('create_recipe_share', {
    p_actor_id: userId,
    p_recipe_id: body.recipeId,
    p_share_hash: codeHash,
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
    recipeId: body.recipeId,
  });
}

async function handleRevoke(admin: AdminClient, userId: string, body: RequestBody & { action: 'revoke' }) {
  await refuseEnfant(admin, userId, await recipeHousehold(admin, body.recipeId), 'manage');
  const { data, error } = await admin.rpc('revoke_recipe_share', {
    p_actor_id: userId,
    p_recipe_id: body.recipeId,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? { revoked: 0 }) as { revoked: number });
}

async function handleSummary(admin: AdminClient, userId: string, body: RequestBody & { action: 'summary' }) {
  await refuseEnfant(admin, userId, await recipeHousehold(admin, body.recipeId), 'manage');
  const { data, error } = await admin.rpc('recipe_share_summary', {
    p_actor_id: userId,
    p_recipe_id: body.recipeId,
  });

  if (error) throw translateRpcError(error);
  if (!data) return json(null);

  const summary = data as {
    share_id: string;
    recipe_id: string;
    is_active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
    created_at: string;
  };
  // L'empreinte ne quitte jamais la base : `hasCode` dit seulement si un
  // lien actif existe, sans le rendre.
  return json({
    recipeId: summary.recipe_id,
    isActive: summary.is_active,
    hasCode: summary.is_active,
    expiresAt: summary.expires_at,
    maxUses: summary.max_uses,
    useCount: summary.use_count,
  });
}

// ---------------------------------------------------------------------------
// Chemin sans session (publishable) : invités externes uniquement.
// ---------------------------------------------------------------------------

/** Bucket privé des fichiers du foyer : seul nom que les politiques connaissent. */
const HOUSEHOLD_MEDIA_BUCKET = 'household-media';
/** Validité des URL photo invitées : courte (une heure), forgée par requête. */
const GUEST_PHOTO_TTL_SECONDS = 3600;

/** Chaîne non vide telle quelle, sinon null (échec fermé, jamais ''). */
function asTextOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Résout la valeur brute `cover_photo` du RPC en URL servable : un chemin
 * relatif au bucket `household-media` (forme des dépôts) reçoit une URL
 * signée courte ; TOUT le reste (absent, forme inconnue, erreur de
 * signature) rend null — échec fermé, sans erreur, sans journaliser ni le
 * code ni l'URL (rien de sensible ne fuite dans les logs).
 */
async function resolveGuestCoverUrl(admin: AdminClient, raw: unknown): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await admin.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Lecture invitée sans compte : le code EST le contrôle d'accès. Ne rend
 * que la fiche lecture seule — projection défensive explicite : même si le
 * RPC rendait un jour plus, aucun identifiant de membre ne quitte la
 * fonction. Le compteur est consommé côté RPC, atomiquement (hypothèse
 * SPEC max-uses=1) ; tout état invalide rend l'oracle unique 404.
 */
async function handleLinkView(admin: AdminClient, body: RequestBody & { action: 'link-view' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  const { data, error } = await admin.rpc('view_recipe_share', {
    p_share_hash: codeHash,
  });

  if (error) throw translateRpcError(error);

  const view = (data ?? {}) as {
    recipe_id?: string;
    title?: string;
    servings?: number | null;
    prep_minutes?: number | null;
    cook_minutes?: number | null;
    cover_photo?: string | null;
    category?: string | null;
    ingredients?: { id?: unknown; name?: unknown; quantity?: unknown; unit?: unknown; position?: unknown }[];
    steps?: { id?: unknown; content?: unknown; position?: unknown }[];
    tags?: unknown;
  };

  const ingredients = Array.isArray(view.ingredients)
    ? view.ingredients.map((ing) => ({
      id: String(ing.id ?? ''),
      name: String(ing.name ?? ''),
      quantity: typeof ing.quantity === 'number' ? ing.quantity : null,
      unit: typeof ing.unit === 'string' ? ing.unit : null,
      position: typeof ing.position === 'number' ? ing.position : 0,
    }))
    : [];
  const steps = Array.isArray(view.steps)
    ? view.steps.map((step) => ({
      id: String(step.id ?? ''),
      content: String(step.content ?? ''),
      position: typeof step.position === 'number' ? step.position : 0,
    }))
    : [];
  const tags = Array.isArray(view.tags) ? view.tags.map(String) : [];

  return json({
    recipeId: view.recipe_id ?? null,
    title: view.title ?? null,
    servings: view.servings ?? null,
    prepMinutes: view.prep_minutes ?? null,
    cookMinutes: view.cook_minutes ?? null,
    coverPhotoUrl: await resolveGuestCoverUrl(admin, view.cover_photo),
    category: view.category ?? null,
    ingredients,
    steps,
    tags,
  });
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
      const admin = ctx.supabaseAdmin;

      // `link-view` est le seul chemin sans session : dispatché AVANT le
      // contrôle `user`, sans valider le code sur le chemin 401. Tout le
      // reste exige une session.
      if (body.action === 'link-view') {
        return await handleLinkView(admin, body);
      }
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour partager une recette.' }, 401);
      }

      if (body.action === 'create') return await handleCreate(admin, userId, body);
      if (body.action === 'revoke') return await handleRevoke(admin, userId, body);
      return await handleSummary(admin, userId, body);
    } catch (error) {
      if (error instanceof RecipeInviteError) return json({ error: error.message }, error.status);

      console.error('recipe-invite: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
