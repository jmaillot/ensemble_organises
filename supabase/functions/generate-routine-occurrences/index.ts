/**
 * Edge Function `generate-routine-occurrences`.
 *
 * Point d'entrée : `POST /functions/v1/generate-routine-occurrences`
 * Corps : `{ household_id?: string }` (facultatif)
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['secret', 'user']`
 *   * `secret` → appel serveur : `pg_cron` ou runner de maintenance. C'est le
 *     mode nominal, celui du job `eo-routine-maintenance` (migration 0011).
 *   * `user`   → déclenchement manuel, réservé à un administrateur de foyer.
 *     Le rôle est revérifié **en base** par `public.routine_maintenance()`
 *     (migration 0013) : une fonction compromise ne peut pas déclencher la
 *     maintenance à la place d'un non-administrateur.
 *
 * POURQUOI UNE EDGE FUNCTION ALORS QUE LE JOB EST DÉJÀ EN SQL
 *   Le job quotidien `eo-routine-maintenance` appelle
 *   `private.run_daily_routine_maintenance()` directement : il n'a pas besoin
 *   d'aller-retour HTTP. Cette fonction sert au déclenchement manuel
 *   (bouton « régénérer » d'un administrateur) et à la supervision : elle
 *   renvoie le même résumé que le job.
 *
 * CONTRAT DE RÉPONSE
 *   { occurrences_created, occurrences_late, occurrences_missed, generated_at }
 *
 * Note d'exécution : `withSupabase` renvoie un gestionnaire `fetch` ; on le
 * passe à `Deno.serve`, forme équivalente à `export default { fetch }` pour le
 * runtime Deno de la stack auto-hébergée.
 */

import { withSupabase } from 'npm:@supabase/server';
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

/** Variable lue par `withSupabase` pour construire le client privilégié. */
const SECRET_KEY_ENV = 'SUPABASE_SECRET_KEY';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class MaintenanceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  /** Foyer visé par un déclenchement manuel ; ignoré en mode `secret`. */
  household_id: z.string().trim().min(1).max(128).optional(),
});

async function parseBody(request: Request): Promise<z.infer<typeof requestSchema>> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {};
  }

  // Un corps vide est accepté : le déclenchement manuel n'a pas de paramètre
  // obligatoire.
  if (raw.trim() === '') return {};

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new MaintenanceError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(parsedJson ?? {});
  if (!parsed.success) {
    throw new MaintenanceError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Résumé de la maintenance
// ---------------------------------------------------------------------------

type AdminClient = SupabaseClient;

interface MaintenanceSummary {
  occurrences_created?: number;
  occurrences_late?: number;
  occurrences_missed?: number;
  generated_at?: string;
}

function toCount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Traduit une erreur PostgreSQL en réponse HTTP lisible. */
function translateRpcError(error: { code?: string; message?: string }): MaintenanceError {
  const message = error.message ?? '';

  if (message.includes('réservée aux administrateurs')) {
    return new MaintenanceError(403, 'Seul un administrateur du foyer peut lancer cette opération.');
  }
  if (message.includes('foyer obligatoire') || error.code === '22023') {
    return new MaintenanceError(400, 'Foyer manquant ou invalide.');
  }
  if (error.code === '42501') {
    return new MaintenanceError(403, 'Accès refusé.');
  }
  // `PGRST202` : fonction absente du schéma publié, donc migration 0013 non
  // appliquée. `42883` / `42P01` couvrent les variantes d'erreur PostgreSQL.
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST203' ||
    error.code === '42883' ||
    error.code === 'P0001' ||
    error.code === '42P01'
  ) {
    return new MaintenanceError(503, 'La maintenance des routines n’est pas encore disponible.');
  }

  // Aucun détail technique renvoyé au client, aucun secret journalisé.
  console.error('generate-routine-occurrences: erreur RPC', { code: error.code });
  return new MaintenanceError(500, 'Maintenance des routines impossible.');
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

      // La clé secrète est indispensable dans les deux modes : c'est elle qui
      // porte les privilèges `service_role` utilisés pour lancer la maintenance.
      // Son absence est un défaut de configuration, pas une erreur d'appel.
      if (!Deno.env.get(SECRET_KEY_ENV)) {
        console.error('generate-routine-occurrences: configuration serveur absente', {
          variable: SECRET_KEY_ENV,
        });
        return json({ error: 'Configuration serveur incomplète.' }, 500);
      }

      const body = await parseBody(request);

      // Mode `secret` : ni acteur, donc le job serveur. Mode `user` : l'acteur
      // est transmis et le rôle `admin` est revérifié en base.
      const userId = ctx.authMode === 'user' ? ctx.userClaims?.id : undefined;
      if (ctx.authMode === 'user' && !userId) {
        return json({ error: 'Connectez-vous pour lancer la maintenance.' }, 401);
      }

      const admin: AdminClient = ctx.supabaseAdmin;
      const { data, error } = await admin.rpc('routine_maintenance', {
        p_actor_id: userId ?? null,
        p_household_id: body.household_id ?? null,
      });

      if (error) throw translateRpcError(error);

      const summary = (data ?? {}) as MaintenanceSummary;

      return json({
        occurrences_created: toCount(summary.occurrences_created),
        occurrences_late: toCount(summary.occurrences_late),
        occurrences_missed: toCount(summary.occurrences_missed),
        generated_at: summary.generated_at ?? new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof MaintenanceError) return json({ error: error.message }, error.status);

      // Aucun montant ni secret ici : le message technique peut être journalisé
      // pour le diagnostic (contrairement à `expense-settlement`).
      console.error('generate-routine-occurrences: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Maintenance des routines impossible.' }, 500);
    }
  }),
);
