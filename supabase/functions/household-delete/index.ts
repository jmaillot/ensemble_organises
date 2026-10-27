/**
 * Edge Function `household-delete` — UNIFIÉE (phase 27, plan 03, D-10).
 *
 * Point d'entrée : `POST /functions/v1/household-delete`
 * Trois familles d'appels, un seul code de suppression :
 *
 *   1. Mode `foyer`   — `{ householdId }` (ancien contrat, SANS champ mode)
 *      ou `{ mode: 'foyer', householdId }`. Suppression d'un foyer par son
 *      administrateur (politique §6, CGU art. 9). Le mode 'foyer' est le
 *      DÉFAUT de compatibilité quand le discriminant est absent : le panneau
 *      admin existant (`household-delete-panel.tsx`) continue de fonctionner
 *      sans modification (RGDP-07).
 *   2. Mode `compte`  — `{ mode: 'compte' }`. Demande de suppression de compte
 *      RGPD : RPC `request_account_deletion` (0167, instantané D-04 +
 *      déshumanisation D-01/02/03 + demande D-06, tout transactionnel), kill
 *      IMMÉDIAT des sessions (RGDP-01), e-mail de confirmation avec lien
 *      d'annulation vers une page de l'APP (jamais /auth/v1/* — D-05).
 *   3. Actions cron   — `{ action: 'reminder' | 'purge-medias' }`, appelées
 *      par les wrappers 0168 (`post_account_deletion_http`) avec la clé
 *      secrète. Le corps ne porte AUCUNE donnée utilisateur (RGDP-04) : les
 *      destinataires et les chemins sont relus EN BASE par l'Edge elle-même.
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable', 'secret']` — la passerelle accepte les
 *   trois, mais :
 *     - mode 'foyer' et mode 'compte' exigent une session `user` réelle
 *       (401 sinon) ; le rôle admin du foyer est revérifié EN BASE par le RPC,
 *       et le RPC 0167 ne laisse agir que le propriétaire du compte (42501) ;
 *     - les actions cron exigent `secret` (T-27-10 : un JWT utilisateur ne
 *       déclenche JAMAIS une action cron).
 *
 * SONDE F1 (phase 27 research A1/OQ-1) — tranchée le 2026-10-27 :
 *   le `ctx` de `withSupabase` expose `{ supabase, supabaseAdmin, userClaims,
 *   jwtClaims, authMode }` — il NE expose PAS le JWT utilisateur brut.
 *   Choix retenu : extraire le Bearer du header `Authorization` de la requête
 *   (le JWT y est, c'est la session de l'appelant) puis appeler
 *   `supabaseAdmin.auth.signOut(jwt, { scope: 'global' })` — le client GoTrue
 *   sous-jacent poste `/auth/v1/logout?scope=global` avec ce JWT (le kill est
 *   donc celui de LA session propriétaire du token, exactement RGDP-01).
 *   Le fallback `POST /auth/v1/admin/logout?scope=global` + service key
 *   n'est pas nécessaire : l'API `signOut(jwt, { scope })` de supabase-js v2
 *   couvre le même chemin sans reconstruire un appel HTTP à la main.
 *
 * CONTRAT DE RÉPONSE
 *   foyer        -> { household_id, expenses, storage_objects, storage_cleanup: 'ok' | 'partial' }
 *   compte       -> { mode: 'compte', request_id, sessions_revoked, email_sent }
 *                   (email_sent = false si l'e-mail n'a pas pu partir ALORS
 *                   QUE la demande est enregistrée — échec honnête, jamais
 *                   muet : le RPC a déjà commité, on ne peut pas le défaire)
 *   reminder     -> { action: 'reminder', alerted, sent, failed }
 *   purge-medias -> { action: 'purge-medias', storage_objects, storage_cleanup: 'ok' | 'partial' }
 */

