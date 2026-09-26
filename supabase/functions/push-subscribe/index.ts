/**
 * Edge Function `push-subscribe`.
 *
 * Point d'entrée : `POST /functions/v1/push-subscribe`
 * Corps : `{ action: 'config' | 'subscribe' | 'unsubscribe' | 'list', ... }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: 'user'` — session obligatoire (`Authorization: Bearer <JWT>`).
 *   Un `endpoint` de Push est une capacité : le seul moyen d'en obtenir un pour
 *   soi est de le créer dans SON navigateur, et le seul moyen de le transmettre
 *   à ce service est un appel authentifié. Aucun mode `publishable` n'est donc
 *   accepté, pas même pour lire la configuration : sans session, l'appel est
 *   refusé SANS valider quoi que ce soit.
 *
 * POURQUOI AUCUNE ÉCRITURE DIRECTE DEPUIS LE NAVIGATEUR
 *   `public.push_subscriptions` n'a ni politique RLS ni privilège pour
 *   `authenticated` (migration 0018). Un client qui écrirait lui-même
 *   l'abonnement n'aurait, en cas de fuite, que l'endpoint d'un seul compte à
 *   exposer ; ici, un endpoint oublié en base reste inexploitable. Les trois
 *   opérations passent donc par des fonctions SQL `SECURITY DEFINER` que seul
 *   `service_role` peut appeler, et qui revérifient l'acteur qu'on leur passe.
 *
 * CLÉ VAPID
 *   `VAPID_PUBLIC_KEY` est lue ici et renvoyée par `action: 'config'`, plutôt
 *   qu'injectée dans le bundle du frontend. Une clé publique n'est pas un
 *   secret, mais elle a une contrainte de version que le bundle n'a pas : il est
 *   servi en cache pendant des mois, et la changer exigerait de reconstruire et
 *   redéployer le frontend. Une rotation de clé se fait alors sans toucher au
 *   frontend, et l'écart entre la clé du build et celle du serveur — qui produit
 *   un abonnement enregistré puis jamais notifié — devient impossible.
 *
 * CONTRAT DE RÉPONSE
 *   config     -> { vapid_public_key: string | null, push_configured: boolean }
 *   subscribe  -> { id, endpoint, created_at, last_success_at }
 *   unsubscribe-> { removed: boolean }
 *   list       -> [{ id, endpoint, device, created_at, last_success_at, failure_count }]
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`, forme équivalente à `export default { fetch }` pour le
 * runtime Deno de la stack auto-hébergée.
 */

// Spécificateur BARE, et non `npm:@supabase/server` : le runtime publie une
// table d'importation à sa racine (`volumes/functions/deno.jsonc`) qui épingle
// `@supabase/server` à `npm:@supabase/server@^1`. C'est ce mécanisme que
// Deno applique aux fonctions du fournisseur, et il doit s'appliquer aux
// nôtres. Un `npm:` non épinglé serait résolu à chaque démarrage à froid, depuis
// la dernière version publiée : le jour où `@supabase/server` publie une v2, les
// fonctions changeraient de comportement sans commit ni test.

import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class SubscribeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

/** Base64url : ni `+`, ni `/`, ni `=`. */
const base64Url = z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'Valeur base64url invalide.');

/** 65 octets (point P-256 non compressé) font 87 caractères base64url. */
const p256dh = base64Url.refine((value) => value.length === 87, 'Clé publique de 65 octets attendue.');

/** Le secret d'authentification fait 16 octets, soit 22 caractères. */
const authSecret = base64Url.refine((value) => value.length === 22, 'Secret d\'authentification de 16 octets attendu.');

/** Un endpoint de service Push est une URL HTTPS d'une origine bien connue. */
const endpoint = z
  .string()
  .trim()
  .min(16)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.pathname.length > 1;
    } catch {
      return false;
    }
  }, 'Adresse de service Push invalide.');

const isoInstant = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? null);

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('config') }),
  z.object({
    action: z.literal('subscribe'),
    endpoint,
    keys: z.object({ p256dh, auth: authSecret }),
    expirationTime: isoInstant,
    userAgent: z.string().trim().max(300).nullish().transform((value) => value ?? null),
  }),
  z.object({ action: z.literal('unsubscribe'), endpoint }),
  z.object({ action: z.literal('list') }),
]);

type RequestBody = z.infer<typeof requestSchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new SubscribeError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SubscribeError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Limitation de débit
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { config: 60, subscribe: 20, unsubscribe: 20, list: 30 };
const MAX_TRACKED_CLIENTS = 5_000;

