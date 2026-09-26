/**
 * Edge Function `push-notify`.
 *
 * Point d'entrée : `POST /functions/v1/push-notify`
 * Corps : `{ scope: 'rappels' | 'anniversaires' | 'test' }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['secret', 'user']`
 *   * `secret` — clé secrète `service_role`, lue dans Vault par le job pg_cron.
 *     C'est le mode du job : il distribue tout ce qui est dû, tous foyers
 *     confondus.
 *   * `user`   — session utilisateur, et uniquement pour `scope: 'test'` : le
 *     test vise les abonnements DU DEMANDEUR. Sans cette restriction, un
 *     appelant pourrait utiliser la fonction pour déclencher des envois à
 *     l'ensemble de la base.
 *
 *   `public.due_push_notifications` et les deux fonctions de rapport sont
 *   `SECURITY DEFINER` et réservées à `service_role` : un client porteur d'un
 *   JWT utilisateur est `authenticated` et se voit refuser l'appel. La
 *   fonction n'a donc aucun pouvoir qu'elle ne tiendrait pas déjà de la clé
 *   secrète — et c'est bien pourquoi le mode `user` se limite à ses propres
 *   lignes.
 *
 * ENVOI
 *   Chaque couple (notification, abonnement) est chiffré séparément, avec une
 *   paire de clés éphémère et un sel tiré au hasard : un message identique
 *   envoyé à deux appareils ne produit donc pas deux corps identiques, et un
 *   service Push ne peut pas déduire qu'une même personne reçoit des messages
 *   voisins.
 *
 *   Le chiffrement et la signature VAPID vivent dans `web-push.ts`, vérifiés
 *   contre les vecteurs publiés de la RFC 8291 par la suite Vitest du
 *   frontend. Rien ici n'est « testé » par l'envoi : un envoi réussi ne prouve
 *   que qu'un message est parti.
 *
 * RAPPORTS
 *   Les résultats sont consignés en un seul appel à
 *   `public.record_push_deliveries`, et les rappels distribués retirés en un seul
 *   appel à `public.consume_push_reminders`. Deux allers-retours par exécution,
 *   quel que soit le nombre d'appareils : c'est ce qui rend le job de quinze
 *   minutes tenable.
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`.
 */

import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
import { assertPayloadWithinLimit, buildVapidAuthorization, encryptPayload } from './web-push.ts';

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
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
}

class PushError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const requestSchema = z.object({
  scope: z.enum(['rappels', 'anniversaires', 'test']),
});

async function parseBody(request: Request): Promise<z.infer<typeof requestSchema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new PushError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new PushError(400, 'Portée inconnue.');
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Configuration VAPID
// ---------------------------------------------------------------------------

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * L'absence de clé est un défaut de configuration, pas une erreur d'appel : la
 * fonction doit le dire explicitement plutôt que laisser croire à un succès.
 */
function vapidConfig(): VapidConfig {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');

  if (!publicKey || !privateKey || !subject) {
    throw new PushError(500, 'Configuration VAPID absente : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT sont requis.');
  }
  return { publicKey, privateKey, subject };
}

// ---------------------------------------------------------------------------
// Forme des lignes lues en base
// ---------------------------------------------------------------------------

interface DueSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
}

interface DueNotification {
  user_id: string;
  reminder_id: string;
  household_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  tag: string;
  subscriptions: DueSubscription[];
}

