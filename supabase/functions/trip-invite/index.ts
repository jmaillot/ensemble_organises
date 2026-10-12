/**
 * Edge Function `trip-invite` (phase 15, plan 15-01).
 *
 * Point d'entrée : `POST /functions/v1/trip-invite`
 * Corps : `{ action: 'create-trip' | 'create' | 'revoke' | 'summary' |
 *           'join' | 'redeem-guest' | 'guest-view' | 'link-view' |
 *           'member-leave' | 'guest-expense-create', ... }`
 *
 * Copie le byte-motif de `ardoise-invite` / `gift-list-invite` (jamais un
 * design d'invitation main-levée) : même entropie, même HMAC, même oracle,
 * mêmes rate-limits, même child-guard.
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`
 *   * `user`        → session utilisateur. Seul mode qui exécute
 *                     `create-trip`, `create`, `revoke`, `summary`, `join`
 *                     et `member-leave`.
 *   * `publishable` → accepté par la passerelle, mais REFUSÉ ici avec 401
 *                     SANS valider le code, SAUF pour `redeem-guest`,
 *                     `guest-view`, `link-view` et `guest-expense-create` :
 *                     les seuls chemins des invités externes, qui n'ont pas
 *                     de compte et donc pas de JWT. Leur seule credence est
 *                     le ticket, vérifié en base par les RPC.
 *
 * SÉCURITÉ DU CODE
 *   * 24 octets aléatoires → 32 caractères base64url (≥ 128 bits).
 *   * La base ne stocke QUE `HMAC-SHA-256(secret, code)` en hexadécimal
 *     (`trip_invites.token_hash`) ; le ticket invité suit le régime
 *     ardoise (`SHA-256` simple, `trip_guests.ticket_hash`).
 *   * `TRIP_INVITE_HMAC_SECRET` dédié (jamais une clé Supabase ni un autre
 *     HMAC), lu dans l'environnement serveur uniquement.
 *   * Le code et le ticket bruts ne sont ni persistés ni journalisés : rendus
 *     une seule fois, à leur création.
 *   * Arrêt du partage (`revoke`) : `is_active = false`, historique
 *     (participants, invités, tickets) conservé.
 *
 * INVITÉS ET ARDOISE LIÉE
 *   À l'échange, le RPC crée aussi un miroir payeur-nommé SANS ticket sur
 *   l'ardoise liée (motif 0067), sous le MÊME identifiant des deux côtés :
 *   `guest-expense-create` dépense sur l'ardoise liée avec ce même id, sans
 *   résolution fragile par nom. Le ticket du voyage reste la seule credence,
 *   utilisable via cette Edge seule — aucun chemin PostgREST pour les invités
 *   (les RPC sont `service_role` seuls, prouvé en 0001/0053).
 *
 * CONTRAT DE RÉPONSE
 *   create-trip -> { trip_id, ardoise_id }
 *   create      -> { code, expiresAt, maxUses, tripId }
 *   revoke      -> { trip_id, revoked }
 *   summary     -> { tripId, isActive, hasCode, expiresAt, maxUses, useCount } | null
 *   join        -> { trip_id, already_member }
 *   redeem-guest -> { trip_id, guest_ticket }
 *   guest-view  -> { trip, guest } (ticket vérifié, sans conso use_count)
 *   link-view   -> { trip, guest: null } (code vérifié, sans conso use_count)
 *   member-leave -> { trip_id, left }
 *   guest-expense-create -> dépense (ligne `expenses` de l'ardoise liée)
 *
 * TICKET CÔTÉ CLIENT : `localStorage["eo:trip:ticket:<tripId>"]` (le plan
 * client le consomme ; cette fonction ne le pose jamais elle-même).
 *
 * REFUS ENFANT (D-01) : chaque action `user` résout le rôle du foyer côté
 * serveur (lookup `household_members` en `service_role` — jamais un claim
 * client) et refuse `enfant` AVANT tout RPC, avec l'erreur uniforme de sa
 * famille (`child-guard.ts`, miroir byte-identique des sorties
 * `translateRpcError` ci-dessous). `member-leave` suit le même régime que
 * les autres actions user (le RPC tranche l'oracle, le guard ne fait que
 * refuser l'enfant avéré). `redeem-guest`, `guest-view`, `link-view` et
 * `guest-expense-create` restent sans identité, ouverts par construction.
 */