const counters = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? 'inconnu').trim();
}

function enforceRateLimit(request: Request, action: string): void {
  const now = Date.now();
  const key = `${action}:${clientAddress(request)}`;
  const entry = counters.get(key);

  if (entry && entry.resetAt > now) {
    entry.count += 1;
    if (entry.count > (LIMITS[action] ?? 20)) {
      throw new SubscribeError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
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

type AdminClient = SupabaseClient;

interface SubscriptionRow {
  id: string;
  endpoint: string;
  created_at: string;
  last_success_at: string | null;
}

/** Traduit une erreur PostgreSQL en réponse HTTP lisible. */
function translateRpcError(error: { code?: string; message: string }): SubscribeError {
  const message = error.message ?? '';

  if (message.includes('session requise')) return new SubscribeError(401, 'Connectez-vous pour activer les notifications.');
  if (message.includes('endpoint obligatoire')) return new SubscribeError(400, 'Adresse de service Push absente.');
  if (message.includes('clé publique')) {
    return new SubscribeError(400, 'Clés d’abonnement incomplètes : réactivez les notifications.');
  }
  if (message.includes('auth_secret') || message.includes('authentification')) {
    return new SubscribeError(400, 'Secret d’abonnement invalide.');
  }
  if (error.code === '23514') {
    // Contrainte de motif ou de longueur : la valeur venue du navigateur n'est
    // pas un abonnement Push valide, même si elle est bien formée en JSON.
    return new SubscribeError(400, 'Cet abonnement Push n’est pas exploitable.');
  }
  if (error.code === '42501') return new SubscribeError(403, 'Accès refusé.');

  // Ni l'endpoint ni les clés ne sont journalisés : ce sont les deux éléments
  // qui permettraient de notifier cet appareil.
  console.error('push-subscribe: erreur RPC', { code: error.code, message });
  return new SubscribeError(500, 'Enregistrement impossible.');
}

async function handleSubscribe(admin: AdminClient, userId: string, body: RequestBody & { action: 'subscribe' }) {
  const { data, error } = await admin.rpc('register_push_subscription', {
    p_user_id: userId,
    p_endpoint: body.endpoint,
    p_p256dh: body.keys.p256dh,
    p_auth_secret: body.keys.auth,
    p_expiration_time: body.expirationTime,
    p_user_agent: body.userAgent,
  });

  if (error) throw translateRpcError(error);

  const row = (data ?? {}) as Partial<SubscriptionRow>;
  if (!row.id) {
    throw new SubscribeError(500, 'Enregistrement impossible.');
  }

  return json({
    id: row.id,
    endpoint: row.endpoint,
    created_at: row.created_at,
    last_success_at: row.last_success_at ?? null,
  });
}

async function handleUnsubscribe(admin: AdminClient, userId: string, body: RequestBody & { action: 'unsubscribe' }) {
  const { data, error } = await admin.rpc('remove_push_subscription', {
    p_user_id: userId,
    p_endpoint: body.endpoint,
  });

  if (error) throw translateRpcError(error);
  return json({ removed: data === true });
}

async function handleList(admin: AdminClient, userId: string) {
  const { data, error } = await admin.rpc('list_push_subscriptions', { p_user_id: userId });

  if (error) throw translateRpcError(error);
  return json(Array.isArray(data) ? data : []);
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const userId = ctx.authMode === 'user' ? ctx.userClaims?.id : undefined;
      if (!userId) {
        return json({ error: 'Connectez-vous pour gérer les notifications.' }, 401);
      }

      const body = await parseBody(request);
      enforceRateLimit(request, body.action);

      // `config` ne touche à aucune donnée : il répond avant même de lire
      // l'identité au-delà de sa présence, ce qui permet au panneau de
      // afficher l'état réel du service sans abonnement.
      if (body.action === 'config') {
        const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? null;
        return json({ vapid_public_key: publicKey, push_configured: Boolean(publicKey) });
      }

      const admin = ctx.supabaseAdmin;

      if (body.action === 'subscribe') return await handleSubscribe(admin, userId, body);
      if (body.action === 'unsubscribe') return await handleUnsubscribe(admin, userId, body);
      return await handleList(admin, userId);
    } catch (error) {
      if (error instanceof SubscribeError) return json({ error: error.message }, error.status);

      console.error('push-subscribe: erreur inattendue', {
        message: error instanceof Error ? error.name : 'inconnue',
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