import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
// Envoi SMTP (RGDP-02/03) : paquet béni par l'exemple officiel Supabase
// `send-email-smtp`, déjà éprouvé dans `gift-list-invite` (phase 06). Version
// exacte épinglée, jamais de plage flottante (AGENTS.md §2.1).
import nodemailer from 'npm:nodemailer@10.0.15';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Buckets privés dont les objets vivent sous `<householdId>/…` (0010). */
const HOUSEHOLD_BUCKETS = ['household-media', 'household-avatars'] as const;
/** Pagination de l'API Storage et taille des lots de suppression. */
const PAGE_SIZE = 100;
/** Port du relais de développement sans authentification (Inbucket
 *  `supabase-mail:2500`) : le seul régime où `SMTP_USER`/`SMTP_PASS` absents
 *  n'échouent pas fermés (motif gift-list-invite). */
const DEV_SMTP_PORT = 2500;
/** Fenêtre de l'alerte J-7 : même borne que le wrapper 0168. */
const REMINDER_WINDOW_DAYS = 7;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class HouseholdDeleteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

const cronSchema = z.object({
  action: z.enum(['reminder', 'purge-medias']),
});

const foyerSchema = z.object({
  mode: z.literal('foyer'),
  householdId: z.string().trim().min(1).max(128),
});

const compteSchema = z.object({
  mode: z.literal('compte'),
});

const userSchema = z.discriminatedUnion('mode', [foyerSchema, compteSchema]);

type FoyerBody = z.infer<typeof foyerSchema>;
type CompteBody = z.infer<typeof compteSchema>;
type CronBody = z.infer<typeof cronSchema>;

/**
 * Le panneau admin existant envoie `{ householdId }` sans discriminant :
 * le mode 'foyer' est injecté comme défaut de compatibilité (D-10/RGDP-07).
 */
async function parseBody(request: Request): Promise<FoyerBody | CompteBody | CronBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HouseholdDeleteError(400, 'Corps de requête JSON invalide.');
  }
  if (
    raw != null && typeof raw === 'object' && !Array.isArray(raw) &&
    !('mode' in raw) && !('action' in raw) && 'householdId' in raw
  ) {
    raw = { ...raw, mode: 'foyer' };
  }
  const cron = cronSchema.safeParse(raw);
  if (cron.success) return cron.data;
  const user = userSchema.safeParse(raw);
  if (user.success) return user.data;
  throw new HouseholdDeleteError(400, 'Corps de requête invalide.');
}

/** L'appelant est-il administrateur du foyer visé ? */
async function assertAdmin(admin: AdminClient, userId: string, householdId: string): Promise<void> {
  const { data, error } = await admin
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new HouseholdDeleteError(500, 'Opération impossible.');
  if (!data || (data as { role?: string }).role !== 'admin') {
    throw new HouseholdDeleteError(403, 'Seul un administrateur du foyer peut le supprimer.');
  }
}

/** Traduit une erreur PostgreSQL en réponse HTTP lisible. */
function translateRpcError(error: { code?: string; message: string }): HouseholdDeleteError {
  const message = error.message ?? '';
  // Les motifs sont posés en base (migrations 0074 et 0167) : la base fait foi.
  if (message.includes('réservée aux administrateurs')) {
    return new HouseholdDeleteError(403, 'Seul un administrateur du foyer peut le supprimer.');
  }
  if (message.includes('foyer introuvable')) return new HouseholdDeleteError(404, 'Ce foyer est introuvable.');
  if (message.includes('session requise')) return new HouseholdDeleteError(401, 'Connectez-vous pour continuer.');
  if (message.includes('ne peut agir que sur sa propre demande')) {
    return new HouseholdDeleteError(403, 'Vous ne pouvez agir que sur votre propre demande.');
  }
  if (message.includes('profil introuvable') || message.includes('membre introuvable')) {
    return new HouseholdDeleteError(404, 'Votre compte est introuvable.');
  }
  if (message.includes('aucune demande à annuler') || message.includes('aucune demande active')) {
    return new HouseholdDeleteError(404, 'Aucune demande de suppression à annuler.');
  }
  console.error('household-delete: erreur RPC', { code: error.code, message });
  return new HouseholdDeleteError(500, 'Opération impossible.');
}