// Spécificateur BARE, comme `ardoise-invite` : le runtime épingle
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
  'access-control-allow-headers': 'authorization, apikey, content-type, x-trip-guest',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const MAX_USES_DEFAULT = 20;
const MAX_USES_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class TripInviteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new TripInviteError(500, `Configuration serveur absente : ${name}.`);
  return value;
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

const tripField = z.string().trim().min(1).max(128);

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

const expensePartSchema = z.object({
  participantType: z.enum(['membre', 'guest']),
  memberId: z.string().trim().min(1).max(128).optional(),
  guestId: z.string().trim().min(1).max(128).optional(),
  shareAmount: z.union([z.number().positive(), z.string().regex(/^[0-9]+(\.[0-9]+)?$/)]),
});

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-trip'),
    name: z.string().trim().min(1, 'Nommez votre voyage.').max(200),
    destination: z.string().trim().min(1, 'Indiquez une destination.').max(200),
    startDate: z.string().date(),
    endDate: z.string().date(),
    notes: z.string().trim().max(2000).optional(),
    householdId: tripField.optional(),
    /** Sélection initiale : identifiants de membres du foyer (admin/membre).
     * Absent = tous (régime 0066) ; les inconnus, enfants et hors-foyer
     * sont ignorés en base. */
    memberIds: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
    tabState: z.record(z.string(), z.boolean()).optional(),
  }),
  z.object({
    action: z.literal('create'),
    tripId: tripField,
    expiresAt: isoInstant,
    maxUses: z.number().int().min(1).max(MAX_USES_LIMIT).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
    tripId: tripField,
  }),
  z.object({
    action: z.literal('summary'),
    tripId: tripField,
  }),
  z.object({
    action: z.literal('join'),
    /** Code brut tel qu'affiché à la génération. */
    code: codeField,
  }),
  z.object({
    action: z.literal('redeem-guest'),
    code: codeField,
    displayName: z.string().trim().min(1, 'Indiquez un pseudonyme.').max(120),
  }),
  z.object({
    action: z.literal('guest-view'),
    /** Ticket brut remis à l'échange (jamais persisté côté serveur). */
    ticket: z.string().trim().min(20).max(256),
  }),
  z.object({
    action: z.literal('link-view'),
    /** Code brut du lien (vérifié actif, non expiré ; sans ticket ni nom). */
    code: codeField,
  }),
  z.object({
    action: z.literal('member-leave'),
    /** Voyage à quitter : l'identité est résolue EN BASE depuis la session. */
    tripId: tripField,
  }),
  z.object({
    action: z.literal('guest-expense-create'),
    /** Ticket brut : seule credence, vérifiée en base par le RPC. */
    ticket: z.string().trim().min(20).max(256),
    title: z.string().trim().min(1, 'Nommez la dépense.').max(200),
    amount: z.number().positive('Le montant doit être supérieur à zéro.'),
    expenseDate: z.string().date().optional(),
    splitType: z.enum(['egal', 'personnalise']).optional(),
    /** Parts : `guest` (id miroir = id d'invité) ou `membre` inscrit. */
    parts: z.array(expensePartSchema).min(1).max(100),
  }),
]);

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new TripInviteError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TripInviteError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
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

