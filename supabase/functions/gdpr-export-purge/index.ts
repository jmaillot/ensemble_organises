/**
 * Edge Function `gdpr-export-purge`.
 *
 * Point d'entrée : `POST /functions/v1/gdpr-export-purge`
 * Corps : `{ action: 'purge' }` (envoyé par `private.post_gdpr_export_http`,
 * migration 0158 — job cron quotidien `eo-gdpr-export-purge`, 4h27).
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['secret']` — UNIQUEMENT la clé secrète `service_role`, lue dans
 *   Vault par `post_gdpr_export_http`. Un navigateur portant un JWT
 *   utilisateur est refusé AVANT tout code métier : cette fonction supprime
 *   les archives de TOUS les membres, elle n'a donc aucun sens pour une
 *   session (T-26-14). C'est la forme du mode cron de `push-notify`.
 *
 * POURQUOI CETTE FONCTION EXISTE (RGEX-04)
 *   La table SQL seule ne peut pas tuer les octets : un DELETE sur
 *   `storage.objects` laisse les fichiers sur disque (Pitfall 5 de la
 *   recherche). La purge traverse donc l'API Storage — `.remove()` par lots —
 *   et consigne chaque chemin traité dans `public.gdpr_export_purge_log`,
 *   preuve RGEX-04 lisible par la base et l'opérateur (§2.7F : un passage de
 *   purge sans preuve écrite est un succès muet, donc un échec inexpliqué).
 *
 * CANDIDATS (T-26-13)
 *   Uniquement les jobs TERMINAUX (`pret` ou `echec`) dont `expires_at` est
 *   dépassé (7 jours, défaut posé en 0158). JAMAIS un job `en_attente` /
 *   `en_cours` : un export en cours — et son lien signé vivant (≤ 24 h) —
 *   n'est jamais purgé.
 *
 * CHEMINS VISÉS
 *   Pour chaque job : le préfixe de staging `<uid>/<job>/` (fragments JSON,
 *   manifeste, médias copiés) ET le zip `<uid>/<job>.zip` (via `storage_path`
 *   — le chemin scellé de 0158, jamais une URL). Le listage est paginé et sa
 *   profondeur bornée (motif household-delete).
 *
 * PLAFOND DE PASSAGE
 *   50 jobs par passage au maximum — le cron quotidien du lendemain finit le
 *   reste. Aucune boucle infinie en une fois, aucun débordement du budget de
 *   60 s du worker (150 Mo / 60 s, bootstrap épinglé).
 *
 * IDEMPOTENCE DE L'AUDIT
 *   Un chemin déjà présent dans `gdpr_export_purge_log` avec `removed=true`
 *   est SAUTÉ au passage suivant (et non re-loggé) : les reprises ne doublent
 *   pas l'audit. La ligne existante EST la preuve — la redire n'apporte rien
 *   et fausserait les comptages. Un job entièrement purgé est CLÔTURÉ : sa
 *   ligne `gdpr_export_jobs` est supprimée (voir CLÔTURE DU JOB ci-dessous),
 *   l'audit reste en base (job_id libéré par `on delete set null`, 0158) —
 *   la preuve RGEX-04 survit à la ligne de job.
 *
 * CLÔTURE DU JOB (CR-01)
 *   Sans suppression de la ligne, un job déjà purgé réapparaît à chaque
 *   passage en tête de la liste de candidats (tri ascendant) et consomme à
 *   vie une place du plafond de 50 : au 51ᵉ export expiré, la purge cesse
 *   définitivement de fonctionner (RGEX-04 violée en silence). Le passage
 *   supprime donc la ligne dès qu'il ne reste AUCUN chemin à traiter pour le
 *   job — rien trouvé en Storage, tout déjà loggé `removed=true`, ou
 *   suppression intégralement réussie dans CE passage. Un échec partiel
 *   garde la ligne : la reprise du lendemain finit le travail puis clôture.
 *
 * ÉCHEC PARTIEL (contrat 'partial' de household-delete)
 *   L'échec d'un lot de suppression ne stoppe pas la boucle : les chemins du
 *   lot sont loggés `removed=false` avec l'erreur, le drapeau `partial`
 *   remonte dans la réponse ET dans l'audit. L'échec TOTAL de connexion à
 *   Storage est une erreur 500 explicite — le cron du lendemain retente, il
 *   n'y a pas de code de retry local (même philosophie que `gdpr-export-run`).
 *
 * CONTRAT DE RÉPONSE
 *   -> 200 { purged_jobs, removed_count, partial: boolean }
 *      `purged_jobs` compte les jobs CLÔTURÉS (ligne supprimée — CR-01).
 *   -> 500 { error } — Storage injoignable, le cron retente demain
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`.
 */