/**
 * Tous les chemins d'objets sous un préfixe, par parcours récursif.
 * Une entrée est un dossier si et seulement si lister dessous renvoie
 * quelque chose : aucun heuristique sur le nom ou les métadonnées.
 */
async function listHouseholdObjects(admin: AdminClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(folder: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw new HouseholdDeleteError(500, 'Inventaire des fichiers impossible.');
      const entries = data ?? [];
      for (const entry of entries) {
        const child = folder ? `${folder}/${entry.name}` : entry.name;
        const { data: sub } = await admin.storage.from(bucket).list(child, { limit: 1 });
        if (sub && sub.length > 0) await walk(child);
        else paths.push(child);
      }
      if (entries.length < PAGE_SIZE) return;
      offset += PAGE_SIZE;
    }
  }

  await walk(prefix);
  return paths;
}

// ---------------------------------------------------------------------------
// Mode 'foyer' — parcours inchangé (migration 0074)
// ---------------------------------------------------------------------------

async function handleFoyer(admin: AdminClient, userId: string, body: FoyerBody) {
  await assertAdmin(admin, userId, body.householdId);

  const { data, error } = await admin.rpc('delete_household', {
    p_actor_id: userId,
    p_household_id: body.householdId,
  });
  if (error) throw translateRpcError(error);
  const deleted = (data ?? {}) as { household_id?: string; expenses?: number };

  // Objets recensés AVANT la suppression DB (lecture seule), effacés après :
  // un échec ici laisse des orphelins invisibles, jamais des lignes cassées.
  const pathsByBucket = new Map<string, string[]>();
  for (const bucket of HOUSEHOLD_BUCKETS) {
    pathsByBucket.set(bucket, await listHouseholdObjects(admin, bucket, body.householdId));
  }
  let storageObjects = 0;
  let partial = false;
  for (const [bucket, paths] of pathsByBucket) {
    for (let at = 0; at < paths.length; at += PAGE_SIZE) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths.slice(at, at + PAGE_SIZE));
      if (removeError) {
        console.error('household-delete: nettoyage Storage partiel', { bucket, message: removeError.message });
        partial = true;
      } else {
        storageObjects += Math.min(PAGE_SIZE, paths.length - at);
      }
    }
  }

  return json({
    household_id: deleted.household_id ?? body.householdId,
    expenses: deleted.expenses ?? 0,
    storage_objects: storageObjects,
    storage_cleanup: partial ? 'partial' : 'ok',
  });
}

// ---------------------------------------------------------------------------
// E-mail (RGDP-02/03) — helpers communs au mode 'compte' et à l'alerte J-7
// ---------------------------------------------------------------------------

/** Anti-injection d'en-têtes (motif gift-list-invite : stripMailBreaks). */
function stripMailBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  adminEmail: string;
  senderName?: string;
}

/** Lecture SMTP à échec fermé AVANT toute tentative (motif gift-list-invite
 *  650-680). Les valeurs ne sont ni journalisées ni renvoyées au client. */
function readSmtp(): SmtpConfig {
  const host = Deno.env.get('SMTP_HOST');
  const portRaw = Deno.env.get('SMTP_PORT');
  const adminEmail = Deno.env.get('SMTP_ADMIN_EMAIL');
  if (!host || !portRaw || !adminEmail) {
    throw new HouseholdDeleteError(500, 'Envoi d’e-mail indisponible : relais SMTP non configuré.');
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new HouseholdDeleteError(500, 'Envoi d’e-mail indisponible : port du relais SMTP invalide.');
  }
  const user = Deno.env.get('SMTP_USER') || undefined;
  const pass = Deno.env.get('SMTP_PASS') || undefined;
  // Régime sans authentification : UNIQUEMENT le relais de développement
  // (Inbucket :2500). Partout ailleurs, des identifiants absents sont un
  // refus net — jamais d'envoi anonyme vers un relais de production.
  if ((!user || !pass) && port !== DEV_SMTP_PORT) {
    throw new HouseholdDeleteError(500, 'Envoi d’e-mail indisponible : authentification du relais SMTP absente.');
  }
  const senderName = Deno.env.get('SMTP_SENDER_NAME') || undefined;
  return { host, port, user, pass, adminEmail, senderName };
}