/** Type de rappel, pour la consommation : l'anniversaire n'a aucune ligne. */
function reminderKind(tag: string): 'tache' | 'evenement' | 'routine' | null {
  if (tag.startsWith('tache-')) return 'tache';
  if (tag.startsWith('evenement-')) return 'evenement';
  if (tag.startsWith('routine-')) return 'routine';
  return null;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Charge utile du message.
 *
 * Elle est bornée par le budget du service Push (3992 octets de texte clair) et
 * non par celui du JSON : c'est la longueur du texte clair qui compte, et une
 * description de tâche peut être arbitrairement longue. Une notification trop
 * longue est donc tronquée ICI, avec un nom lisible — un service Push qui
 * refuse un corps ne dit pas lequel des cent messages du lot il a rejeté.
 */
export function buildPayload(notification: DueNotification): PushPayload {
  const title = notification.title.slice(0, 120);
  const rawBody = (notification.body ?? '').trim();
  const body = truncate(rawBody || 'Rappel du foyer', 180);
  const url = notification.url ?? '/accueil';
  return { title, body, url, tag: notification.tag };
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Envoi à un service Push
// ---------------------------------------------------------------------------

interface DeliveryResult {
  id: string;
  delivered: boolean;
  status: number;
  permanent: boolean;
}

/** Codes par lesquels un service Push déclare un endpoint définitivement mort. */
const PERMANENT_STATUSES = new Set([404, 410]);

export async function deliver(
  subscription: DueSubscription,
  payload: PushPayload,
  vapid: VapidConfig,
): Promise<DeliveryResult> {
  const plaintext = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  // Refusé avant tout appel réseau : inutile de consommer un jeton VAPID pour
  // un corps que le service refuserait.
  assertPayloadWithinLimit(plaintext);

  const { body } = await encryptPayload(plaintext, subscription.p256dh, subscription.auth_secret);
  const { authorization } = await buildVapidAuthorization(
    subscription.endpoint,
    vapid.subject,
    vapid.publicKey,
    vapid.privateKey,
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      'content-length': String(body.length),
      ttl: '86400',
      urgency: 'normal',
    },
    body,
  });

  // 201 est la réponse créée par un service Push qui a ACCEPTÉ le message pour
  // distribution ; 200 arrive chez certains services. Au-delà, le message n'est
  // pas garanti distribué, et 404/410 signifie que l'endpoint n'existe plus.
  const delivered = response.status === 201 || response.status === 200;
  return {
    id: subscription.id,
    delivered,
    status: response.status,
    permanent: PERMANENT_STATUSES.has(response.status),
  };
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

async function send(
  admin: SupabaseClient,
  notifications: DueNotification[],
  vapid: VapidConfig,
  onlyUserId?: string,
) {
  const results: DeliveryResult[] = [];
  const consumed: { kind: string; id: string }[] = [];
  let delivered = 0;
  let failed = 0;
  let dropped = 0;

  for (const notification of notifications) {
    // Le mode `user` ne distribue que ses propres lignes, quel que soit le
    // contenu de la réponse de la base.
    if (onlyUserId && notification.user_id !== onlyUserId) continue;

    let sent = 0;

    for (const subscription of notification.subscriptions) {
      let result: DeliveryResult;
      try {
        result = await deliver(subscription, buildPayload(notification), vapid);
      } catch (error) {
        // Un échec local (clé illisible, endpoint injoignable) ne doit pas
        // interrompre les autres appareils : chacun est compté pour lui-même.
        result = { id: subscription.id, delivered: false, status: 0, permanent: false };
        // Ni le message ni l'URL de l'erreur : une `TypeError` de `fetch`
        // contient l'endpoint, qui est exactement ce qu'il ne faut pas
        // journaliser.
        console.error('push-notify: envoi impossible', {
          subscription: subscription.id,
          reason: error instanceof Error ? error.name : 'inconnue',
        });
      }

      results.push(result);
      if (result.delivered) {
        delivered += 1;
        sent += 1;
      } else if (result.permanent) {
        dropped += 1;
      } else {
        failed += 1;
      }
    }

    // Le rappel n'est retiré que si un appareil l'a réellement reçu. Sinon il
    // retentera au prochain passage, ce qui est le comportement voulu pour un
    // foyer dont les telephones sont éteints.
    const kind = reminderKind(notification.tag);
    if (kind && sent > 0) consumed.push({ kind, id: notification.reminder_id });
  }

  // Deux appels, quel que soit le volume : c'est la condition pour que le job
  // de quinze minutes reste tenable.
  if (results.length > 0) {
    const { data: report, error } = await admin.rpc('record_push_deliveries', {
      p_results: results,
      p_failure_threshold: 10,
    });
    if (error) console.error('push-notify: rapport de livraison refusé', { code: error.code });
    else if (report) {
      // La base fait foi sur ce qui a été réellement distribué : le compteur
      // local sert au journal, celui de la base à la décision de suppression.
      dropped = Number((report as { dropped?: number }).dropped ?? dropped);
    }
  }

  let consumedCount = 0;
  if (consumed.length > 0) {
    const { data, error } = await admin.rpc('consume_push_reminders', { p_reminders: consumed });
    if (error) console.error('push-notify: consommation des rappels refusée', { code: error.code });
    else consumedCount = Number(data ?? 0);
  }

  const report = {
    notifications: notifications.length,
    delivered,
    failed,
    dropped,
    consumed: consumedCount,
  };

  // Le RAPPORT EST JOURNALISÉ, y compris quand tout va bien.
  //
  // Sans cette ligne, un envoi réussi ne laissait AUCUNE trace : la fonction ne
  // journalisait que les erreurs, et son retour partait vers pg_net, qui jette
  // le corps de la réponse. La seule preuve d'une distribution restait alors
  // dans `push_subscriptions` — invisible tant qu'on ne sait pas qu'il faut
  // aller la chercher, et impossible à relier à un envoi précis quand plusieurs
  // tournent en parallèle.
  //
  // Ce sont des compteurs, jamais un endpoint ni un message : la règle de
  // non-divulgation ci-dessus vaut aussi pour les lignes de journalisation.
  console.log('push-notify: rapport', report);

  return report;
}

async function readDue(admin: SupabaseClient, scope: string, userId?: string) {
  const { data, error } = await admin.rpc('due_push_notifications', {
    p_scope: scope,
    p_now: null,
    p_user_id: userId ?? null,
  });

  if (error) {
    // `PGRST202` : fonction absente du schéma publié, donc migration 0019 non
    // appliquée. Le dire est plus utile qu'une 500 générique.
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new PushError(503, 'Le calcul des rappels n’est pas encore disponible.');
    }
    console.error('push-notify: lecture des rappels impossible', { code: error.code });
    throw new PushError(500, 'Calcul des rappels impossible.');
  }

  return (Array.isArray(data) ? data : []) as DueNotification[];
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: ['secret', 'user'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const body = await parseBody(request);
      const vapid = vapidConfig();
      const admin = ctx.supabaseAdmin;
      const userId = ctx.authMode === 'user' ? ctx.userClaims?.id : undefined;

      // Le mode `user` n'a droit qu'au test : distribuer les rappels réels
      // depuis une session autoriserait n'importe quel membre à déclencher
      // l'envoi de tout le foyer, à volonté.
      if (ctx.authMode === 'user') {
        if (body.scope !== 'test') {
          return json({ error: 'Réservé au serveur.' }, 403);
        }
        if (!userId) {
          return json({ error: 'Connectez-vous pour envoyer un test.' }, 401);
        }

        // La base écrit le message de test et joint les abonnements DU
        // DEMANDEUR, clés de chiffrement comprises : le client n'a jamais
        // accès à `p256dh` ni au secret d'authentification, et ne peut ni
        // choisir le texte ni la cible.
        const due = await readDue(admin, 'test', userId);
        const withoutDevice = due.filter((row) => row.subscriptions.length === 0);
        if (due.length === 0 || withoutDevice.length > 0) {
          return json({ error: 'Aucun appareil enregistré sur ce compte.' }, 409);
        }

        return json(await send(admin, due, vapid, userId));
      }

      if (body.scope === 'test') {
        return json({ error: 'Un test se demande depuis l’application.' }, 403);
      }

      const due = await readDue(admin, body.scope);
      if (due.length === 0) {
        return json({ scope: body.scope, notifications: 0, delivered: 0, failed: 0, dropped: 0, consumed: 0 });
      }

      return json({ scope: body.scope, ...(await send(admin, due, vapid)) });
    } catch (error) {
      if (error instanceof PushError) return json({ error: error.message }, error.status);

      console.error('push-notify: erreur inattendue', {
        message: error instanceof Error ? error.name : 'inconnue',
      });
      return json({ error: 'Envoi impossible.' }, 500);
    }
  }),
);
