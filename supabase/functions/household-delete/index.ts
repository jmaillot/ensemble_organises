/**
 * Edge Function `household-delete`.
 *
 * Point d'entrée : `POST /functions/v1/household-delete`
 * Corps : `{ householdId: string }`
 *
 * Suppression d'un foyer par son administrateur (politique §6, CGU art. 9).
 * Orchestre deux systèmes, dans l'ordre qui limite les dégâts visibles :
 *   1. lignes en base via `public.delete_household` (migration 0074) —
 *      dépenses d'abord (paid_by restrict), cascades ensuite ;
 *   2. objets Storage (`household-media`, `household-avatars`, préfixe
 *      `<householdId>/`) via l'API Storage.
 * Si l'étape 2 échoue après l'étape 1, les objets restants sont orphelins
 * mais inaccessibles (aucune ligne ne les référence) : la réponse le signale
 * par `storage_cleanup: 'partial'` au lieu de masquer l'échec.
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`, comme `household-invite` : la passerelle
 *   accepte les deux, mais seule une session `user` exécute quoi que ce soit
 *   (401 sinon). Le rôle `admin` est revérifié EN BASE par le RPC, donc même
 *   cette fonction compromise ne peut pas agir pour un non-administrateur.
 *
 * CONTRAT DE RÉPONSE
 *   -> { household_id, expenses, storage_objects, storage_cleanup: 'ok' | 'partial' }
 */

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

/** Buckets privés dont les objets vivent sous `<householdId>/…` (0010). */
const HOUSEHOLD_BUCKETS = ['household-media', 'household-avatars'] as const;
/** Pagination de l'API Storage et taille des lots de suppression. */
const PAGE_SIZE = 100;

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

const bodySchema = z.object({
  householdId: z.string().trim().min(1).max(128),
});

type RequestBody = z.infer<typeof bodySchema>;

async function parseBody(request: Request): Promise<RequestBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HouseholdDeleteError(400, 'Corps de requête JSON invalide.');
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) throw new HouseholdDeleteError(400, 'Foyer visé incomplet.');
  return parsed.data;
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
  // Les motifs sont posés en base (migration 0074) : la base fait foi.
  if (message.includes('réservée aux administrateurs')) {
    return new HouseholdDeleteError(403, 'Seul un administrateur du foyer peut le supprimer.');
  }
  if (message.includes('foyer introuvable')) return new HouseholdDeleteError(404, 'Ce foyer est introuvable.');
  if (message.includes('session requise')) return new HouseholdDeleteError(401, 'Connectez-vous pour continuer.');
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

async function handleDelete(admin: AdminClient, userId: string, body: RequestBody) {
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

Deno.serve(
  withSupabase({ auth: ['user', 'publishable'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      const userId = ctx.userClaims?.id;
      if (ctx.authMode !== 'user' || !userId) {
        return json({ error: 'Connectez-vous pour continuer.' }, 401);
      }

      return await handleDelete(ctx.supabaseAdmin, userId, await parseBody(request));
    } catch (error) {
      if (error instanceof HouseholdDeleteError) return json({ error: error.message }, error.status);

      console.error('household-delete: erreur inattendue', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