/** Origine de l'application pour le lien d'annulation (D-05) : `SITE_URL`
 *  pointe vers le frontend par convention (AGENTS §8.4). Le serveur ne
 *  devine JAMAIS l'hôte, et le lien ne traverse jamais /auth/v1/*. */
function readAppOrigin(): string {
  const siteUrl = Deno.env.get('SITE_URL');
  if (!siteUrl) {
    throw new HouseholdDeleteError(500, 'Lien d’annulation indisponible : origine de l’application non configurée.');
  }
  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    throw new HouseholdDeleteError(500, 'Lien d’annulation indisponible : origine de l’application invalide.');
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
    throw new HouseholdDeleteError(500, 'Lien d’annulation indisponible : origine de l’application invalide.');
  }
  return origin.origin;
}

/** Transport nodemailer : `secure` dérive du port (465 → TLS implicite),
 *  jamais d'une coercition de chaîne ; `auth` OMISE en régime dev, jamais
 *  vide (motif gift-list-invite 794-800). */
function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.port === 587 ? { requireTLS: true } : {}),
    ...(config.user ? { auth: { user: config.user, pass: config.pass ?? '' } } : {}),
  });
}

async function sendMail(config: SmtpConfig, message: nodemailer.SendMailOptions): Promise<void> {
  const senderName = config.senderName?.trim() ? stripMailBreaks(config.senderName) : undefined;
  try {
    await buildTransport(config).sendMail({
      from: senderName ? `"${senderName}" <${config.adminEmail}>` : config.adminEmail,
      ...message,
    });
  } catch (sendError) {
    console.error('household-delete: envoi SMTP refusé', {
      message: sendError instanceof Error ? sendError.message : String(sendError),
    });
    throw new HouseholdDeleteError(500, 'Envoi du mail impossible pour le moment.');
  }
}

// ---------------------------------------------------------------------------
// Mode 'compte' (RGPD) — RPC 0167 → signOut global → e-mail de confirmation
// ---------------------------------------------------------------------------

/** JWT de session de l'appelant (sonde F1 : le ctx ne l'expose pas, le header
 *  `Authorization` le porte — voir doc-comment SONDE F1). */
function readBearerJwt(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new HouseholdDeleteError(401, 'Connectez-vous pour continuer.');
  return match[1].trim();
}

