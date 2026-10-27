/**
 * Edge Function `gdpr-export-run`.
 *
 * Point d'entrée : `POST /functions/v1/gdpr-export-run`
 * Corps : `{ action: 'run' }` (envoyé par `private.post_gdpr_export_http`,
 * migration 0158 — éveil immédiat au déclenchement + cron-minute).
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['secret']` — UNIQUEMENT la clé secrète `service_role`, lue dans
 *   Vault par `post_gdpr_export_http`. Un navigateur portant un JWT
 *   utilisateur est refusé AVANT tout code métier : cette fonction traite des
 *   jobs de TOUS les membres, elle n'a donc aucun sens pour une session
 *   (T-26-08). C'est la forme du mode cron de `push-notify`.
 *
 * LE JOB MULTIPASSE (RGEX-02)
 *   Le worker Edge est borné (150 Mo / 60 s, bootstrap épinglé du snapshot) :
 *   une passe accomplit un travail borné puis RETOURNE — le cron-minute
 *   `eo-gdpr-export-run` redrive jusqu'à achèvement. La progression vit sur la
 *   ligne `public.gdpr_export_jobs` (jamais en mémoire du worker) :
 *     * extraction : `private.gdpr_export_extract_batch(job, 500)` remet un
 *       lot et avance transactionnellement le curseur (cursor_module /
 *       cursor_offset). Toute lecture de donnée passe par ce RPC — le client
 *       admin transporte, la borne RGEX-03 reste en SQL (T-26-11).
 *     * médias : chaque chemin retourné (`bucket/chemin`) est copié
 *       serveur-à-serveur vers le staging
 *       `gdpr-exports/<uid>/<job>/medias/<bucket>/<chemin>` par
 *       `copy(..., { destinationBucket })` — VERDICT A3 du spike (26-01) : OK,
 *       zéro mémoire. Repli documenté si la storage-api refusait : download
 *       stream + upload stream (mémoire ≈ 1 objet), à brancher dans
 *       `copyMediaToStaging` seul.
 *     * manifeste : les chemins attendus sont aussi consignés dans
 *       `<uid>/<job>/manifest/<module>-<offset>.txt` (fragment déterministe
 *       par lot). La passe d'assemblage vérifie la couverture manifeste ↔
 *       staging et recopie ce qui manque : une passe tuée entre le RPC
 *       (curseur déjà avancé) et les copies ne perd donc aucun média.
 *     * fragments JSON : chaque lot est posé dans
 *       `<uid>/<job>/parts/<module>-<batch_start_offset>.json` — offset de
 *       DÉBUT du lot (0165, HR-02), nom déterministe, un crash relance le
 *       même upload (upsert), jamais de doublon.
 *     * assemblage (staging_ready=true) : lister le staging, écrire
 *       `donnees-rgpd.json` (DEFLATE, fragments concaténés) puis chaque média
 *       (STORE — déjà compressés) dans UN flux fflate `Zip`, poussé
 *       DIRECTEMENT dans `upload(...)` — VERDICTS A1 (upload de flux : OK) et
 *       A2 (fflate Deno : OK). Aucune passe ne charge l'archive en mémoire.
 *
 * IDEMPOTENCE DE L'ASSEMBLAGE
 *   La passe d'assemblage est relançable from-scratch : elle reconstruit le
 *   ZIP en entier (upsert) depuis un staging intègre. Ce choix (une passe
 *   unique redémarrable) est retenu contre un assemblage par parts fusionnées
 *   plus tard parce que le central-directory d'un ZIP exige un unique écrivain
 *   séquentiel : reprendre « où on s'était arrêté » suppose de fiabiliser un
 *   offset d'écriture, ce qui recrée le problème de mémoire qu'on évite. Un
 *   staging de centaines de Mo se relit en un flux d'environ une minute, et le
 *   cron redrive de toute façon chaque minute.
 *
 * BUDGET DE PASSE
 *   La passe surveille son temps (~45 s) et rend la main entre deux étapes —
 *   le lease (`pass_started_at`, grâce 5 min posée en 0158) empêche deux
 *   passes en parallèle ; le cron reprend après la grâce. Le plafond de passes
 *   (60) bascule en `echec` lisible : retenu au lieu du ~10 esquisse du plan
 *   parce que 22 modules minimum + lots de 500 lignes + médias + assemblage
 *   dépassent honnêtement 10 passes pour un vrai export — 60 passes ≈ 1 h
 *   maximum, la boucle reste bornée (T-26-10).
 *
 * ÉCHEC HONNÊTE (D-02)
 *   Fatal (RPC en échec, plafond de passes) → status='echec' + `error`
 *   français lisible. Transitoire (storage indisponible) → la ligne reste
 *   `en_cours`, le lease expire, le cron reprend. Un crash process est couvert
 *   par le lease. Aucun job fantôme, aucune boucle muette.
 *
 * ZIP-SLIP (T-26-09)
 *   Les noms d'entrée du ZIP sont construits uniquement depuis des identifiants
 *   serveur (uid, job id, noms de modules en dur, chemins de bucket) — jamais
 *   depuis une chaîne saisie par un utilisateur.
 *
 * CONTRAT DE RÉPONSE
 *   -> 200 { processed: false }                    — rien à faire, le cron rappellera
 *   -> 200 { processed: true, job_id, phase, ... } — résumé de la passe
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`.
 */