import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';

/** Erreur applicative : `fatal` distingue l'échec définitif du transitoire. */
class GdprPurgeError extends Error {
  readonly fatal: boolean;
  constructor(message: string, fatal = true) {
    super(message);
    this.fatal = fatal;
  }
}

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

const bodySchema = z.object({ action: z.literal('purge') });

const EXPORT_BUCKET = 'gdpr-exports';
/** Pagination de l'API Storage et taille des lots de suppression. */
const PAGE_SIZE = 100;
/** Plafond de jobs traités par passage — le cron du lendemain finit le reste. */
const JOB_CAP = 50;
/** Profondeur maximale du listage récursif du staging (bornage anti-boucle). */
const MAX_DEPTH = 12;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

type Candidate = { id: string; user_id: string; storage_path: string | null };

/**
 * Tous les chemins d'objets sous un préfixe, par parcours récursif paginé
 * (motif household-delete : une entrée est un dossier ssi lister dessous
 * renvoie quelque chose). La profondeur est bornée : un dépassement est
 * signalé (§2.7F) plutôt que parcouru en silence.
 */
async function listAll(admin: AdminClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(folder: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      // Anomalie de structure de staging, pas un cas nominal : signalée,
      // jamais avalée — les octets restants seraient sinon invisibles.
      console.error('gdpr-export-purge: profondeur de listage dépassée', { prefix: folder });
      throw new GdprPurgeError(`profondeur de listage dépassée sous ${folder}`, false);
    }
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw new GdprPurgeError(`listage impossible sous ${folder} : ${error.message}`, false);
      const entries = data ?? [];
      for (const entry of entries) {
        const child = folder ? `${folder}/${entry.name}` : entry.name;
        const { data: sub } = await admin.storage.from(bucket).list(child, { limit: 1 });
        if (sub && sub.length > 0) await walk(child, depth + 1);
        else paths.push(child);
      }
      if (entries.length < PAGE_SIZE) return;
      offset += PAGE_SIZE;
    }
  }
  await walk(prefix, 0);
  return paths;
}

/**
 * Les candidats du passage : statut terminal + expires_at dépassé, jamais un
 * job actif. Ordre d'ancienneté, plafonnés — le cron du lendemain finit.
 */
async function fetchCandidates(admin: AdminClient): Promise<Candidate[]> {
  const { data, error } = await admin
    .from('gdpr_export_jobs')
    .select('id, user_id, storage_path')
    .in('status', ['pret', 'echec'])
    .lt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(JOB_CAP);
  if (error) throw new GdprPurgeError(`lecture des candidats impossible : ${error.message}`);
  return (data ?? []) as Candidate[];
}

/**
 * Chemins déjà prouvés supprimés pour ce job — SAUTÉS au passage suivant
 * (voir IDEMPOTENCE DE L'AUDIT en tête de fichier).
 */
async function alreadyRemoved(admin: AdminClient, jobId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('gdpr_export_purge_log')
    .select('storage_path')
    .eq('job_id', jobId)
    .eq('removed', true);
  if (error) throw new GdprPurgeError(`lecture de l'audit impossible : ${error.message}`);
  return new Set(((data ?? []) as { storage_path: string }[]).map((r) => r.storage_path));
}

type AuditRow = {
  job_id: string;
  storage_path: string;
  removed: boolean;
  error: string | null;
};

/** Supprime un lot et produit les lignes d'audit correspondantes. */
async function removeBatch(
  admin: AdminClient,
  jobId: string,
  paths: string[],
): Promise<{ audit: AuditRow[]; removed: number }> {
  const { error } = await admin.storage.from(EXPORT_BUCKET).remove(paths);
  const audit: AuditRow[] = paths.map((p) => ({
    job_id: jobId,
    storage_path: p,
    removed: !error,
    error: error ? error.message.slice(0, 500) : null,
  }));
  if (error) {
    // Échec du lot : consigné chemin par chemin, la boucle continue
    // (contrat 'partial' de household-delete — jamais muet, §2.7F).
    console.error('gdpr-export-purge: suppression partielle', { job_id: jobId, message: error.message });
  }
  return { audit, removed: error ? 0 : paths.length };
}