async function handleCompte(request: Request, ctx: { supabaseAdmin: AdminClient; userId: string; email?: string }) {
  const admin = ctx.supabaseAdmin;

  // 1. Le RPC 0167 fait tout (instantané D-04 + déshumanisation D-01/02/03 +
  //    demande D-06) DANS UNE SEULE transaction, et ne laisse agir que le
  //    propriétaire du compte (42501). La base fait foi.
  const { data: requestId, error: rpcError } = await admin.rpc('request_account_deletion', {
    p_user_id: ctx.userId,
  });
  if (rpcError) throw translateRpcError(rpcError);
  if (typeof requestId !== 'string' || requestId === '') {
    throw new HouseholdDeleteError(500, 'Opération impossible.');
  }

  // 2. Kill IMMÉDIAT des sessions (RGDP-01) — voir doc-comment SONDE F1.
  //    Un échec ici n'annule pas la demande (déjà commitée) : il est
  //    consigné honnêtement dans la réponse, jamais muet.
  let sessionsRevoked = false;
  try {
    const jwt = readBearerJwt(request);
    const { error: signOutError } = await admin.auth.signOut(jwt, { scope: 'global' });
    if (!signOutError) sessionsRevoked = true;
    else console.error('household-delete: signOut global refusé', { message: signOutError.message });
  } catch (signOutUnknown) {
    console.error('household-delete: signOut global impossible', {
      message: signOutUnknown instanceof Error ? signOutUnknown.message : String(signOutUnknown),
    });
  }

  // 3. E-mail de confirmation avec lien d'annulation vers une page de l'APP
  //    (D-05 : le lien ne crée jamais de session — /parametres/donnees est
  //    une route React authentifiée). Si l'e-mail échoue, la demande reste
  //    enregistrée : on répond `email_sent: false` plutôt qu'un 500 qui
  //    ferait croire à un échec de la demande elle-même.
  let emailSent = false;
  let emailUnavailable: string | null = null;
  try {
    const config = readSmtp();
    const origin = readAppOrigin();
    const recipient = ctx.email?.trim();
    if (!recipient) {
      throw new HouseholdDeleteError(500, 'Envoi d’e-mail indisponible : adresse du compte introuvable.');
    }
    const cancelLink = `${origin}/parametres/donnees?annuler=${encodeURIComponent(requestId)}`;
    await sendMail(config, {
      to: recipient,
      subject: 'Votre demande de suppression de compte',
      text: [
        'Votre demande de suppression de compte a bien été enregistrée.',
        'Vos données personnelles seront supprimées définitivement dans 30 jours.',
        'Vous avez changé d’avis ? Reconnectez-vous puis ouvrez ce lien :',
        cancelLink,
        'Ce lien ne connecte aucune session : il ouvre simplement la page d’annulation de l’application.',
      ].join('\n'),
    });
    emailSent = true;
  } catch (emailError) {
    emailUnavailable = emailError instanceof Error ? emailError.message : String(emailError);
    if (!(emailError instanceof HouseholdDeleteError)) {
      console.error('household-delete: e-mail de confirmation impossible', { message: emailUnavailable });
    }
  }

  return json({
    mode: 'compte' as const,
    request_id: requestId,
    sessions_revoked: sessionsRevoked,
    email_sent: emailSent,
    ...(emailUnavailable ? { email_error: emailUnavailable } : {}),
  });
}

// ---------------------------------------------------------------------------
// Actions cron (0168) — secret UNIQUEMENT, aucune donnée dans le corps
// ---------------------------------------------------------------------------

/** Alerte J-7 (RGDP-03) : le wrapper 0168 a déjà posé `rappel_envoye` et le
 *  statut `rappellee` DANS sa transaction, avant de POSTer. L'Edge relit
 *  elle-même les demandes récemment signalées (fenêtre de 24 h : même si
 *  l'action était rejouée, aucun doublon d'e-mail à un rappel déjà envoyé). */
async function handleReminder(admin: AdminClient): Promise<Response> {
  const { data: requests, error } = await admin
    .from('account_deletion_requests')
    .select('id, user_id, purge_due_at')
    .eq('rappel_envoye', true)
    .eq('status', 'rappellee')
    .lte('purge_due_at', new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 3600 * 1000).toISOString())
    .gte('updated_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if (error) {
    console.error('household-delete: lecture des demandes à rappeler impossible', { code: error.code });
    throw new HouseholdDeleteError(500, 'Opération impossible.');
  }
  const rows = (requests ?? []) as { id: string; user_id: string; purge_due_at: string }[];
  if (rows.length === 0) {
    return json({ action: 'reminder' as const, alerted: 0, sent: 0, failed: 0 });
  }

  const config = readSmtp();
  const dueDate = (value: string) => (value ? String(value).slice(0, 10) : 'prochainement');
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', row.user_id)
      .maybeSingle();
    const email = (profile as { email?: string } | null)?.email?.trim();
    if (!email) {
      console.error('household-delete: alerte J-7 sans destinataire', { request_id: row.id });
      failed += 1;
      continue;
    }
    try {
      await sendMail(config, {
        to: email,
        subject: 'Suppression définitive de votre compte dans 7 jours',
        text: [
          'Sa demande de suppression de compte sera exécutée définitivement le ' +
            dueDate(row.purge_due_at) + '.',
          'Vous avez encore 7 jours pour changer d’avis : reconnectez-vous puis ouvrez la page',
          '« Mes données (RGPD) » de l’application pour annuler la demande.',
        ].join('\n'),
      });
      sent += 1;
    } catch (reminderError) {
      console.error('household-delete: alerte J-7 non envoyée', {
        request_id: row.id,
        message: reminderError instanceof Error ? reminderError.message : String(reminderError),
      });
      failed += 1;
    }
  }
  return json({ action: 'reminder' as const, alerted: rows.length, sent, failed });
}