/** SHA-256 simple du ticket brut (les tickets sont hachés sans secret côté base). */
async function sha256Hex(ticket: string): Promise<string> {
  const bytes = new TextEncoder().encode(ticket);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
  'create-trip': 10,
  create: 20,
  revoke: 20,
  summary: 30,
  join: 8,
  'redeem-guest': 8,
  'guest-view': 30,
  'link-view': 30,
  'member-leave': 10,
  'guest-expense-create': 20,
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
      throw new TripInviteError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
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
function translateRpcError(error: { code?: string; message: string }): TripInviteError {
  const message = error.message ?? '';

  // Même message que le hash soit inconnu, expiré, épuisé ou révoqué : la
  // fonction SQL ne distingue pas (`code invalide`), et on ne rajoute rien.
  if (message.includes('code invalide')) return new TripInviteError(404, 'Ce code est invalide.');
  if (message.includes('ticket invalide')) return new TripInviteError(404, 'Ticket invalide.');
  if (message.includes('session requise')) return new TripInviteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('nom de voyage invalide')) {
    return new TripInviteError(400, 'Nommez votre voyage (1 à 200 caractères).');
  }
  if (message.includes('destination obligatoire')) {
    return new TripInviteError(400, 'Indiquez une destination.');
  }
  if (message.includes('dates de voyage invalides')) {
    return new TripInviteError(400, 'Dates de voyage invalides.');
  }
  if (message.includes('voyage figé')) {
    return new TripInviteError(403, 'Ce voyage est figé, les dépenses sont fermées.');
  }
  if (message.includes('quitter impossible')) {
    return new TripInviteError(404, 'Ce lien ne passe plus. Demandez un nouveau lien pour rejoindre à nouveau.');
  }
  if (message.includes('voyage introuvable')) return new TripInviteError(404, 'Voyage introuvable.');
  if (message.includes('gestion du voyage réservée') || error.code === '42501') {
    return new TripInviteError(403, 'Seul un administrateur du foyer ou un participant du voyage peut faire cette opération.');
  }
  if (message.includes('la fermeture d’un voyage passe par le serveur')) {
    return new TripInviteError(403, 'La fermeture d’un voyage passe par le serveur.');
  }
  if (message.includes('expiration invalide') || message.includes('nombre d’utilisations invalide')) {
    return new TripInviteError(400, 'Paramètres de partage invalides.');
  }
  if (message.includes('pseudonyme invalide')) {
    return new TripInviteError(400, 'Indiquez un pseudonyme.');
  }
  if (message.includes('libellé de dépense invalide')) {
    return new TripInviteError(400, 'Nommez la dépense (1 à 200 caractères).');
  }
  if (message.includes('le montant doit être supérieur à zéro')) {
    return new TripInviteError(400, 'Le montant doit être supérieur à zéro.');
  }
  if (message.includes('au moins une personne doit partager')) {
    return new TripInviteError(400, 'Indiquez au moins un participant.');
  }
  if (error.code === '23505') {
    return new TripInviteError(409, 'Ce code existe déjà. Régénérez-le.');
  }

  console.error('trip-invite: erreur RPC', { code: error.code, message });
  return new TripInviteError(500, 'Opération impossible.');
}

function checkSecret(): string {
  const secret = env('TRIP_INVITE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new TripInviteError(500, 'TRIP_INVITE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Refus enfant (D-01) : rôle résolu côté serveur, jamais fourni.
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

/** Foyer d'un voyage, ou `null` si inconnu (le RPC possède cet oracle). */
async function tripHousehold(admin: AdminClient, tripId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('trips')
    .select('household_id')
    .eq('id', tripId)
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
    throw new TripInviteError(refusal.status, refusal.message);
  }
}

// ---------------------------------------------------------------------------
// Actions `user`
// ---------------------------------------------------------------------------

async function handleCreateTrip(admin: AdminClient, userId: string, body: RequestBody & { action: 'create-trip' }) {
  const { data: membership } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);

  const households = ((membership ?? []) as { household_id: string }[]).map((row) => row.household_id);
  const householdId = body.householdId ?? households[0];
  if (!householdId || (body.householdId && !households.includes(body.householdId))) {
    throw new TripInviteError(403, 'Vous n’appartenez pas à ce foyer.');
  }

  // D-01 : un enfant ne crée pas de voyage — même 403 que le refus SQL
  // d'écriture (le foyer vient des memberships serveur, pas du client).
  await refuseEnfant(admin, userId, householdId, 'manage');

  const { data, error } = await admin.rpc('create_trip_atomic', {
    p_actor_id: userId,
    p_household_id: householdId,
    p_name: body.name,
    p_destination: body.destination,
    p_start_date: body.startDate,
    p_end_date: body.endDate,
    p_notes: body.notes ?? null,
    p_member_ids: body.memberIds ?? null,
    p_tab_state: body.tabState ?? null,
  });

  if (error) throw translateRpcError(error);
  return json(data ?? null);
}

async function handleCreate(admin: AdminClient, userId: string, body: RequestBody & { action: 'create' }) {
  await refuseEnfant(admin, userId, await tripHousehold(admin, body.tripId), 'manage');
  const secret = checkSecret();
  const code = generateCode();
  const codeHash = await hmacSha256Hex(code, secret);

  const { data, error } = await admin.rpc('create_trip_invite', {
    p_actor_id: userId,
    p_trip_id: body.tripId,
    p_token_hash: codeHash,
    p_expires_at: body.expiresAt ?? null,
    p_max_uses: body.maxUses ?? MAX_USES_DEFAULT,
  });

  if (error) throw translateRpcError(error);

  const issued = (data ?? {}) as { expires_at?: string | null; max_uses?: number };
  return json({
    code,
    expiresAt: issued.expires_at ?? body.expiresAt ?? null,
    maxUses: issued.max_uses ?? body.maxUses ?? MAX_USES_DEFAULT,
    tripId: body.tripId,
  });
}