import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
import { Zip, ZipDeflate, ZipPassThrough } from 'npm:fflate@0.8.3';

/** Erreur applicative : `fatal` distingue l'échec définitif du transitoire. */
class GdprExportError extends Error {
  readonly fatal: boolean;
  constructor(message: string, fatal = true) {
    super(message);
    this.fatal = fatal;
  }
}

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

const bodySchema = z.object({ action: z.literal('run') });

/** Buckets sources de médias (0010) — toute copie vers le staging vient d'ici. */
const SOURCE_BUCKETS = ['household-media', 'household-avatars'] as const;
const EXPORT_BUCKET = 'gdpr-exports';

/** Taille d'un lot d'extraction (RPC) et de pagination Storage. */
const BATCH_LIMIT = 500;
const PAGE_SIZE = 100;

/** Budget de passe (rendre la main avant le kill du worker à 60 s). */
const BUDGET_MS = 45_000;
/** Grâce du lease posée en 0158 côté SQL — miroir côté candidature. */
const LEASE_GRACE_MS = 5 * 60 * 1000;
/** Plafond de passes avant `echec` (voir doc-comment BUDGET DE PASSE). */
const PASS_CAP = 60;

/**
 * Ordre nominal des modules — DOIT rester celui du RPC (0161) : l'entrée
 * `donnees-rgpd.json` du ZIP liste les 22 dans cet ordre.
 */
const MODULES = [
  'profiles', 'households', 'household_members', 'tasks', 'events', 'notes',
  'expenses', 'routines', 'shopping_lists', 'posts', 'recipes', 'messages',
  'birthdays', 'pets', 'loyalty_cards', 'places', 'gift_lists', 'contacts',
  'trips', 'pantry_items', 'meal_entries', 'dashboard_widgets',
] as const;

type ExtractBatch = {
  user_id: string;
  module: string;
  rows: Record<string, unknown[]>;
  cursor_module: string | null;
  cursor_offset: number;
  /** Offset de DÉBUT du lot (0165) — nommage et tri déterministes. */
  batch_start_offset: number;
  done: boolean;
  media_paths: string[];
};