/**
 * Instruction de suppression Storage (D-07/F6) : l'Edge ne supprime QUE les
 * chemins présents au manifest (public.deletion_media_claim — wrapper
 * PostgREST du manifest privé 0168), les marque `purged = true` au fur et à
 * mesure, et répond le contrat honnête 'ok' | 'partial'. Le manifest ne
 * porte pas de bucket : le chemin est essayé dans chaque bucket privé du
 * foyer (un objet vit dans exactement l'un des deux).
 */
async function handlePurgeMedias(admin: AdminClient): Promise<Response> {
  const { data: claim, error: claimError } = await admin.rpc('deletion_media_claim', {
    p_limit: PAGE_SIZE * 10,
  });
  if (claimError) throw translateRpcError(claimError);
  const rows = ((claim as { rows?: { id: string; storage_path: string }[] } ?? {}).rows ?? [])
    .filter((row) => typeof row?.id === 'string' && typeof row?.storage_path === 'string' && row.storage_path !== '');

  let deleted = 0;
  let failed = 0;
  const purgedIds: string[] = [];
  for (const row of rows) {
    let removed = false;
    for (const bucket of HOUSEHOLD_BUCKETS) {
      const { error: removeError } = await admin.storage.from(bucket).remove([row.storage_path]);
      if (!removeError) {
        removed = true;
        break;
      }
    }
    if (removed) {
      purgedIds.push(row.id);
      deleted += 1;
    } else {
      failed += 1;
      console.error('household-delete: chemin du manifest non supprimé', { path: row.storage_path });
    }
  }
  if (purgedIds.length > 0) {
    const { error: markError } = await admin.rpc('deletion_media_mark_purged', { p_ids: purgedIds });
    if (markError) {
      console.error('household-delete: marquage purged impossible', { code: markError.code });
      failed += purgedIds.length;
      deleted -= purgedIds.length;
    }
  }
  return json({
    action: 'purge-medias' as const,
    storage_objects: deleted,
    storage_cleanup: failed > 0 ? 'partial' : 'ok',
  });
}

async function handleCron(admin: AdminClient, body: CronBody): Promise<Response> {
  if (body.action === 'reminder') return handleReminder(admin);
  return handlePurgeMedias(admin);
}

// ---------------------------------------------------------------------------
// Point d'entrée — dispatch AVANT les gardes de session (motif recipe-invite :
// une action `secret` n'est ni un mode foyer ni un mode compte)
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: ['user', 'publishable', 'secret'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const body = await parseBody(request);

      // Actions cron : clé secrète UNIQUEMENT (T-27-10). Un JWT utilisateur
      // portant ce corps est refusé avant tout code métier.
      if ('action' in body) {
        if (ctx.authMode !== 'secret') {
          return json({ error: 'Action réservée au serveur.' }, 403);
        }
        return await handleCron(ctx.supabaseAdmin, body);
      }

      // Modes 'foyer' / 'compte' : une session `user` réelle, sans exception
      // (T-27-09 : un publishable anonyme ne peut pas tuer un foyer ni un
      // compte ; le RPC 0167 revérifie en base).
      const userId = ctx.userClaims?.id;
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour continuer.' }, 401);
      }

      if (body.mode === 'compte') {
        return await handleCompte(request, {
          supabaseAdmin: ctx.supabaseAdmin,
          userId,
          email: ctx.userClaims?.email,
        });
      }
      return await handleFoyer(ctx.supabaseAdmin, userId, body);
    } catch (error) {
      if (error instanceof HouseholdDeleteError) return json({ error: error.message }, error.status);

      console.error('household-delete: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