/**
 * Insère les lignes d'audit. Une écriture d'audit qui échoue est FATALE :
 * la preuve RGEX-04 en base vaut plus que les octets supprimés — un passage
 * sans preuve écrite est un succès muet (§2.7F).
 */
async function writeAudit(admin: AdminClient, rows: AuditRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from('gdpr_export_purge_log').insert(rows);
  if (error) throw new GdprPurgeError(`écriture de l'audit impossible : ${error.message}`);
}

async function handlePurge(admin: AdminClient): Promise<Response> {
  // Étape 1 : un candidat existe-t-il ? Le listage Storage n'est touché que
  // dans ce cas — un passage sans candidat ne fait aucune requête Storage.
  const candidates = await fetchCandidates(admin);
  if (candidates.length === 0) {
    return json({ purged_jobs: 0, removed_count: 0, partial: false });
  }

  // Étape 2 : inventaire des chemins (staging + zip) AVANT toute suppression.
  const targets: { job: Candidate; paths: string[] }[] = [];
  for (const job of candidates) {
    const prefix = `${job.user_id}/${job.id}`;
    const paths = await listAll(admin, EXPORT_BUCKET, prefix);
    if (job.storage_path && job.storage_path.startsWith(`${job.user_id}/`) && job.storage_path.endsWith('.zip')) {
      // Le zip vit HORS du répertoire staging (<uid>/<job>.zip) : visé via
      // storage_path, jamais re-listé. Une valeur hors du chemin scellé
      // (T-26-09) est ignorée — le listage du préfixe la couvre déjà.
      paths.push(job.storage_path);
    }
    const done = await alreadyRemoved(admin, job.id);
    const remaining = paths.filter((p) => !done.has(p));
    targets.push({ job, paths: remaining });
  }

  // Étape 3 : suppression par lots + audit, job par job. L'échec d'un lot ne
  // stoppe pas la boucle (partial), l'échec d'audit est fatal (§2.7F). Un job
  // dont TOUS les chemins sont traités est clôturé : sa ligne est supprimée
  // (CR-01 — sinon elle réoccupe à vie une place du plafond de 50 candidats).
  let removedCount = 0;
  let partial = false;
  let purgedJobs = 0;
  for (const { job, paths } of targets) {
    if (paths.length > 0) {
      let jobPartial = false;
      for (let at = 0; at < paths.length; at += PAGE_SIZE) {
        const { audit, removed } = await removeBatch(admin, job.id, paths.slice(at, at + PAGE_SIZE));
        await writeAudit(admin, audit);
        removedCount += removed;
        if (removed < audit.length) {
          jobPartial = true;
          partial = true;
        }
      }
      if (jobPartial) continue;
    }
    // Aucun chemin restant (déjà purgé, jamais écrit, ou suppression
    // intégralement réussie ci-dessus) : la ligne est supprimée. L'audit
    // survit (`on delete set null` sur job_id, 0158).
    const { error } = await admin.from('gdpr_export_jobs').delete().eq('id', job.id);
    if (error) throw new GdprPurgeError(`clôture du job purgé impossible : ${error.message}`);
    purgedJobs += 1;
  }

  return json({
    purged_jobs: purgedJobs,
    removed_count: removedCount,
    partial,
  });
}

Deno.serve(
  withSupabase({ auth: ['secret'] }, async (request, ctx) => {
    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'Corps de requête JSON invalide.' }, 400);
      }
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return json({ error: 'Action inconnue : seul « purge » est accepté.' }, 400);
      }
      return await handlePurge(ctx.supabaseAdmin);
    } catch (error) {
      if (error instanceof GdprPurgeError && !error.fatal) {
        // Transitoire (Storage injoignable, listage en échec) : erreur 500
        // explicite — le cron quotidien du lendemain retente, aucun code de
        // retry local (même philosophie que gdpr-export-run).
        console.error('gdpr-export-purge: passage interrompu (reprise par cron)', {
          message: error.message,
        });
        return json({ error: error.message }, 500);
      }
      console.error('gdpr-export-purge: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Purge momentanément impossible.' }, 500);
    }
  }),
);