type JobRow = {
  id: string;
  user_id: string;
  status: string;
  staging_ready: boolean;
  pass_count: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Remet la ligne du job en échec lisible (D-02 — jamais muet). */
async function failJob(admin: AdminClient, job: JobRow, message: string): Promise<void> {
  await admin
    .from('gdpr_export_jobs')
    .update({ status: 'echec', error: message.slice(0, 500), pass_started_at: null })
    .eq('id', job.id);
}

/**
 * Tous les chemins d'objets sous un préfixe, par parcours récursif paginé
 * (motif household-delete : une entrée est un dossier ssi lister dessous
 * renvoie quelque chose).
 */
async function listAll(admin: AdminClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(folder: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw new GdprExportError(`listage staging impossible : ${error.message}`, false);
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

/**
 * Copie cross-bucket d'un média vers le staging (verdict A3 : OK, zéro
 * mémoire). Le repli documenté du spike (download + upload par flux) se
 * brancherait ICI et nulle part ailleurs, s'il se révélait nécessaire.
 */
async function copyMediaToStaging(
  admin: AdminClient,
  source: string,
  stagingPath: string,
): Promise<'copied' | 'missing'> {
  const slash = source.indexOf('/');
  const bucket = slash === -1 ? '' : source.slice(0, slash);
  const path = slash === -1 ? source : source.slice(slash + 1);
  if (!(SOURCE_BUCKETS as readonly string[]).includes(bucket) || path === '') {
    // Ni bucket connu ni chemin : valeur héritée qui a franchi le filtre SQL —
    // signalée, jamais propagée dans l'archive (T-26-09).
    console.warn('gdpr-export-run: chemin de média hors buckets connus, ignoré', { source });
    return 'missing';
  }
  const { error } = await admin.storage
    .from(bucket)
    .copy(path, stagingPath, { destinationBucket: EXPORT_BUCKET });
  if (error) {
    // Objet source disparu (purge média) : manquant définitif, l'assemblage
    // consigne l'écart au lieu de faire échouer tout l'export.
    console.warn('gdpr-export-run: copie média impossible', { source, message: error.message });
    return 'missing';
  }
  return 'copied';
}

/** Upload d'un fragment texte du staging (fragments JSON, manifeste). */
async function uploadStagingText(admin: AdminClient, path: string, content: string): Promise<void> {
  // Le catalogue mime du bucket est restreint à application/zip (0158) : les
  // fragments internes se déclarent sous ce type — ils ne sont lus que par
  // cette fonction, jamais servis à un client.
  const { error } = await admin.storage.from(EXPORT_BUCKET).upload(path, content, {
    upsert: true,
    contentType: 'application/zip',
  });
  if (error) throw new GdprExportError(`écriture staging impossible (${path}) : ${error.message}`, false);
}

/** Lecture texte d'un objet du staging (fragments de manifeste). */
async function downloadStagingText(admin: AdminClient, path: string): Promise<string> {
  const { data: signed, error } = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(path, 60);
  if (error || !signed) throw new GdprExportError(`signature staging impossible (${path})`, false);
  const response = await fetch(signed.signedUrl);
  if (!response.ok || !response.body) {
    throw new GdprExportError(`lecture staging impossible (${path}) : HTTP ${response.status}`, false);
  }
  return await response.text();
}

/** Flux de téléchargement d'un objet du staging (STORE du ZIP). */
async function downloadStagingStream(
  admin: AdminClient,
  path: string,
): Promise<ReadableStream<Uint8Array>> {
  const { data: signed, error } = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(path, 60);
  if (error || !signed) throw new GdprExportError(`signature staging impossible (${path})`, false);
  const response = await fetch(signed.signedUrl);
  if (!response.ok || !response.body) {
    throw new GdprExportError(`lecture staging impossible (${path}) : HTTP ${response.status}`, false);
  }
  return response.body;
}

/**
 * Claim atomique : UPDATE conditionnel re-vérifié côté PostgreSQL
 * (EvalPlanQual) — deux workers visant la même ligne ne peuvent pas la prendre
 * deux fois, le second re-évalue la clause de lease et repart sans ligne.
 * Aucune fenêtre SELECT→UPDATE.
 */
async function claimJob(admin: AdminClient): Promise<JobRow | null> {
  const grace = new Date(Date.now() - LEASE_GRACE_MS).toISOString();
  const { data: candidate, error: selectError } = await admin
    .from('gdpr_export_jobs')
    .select('id, user_id, status, staging_ready, pass_count')
    .in('status', ['en_attente', 'en_cours'])
    .or(`pass_started_at.is.null,pass_started_at.lt.${grace}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new GdprExportError(`lecture des jobs impossible : ${selectError.message}`);
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await admin
    .from('gdpr_export_jobs')
    .update({
      status: 'en_cours',
      pass_started_at: new Date().toISOString(),
      pass_count: candidate.pass_count + 1,
    })
    .eq('id', candidate.id)
    .in('status', ['en_attente', 'en_cours'])
    .or(`pass_started_at.is.null,pass_started_at.lt.${grace}`)
    .select('id, user_id, status, staging_ready, pass_count')
    .single();
  if (updateError) {
    // Course perdue (aucune ligne re-vérifiée) : pas une erreur, le cron
    // rappellera. Une vraie erreur SQL est fatale.
    if (updateError.code === 'PGRST116') return null;
    throw new GdprExportError(`claim du job impossible : ${updateError.message}`);
  }
  return claimed as JobRow;
}

/** Passe d'EXTRACTION : lots RPC → fragments JSON + manifeste + copies. */
async function runExtractionPass(
  admin: AdminClient,
  job: JobRow,
  deadline: number,
): Promise<{ finished: boolean; batches: number; mediaCopied: number; mediaSkipped: number }> {
  let batches = 0;
  let mediaCopied = 0;
  let mediaSkipped = 0;
  let done = false;

  while (!done) {
    const { data: batch, error } = await admin.rpc('gdpr_export_extract_batch', {
      p_job_id: job.id,
      p_limit: BATCH_LIMIT,
    });
    if (error) throw new GdprExportError(`extraction impossible : ${error.message}`);
    const b = batch as ExtractBatch;

    const hasRows = Object.values(b.rows ?? {}).some((arr) => Array.isArray(arr) && arr.length > 0);
    // Nommé par l'offset de DÉBUT du lot (0165) — l'offset post-avance
    // (`cursor_offset`) produisait des noms dont le tri lexical inversait les
    // fragments dès qu'un module dépasse 999 lignes (HR-02). Repli défensif
    // sur cursor_offset si un RPC antérieur à 0165 répondait sans la clé.
    const batchStart = typeof b.batch_start_offset === 'number' ? b.batch_start_offset : b.cursor_offset;
    const partName = `${b.module}-${batchStart}`;

    if (hasRows) {
      await uploadStagingText(
        admin,
        `${job.user_id}/${job.id}/parts/${partName}.json`,
        JSON.stringify(b.rows ?? {}),
      );
    }
    if (b.media_paths?.length > 0) {
      await uploadStagingText(
        admin,
        `${job.user_id}/${job.id}/manifest/${partName}.txt`,
        b.media_paths.join('\n'),
      );
      // Copies immédiates, non fatales : le manifeste garantit la complétude
      // à l'assemblage (une passe tuée ici est réparée, pas perdue).
      for (const source of b.media_paths) {
        const slash = source.indexOf('/');
        const staging = `${job.user_id}/${job.id}/medias/${source.slice(0, slash)}/${source.slice(slash + 1)}`;
        const result = await copyMediaToStaging(admin, source, staging);
        if (result === 'copied') mediaCopied += 1;
        else mediaSkipped += 1;
      }
    }

    batches += 1;
    done = b.done === true;

    if (!done && Date.now() > deadline) {
      // Budget dépassé : rendre la main — le curseur RPC est déjà avancé.
      return { finished: false, batches, mediaCopied, mediaSkipped };
    }
  }

  // Extraction terminée : le staging est complet, l'assemblage peut partir.
  const { error: readyError } = await admin
    .from('gdpr_export_jobs')
    .update({ staging_ready: true })
    .eq('id', job.id);
  if (readyError) throw new GdprExportError(`bascule staging_ready impossible : ${readyError.message}`);
  return { finished: true, batches, mediaCopied, mediaSkipped };
}

/**
 * Passe d'ASSEMBLAGE : reconstruit le ZIP from-scratch (idempotent, voir
 * doc-comment IDEMPOTENCE DE L'ASSEMBLAGE) et l'upload en flux (verdict A1).
 */
async function runAssemblyPass(
  admin: AdminClient,
  job: JobRow,
  deadline: number,
): Promise<{ mediaCopied: number; mediaSkipped: number }> {
  const root = `${job.user_id}/${job.id}`;
  // SANS slash final : `list(folder)` concatène `${folder}/${entry.name}` — un
  // préfixe « uid/job/ » produirait des chemins « uid/job//parts » que les
  // filtres `includes('/parts/')` ci-dessous ne reconnaîtraient jamais.
  const all = await listAll(admin, EXPORT_BUCKET, root);
  // La passe finale exclut tout *.zip du listing : jamais zipper un artefact
  // partiel (le zip final vit de toute façon hors du répertoire staging).
  const staging = all.filter((p) => !p.endsWith('.zip'));
  const partPaths = staging.filter((p) => p.includes('/parts/'));
  const manifestPaths = staging.filter((p) => p.includes('/manifest/'));
  const mediaStaging = staging.filter((p) => p.includes('/medias/'));

  // Couverture manifeste ↔ staging : les chemins attendus sont-ils copiés ?
  // Format d'un chemin de staging média : <uid>/<job>/medias/<bucket>/<source>.
  const stagedMedia = new Set(mediaStaging.map((p) => p.slice(`${root}/medias/`.length)));
  const expected = new Set<string>();
  let mediaCopied = 0;
  for (const manifestPath of manifestPaths) {
    const content = await downloadStagingText(admin, manifestPath);
    for (const line of content.split('\n')) {
      const source = line.trim();
      if (source === '') continue;
      expected.add(source);
      if (stagedMedia.has(source)) continue;
      if (Date.now() > deadline) return { mediaCopied, mediaSkipped: 0 };
      const result = await copyMediaToStaging(admin, source, `${root}/medias/${source}`);
      if (result === 'copied') {
        stagedMedia.add(source);
        mediaCopied += 1;
      }
    }
  }
  const mediaSkipped = [...expected].filter((s) => !stagedMedia.has(s)).length;

  // ---- ZIP en flux : le callback fflate pousse dans le contrôleur du stream,
  // le stream part DIRECTEMENT dans l'upload (verdict A1) — jamais un buffer
  // complet en mémoire (RGEX-02).
  const encoder = new TextEncoder();
  let zip: Zip;
  const output = new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        if (chunk && chunk.length > 0) controller.enqueue(chunk);
        if (final) controller.close();
      });
    },
  });

  // 1. L'entrée JSON : en-tête + fragments concaténés, un module dans l'ordre
  // nominal (26-SPEC-DECISION.md), `{}` quand aucun fragment n'existe.
  const jsonEntry = new ZipDeflate('donnees-rgpd.json', { level: 6 });
  zip.add(jsonEntry);
  jsonEntry.push(
    encoder.encode(`{"exporte_le":${JSON.stringify(new Date().toISOString())},"modules":{`),
    false,
  );
  const partsByModule = new Map<string, string[]>();
  for (const part of partPaths) {
    const name = part.slice(`${root}/parts/`.length).replace(/\.json$/, '');
    const sep = name.lastIndexOf('-');
    const moduleName = sep === -1 ? name : name.slice(0, sep);
    const list = partsByModule.get(moduleName) ?? [];
    list.push(part);
    partsByModule.set(moduleName, list);
  }
  for (const [index, moduleName] of MODULES.entries()) {
    if (index > 0) jsonEntry.push(encoder.encode(','), false);
    jsonEntry.push(encoder.encode(`${JSON.stringify(moduleName)}:`), false);
    // Tri sur l'ENTIER de l'offset de début (HR-02) : le tri lexical mettrait
    // 'tasks-1000' avant 'tasks-500'. Les noms sont `<module>-<start>` posés
    // par l'extraction ; un suffixe non numérique irait en fin de liste.
    const moduleParts = (partsByModule.get(moduleName) ?? []).sort((a, b) => {
      const off = (p: string) => {
        const suffix = p.slice(p.lastIndexOf('-') + 1).replace(/\.json$/, '');
        const n = parseInt(suffix, 10);
        return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
      };
      return off(a) - off(b);
    });
    if (moduleParts.length === 0) {
      jsonEntry.push(encoder.encode('{}'), false);
      continue;
    }
    // Un module qui déborde un lot produit PLUSIEURS fragments (même objet
    // {table: [...]} par fragment) : enveloppés en tableau — concaténer les
    // objets nus produirait un JSON invalide.
    jsonEntry.push(encoder.encode('['), false);
    for (const [partIndex, part] of moduleParts.entries()) {
      if (partIndex > 0) jsonEntry.push(encoder.encode(','), false);
      const content = await downloadStagingText(admin, part);
      jsonEntry.push(encoder.encode(content.trim() || '{}'), false);
      if (Date.now() > deadline) {
        // Budget : abandon propre — le ZIP est reconstruit from-scratch à la
        // passe suivante (idempotence documentée).
        jsonEntry.push(new Uint8Array(0), true);
        zip.end();
        return { mediaCopied, mediaSkipped };
      }
    }
    jsonEntry.push(encoder.encode(']'), false);
  }
  jsonEntry.push(encoder.encode('}}'), true);

  // 2. Chaque média en STORE (ZipPassThrough) — déjà compressés, les
  // re-déflater ne gagne rien et coûte du CPU (Pitfall 1 de la recherche).
  for (const mediaPath of mediaStaging.sort()) {
    if (Date.now() > deadline) {
      zip.end();
      return { mediaCopied, mediaSkipped };
    }
    const entry = new ZipPassThrough(`medias/${mediaPath.slice(`${root}/medias/`.length)}`);
    zip.add(entry);
    const stream = await downloadStagingStream(admin, mediaPath);
    for await (const chunk of stream) {
      entry.push(chunk, false);
    }
    entry.push(new Uint8Array(0), true);
  }

  zip.end();

  // 3. Upload du flux directement vers le chemin scellé <uid>/<job>.zip.
  const zipPath = `${job.user_id}/${job.id}.zip`;
  const { error: uploadError } = await admin.storage.from(EXPORT_BUCKET).upload(zipPath, output, {
    upsert: true,
    contentType: 'application/zip',
  });
  if (uploadError) throw new GdprExportError(`upload du zip impossible : ${uploadError.message}`, false);

  // 4. Clôture : pret + chemin (JAMAIS d'URL signée — §2.6, le lien se calcule
  // à la demande côté client, plan 26-05).
  const { error: doneError } = await admin
    .from('gdpr_export_jobs')
    .update({ status: 'pret', storage_path: zipPath, error: null, pass_started_at: null })
    .eq('id', job.id);
  if (doneError) throw new GdprExportError(`clôture du job impossible : ${doneError.message}`);
  return { mediaCopied, mediaSkipped };
}

async function handleRun(admin: AdminClient): Promise<Response> {
  const deadline = Date.now() + BUDGET_MS;

  const job = await claimJob(admin);
  if (!job) return json({ processed: false });

  // Plafond de passes atteint : échec lisible plutôt que boucle éternelle.
  if (job.pass_count > PASS_CAP) {
    await failJob(admin, job, `export abandonné après ${job.pass_count} passes (plafond atteint).`);
    return json({ processed: true, job_id: job.id, phase: 'echec', reason: 'plafond_de_passes' });
  }

  try {
    if (!job.staging_ready) {
      const summary = await runExtractionPass(admin, job, deadline);
      return json({
        processed: true,
        job_id: job.id,
        phase: summary.finished ? 'extraction-terminee' : 'extraction-en-cours',
        batches: summary.batches,
        media_copied: summary.mediaCopied,
        media_skipped: summary.mediaSkipped,
      });
    }
    const summary = await runAssemblyPass(admin, job, deadline);
    return json({
      processed: true,
      job_id: job.id,
      phase: 'assemblage',
      media_copied: summary.mediaCopied,
      media_skipped: summary.mediaSkipped,
    });
  } catch (error) {
    if (error instanceof GdprExportError && error.fatal) {
      await failJob(admin, job, error.message);
      return json({ processed: true, job_id: job.id, phase: 'echec', error: error.message });
    }
    // Transitoire : la ligne reste en_cours, le lease expire, le cron reprend.
    console.error('gdpr-export-run: passe interrompue (reprise par cron)', {
      job_id: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({
      processed: true,
      job_id: job.id,
      phase: 'reprise-programmee',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
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
        return json({ error: 'Action inconnue : seul « run » est accepté.' }, 400);
      }
      return await handleRun(ctx.supabaseAdmin);
    } catch (error) {
      console.error('gdpr-export-run: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Export momentanément impossible.' }, 500);
    }
  }),
);