async function handleRevoke(admin: AdminClient, userId: string, body: RequestBody & { action: 'revoke' }) {
  await refuseEnfant(admin, userId, await tripHousehold(admin, body.tripId), 'manage');
  const { data, error } = await admin.rpc('revoke_trip_invite', {
    p_actor_id: userId,
    p_trip_id: body.tripId,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? { revoked: 0 }) as { revoked: number });
}

async function handleSummary(admin: AdminClient, userId: string, body: RequestBody & { action: 'summary' }) {
  await refuseEnfant(admin, userId, await tripHousehold(admin, body.tripId), 'manage');
  const { data, error } = await admin.rpc('trip_invite_summary', {
    p_actor_id: userId,
    p_trip_id: body.tripId,
  });

  if (error) throw translateRpcError(error);
  if (!data) return json(null);

  const summary = data as {
    invite_id: string;
    trip_id: string;
    is_active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
    created_at: string;
  };
  // L'empreinte ne quitte jamais la base : `hasCode` dit seulement si un
  // code actif existe, sans le rendre.
  return json({
    tripId: summary.trip_id,
    isActive: summary.is_active,
    hasCode: summary.is_active,
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
  const { data: invite } = await admin
    .from('trip_invites')
    .select('trip_id')
    .eq('token_hash', codeHash)
    .maybeSingle();
  const tripId = (invite as { trip_id?: unknown } | null)?.trip_id;
  if (typeof tripId === 'string') {
    const householdId = await tripHousehold(admin, tripId);
    if (householdId) {
      const { data: membership } = await user
        .from('household_members')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!membership) {
        throw new TripInviteError(403, 'Vous n’appartenez pas au foyer de ce voyage : utilisez le lien invité.');
      }
      // D-01 : un enfant membre ne rejoint pas — même oracle `code invalide`
      // que tout code inconnu (le foyer vient du code, pas du client).
      await refuseEnfant(admin, userId, householdId, 'code');
    }
  }

  const { data, error } = await admin.rpc('redeem_trip_invite', {
    p_token_hash: codeHash,
    p_actor_id: userId,
    p_display_name: null,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? {}) as { trip_id?: string; already_member?: boolean });
}

async function handleMemberLeave(admin: AdminClient, userId: string, body: RequestBody & { action: 'member-leave' }) {
  await refuseEnfant(admin, userId, await tripHousehold(admin, body.tripId), 'manage');
  const { data, error } = await admin.rpc('trip_leave', {
    p_actor_id: userId,
    p_trip_id: body.tripId,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? {}) as { trip_id?: string; left?: boolean });
}

// ---------------------------------------------------------------------------
// Chemins sans session (publishable) : invités externes uniquement.
// ---------------------------------------------------------------------------

async function handleRedeemGuest(admin: AdminClient, body: RequestBody & { action: 'redeem-guest' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  const { data, error } = await admin.rpc('redeem_trip_invite', {
    p_token_hash: codeHash,
    p_actor_id: null,
    p_display_name: body.displayName,
  });

  if (error) throw translateRpcError(error);

  const redeemed = (data ?? {}) as { trip_id?: string; guest_ticket?: string };
  return json({ trip_id: redeemed.trip_id ?? null, guest_ticket: redeemed.guest_ticket ?? null });
}

/**
 * Vue voyage partagée (`guest-view` ticket, `link-view` code vérifié) :
 * identité du voyage + pseudonyme invité. Lecture seule, sans consommer
 * `use_count` (`max_uses` borne les inscriptions, pas les lectures).
 */
async function buildTripView(
  admin: AdminClient,
  tripId: string,
  guestDisplayName: string | null,
) {
  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('id,name,destination,start_date,end_date,cover_photo,notes,is_closed')
    .eq('id', tripId)
    .single();
  if (tripError || !trip) throw new TripInviteError(404, 'Voyage introuvable.');

  return json({
    trip: {
      id: (trip as { id: string }).id,
      name: (trip as { name: string }).name,
      destination: (trip as { destination: string }).destination,
      startDate: (trip as { start_date: string }).start_date,
      endDate: (trip as { end_date: string }).end_date,
      coverPhoto: (trip as { cover_photo: string | null }).cover_photo,
      notes: (trip as { notes: string | null }).notes,
      isClosed: (trip as { is_closed: boolean }).is_closed,
    },
    guest: guestDisplayName ? { display_name: guestDisplayName } : null,
  });
}

async function handleGuestView(admin: AdminClient, body: RequestBody & { action: 'guest-view' }) {
  const ticketHash = await sha256Hex(body.ticket);

  const { data: verified, error: verifyError } = await admin.rpc('verify_trip_ticket', {
    p_ticket_hash: ticketHash,
  });
  if (verifyError) throw translateRpcError(verifyError);
  const guest = (verified ?? {}) as { guest_id?: string; trip_id?: string; display_name?: string };
  if (!guest.trip_id) throw new TripInviteError(404, 'Ticket invalide.');

  return buildTripView(admin, guest.trip_id, guest.display_name ?? null);
}

/**
 * Lecture anonyme par lien : le code EST le contrôle d'accès (actif, non
 * expiré). Aucun nom demandé, aucune ligne invitée créée, compteur
 * d'utilisations intact.
 */
async function handleLinkView(admin: AdminClient, body: RequestBody & { action: 'link-view' }) {
  const secret = checkSecret();
  const codeHash = await hmacSha256Hex(body.code, secret);

  const { data: invite, error: inviteError } = await admin
    .from('trip_invites')
    .select('trip_id,is_active,expires_at')
    .eq('token_hash', codeHash)
    .single();
  const row = invite as { trip_id: string; is_active: boolean; expires_at: string | null } | null;
  if (inviteError || !row) throw new TripInviteError(404, 'Lien invalide.');
  if (!row.is_active) throw new TripInviteError(404, 'Lien invalide.');
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    throw new TripInviteError(404, 'Lien invalide.');
  }
  return buildTripView(admin, row.trip_id, null);
}

/**
 * Dépense d'un invité (D-03/D-04) : ticket vérifié EN BASE par le RPC, sur
 * l'ardoise liée au voyage. Les parts `guest` portent l'id miroir (= id
 * d'invité) ; les parts `membre` exigent l'inscription à l'ardoise — le
 * tout validé côté serveur, jamais en PostgREST.
 */
async function handleGuestExpenseCreate(admin: AdminClient, body: RequestBody & { action: 'guest-expense-create' }) {
  const ticketHash = await sha256Hex(body.ticket);

  const parts = body.parts.map((part) => ({
    participant_type: part.participantType,
    member_id: part.memberId ?? null,
    guest_id: part.guestId ?? null,
    share_amount: String(part.shareAmount),
  }));

  const { data, error } = await admin.rpc('create_trip_guest_expense', {
    p_ticket_hash: ticketHash,
    p_title: body.title,
    p_amount: body.amount,
    p_expense_date: body.expenseDate ?? null,
    p_split_type: body.splitType ?? 'egal',
    p_parts: parts,
  });

  if (error) throw translateRpcError(error);
  return json((data ?? {}) as Record<string, unknown>);
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

      // `redeem-guest`, `guest-view`, `link-view` et `guest-expense-create`
      // sont les seuls chemins sans session : dispatchés AVANT le contrôle
      // `user`, sans valider le code sur le chemin 401.
      if (body.action === 'redeem-guest') {
        return await handleRedeemGuest(admin, body);
      }
      if (body.action === 'guest-view') {
        return await handleGuestView(admin, body);
      }
      if (body.action === 'link-view') {
        return await handleLinkView(admin, body);
      }
      if (body.action === 'guest-expense-create') {
        return await handleGuestExpenseCreate(admin, body);
      }
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour préparer un voyage.' }, 401);
      }

      if (body.action === 'create-trip') return await handleCreateTrip(admin, userId, body);
      if (body.action === 'create') return await handleCreate(admin, userId, body);
      if (body.action === 'revoke') return await handleRevoke(admin, userId, body);
      if (body.action === 'summary') return await handleSummary(admin, userId, body);
      if (body.action === 'member-leave') return await handleMemberLeave(admin, userId, body);
      return await handleJoin(admin, ctx.supabase, userId, body);
    } catch (error) {
      if (error instanceof TripInviteError) return json({ error: error.message }, error.status);

      console.error('trip-invite: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
