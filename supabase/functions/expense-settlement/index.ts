/**
 * Edge Function `expense-settlement`.
 *
 * Point d'entrée : `POST /functions/v1/expense-settlement`
 * Corps : `{ household_id?: string }`
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: 'user'` — session obligatoire (`Authorization: Bearer <JWT>`).
 *   Le foyer est déduit de la session : aucun appel sans session n'aboutit,
 *   et aucun appel ne peut viser un foyer dont l'appelant n'est pas membre.
 *
 *   La compilation des soldes et la compensation des dettes sont faites
 *   EN BASE par `private.household_balances()` et
 *   `private.simplify_household_debts()` (migration 0006), via le pont
 *   `public.expense_settlement()` (migration 0013). Cet algorithme n'est
 *   réimplémenté nulle part ailleurs : le client ne doit jamais recalculer un
 *   solde, sinon l'affichage divergerait de la vérité serveur (AGENTS.md §2.2).
 *
 * CONTRAT DE RÉPONSE
 *   {
 *     household_id: string,
 *     balances:    [{ member_id, display_name, amount }],
 *     settlements: [{ from_member_id, from_name, to_member_id, to_name, amount }],
 *     generated_at: string
 *   }
 *
 *   `amount` est un nombre arrondi au centime, positif dans les deux sens :
 *   solde positif = le foyer lui doit, transfert = `from_member_id` rembourse
 *   `to_member_id`.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/** Erreur applicative : le message est destiné à l'utilisateur final. */
class SettlementError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

/**
 * Les identifiants métier sont des `text` préfixés (`household_<uuid>`), pas
 * des uuid : la validation ne doit surtout pas imposer un format uuid.
 */
const requestSchema = z.object({
  /** Foyer visé ; absent, le premier foyer de l'appelant est utilisé. */
  household_id: z.string().trim().min(1).max(128).optional(),
});

async function parseBody(request: Request): Promise<z.infer<typeof requestSchema>> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new SettlementError(400, 'Corps de requête illisible.');
  }

  // Un corps vide est accepté : la requête n'a aucun paramètre obligatoire.
  if (raw.trim() === '') return {};

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new SettlementError(400, 'Corps de requête JSON invalide.');
  }

  const parsed = requestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new SettlementError(400, parsed.error.issues[0]?.message ?? 'Requête invalide.');
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Types de retour
// ---------------------------------------------------------------------------

interface MembershipRow {
  household_id: string;
}

/** Client utilisateur : la RLS filtre les lignes. */
type UserClient = SupabaseClient;
/** Client privilégié (`service_role`) fourni par `withSupabase`. */
type AdminClient = SupabaseClient;

interface BalanceRow {
  member_id: string;
  display_name: string;
  amount: number;
}

interface SettlementRow {
  from_member_id: string;
  from_name: string;
  to_member_id: string;
  to_name: string;
  amount: number;
}

interface SettlementResult {
  household_id?: string;
  balances?: unknown;
  settlements?: unknown;
  generated_at?: string;
}

/**
 * Montant au centime. PostgreSQL renvoie déjà un `numeric(14,2)` arrondi par la
 * base ; cette normalisation protège la réponse d'une chaîne ou d'un flottant
 * hérité d'un client antérieur.
 */
function toCents(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function readBalances(value: unknown): BalanceRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    return {
      member_id: String(item.member_id ?? ''),
      display_name: String(item.display_name ?? ''),
      amount: toCents(item.amount),
    };
  });
}

function readSettlements(value: unknown): SettlementRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    return {
      from_member_id: String(item.from_member_id ?? ''),
      from_name: String(item.from_name ?? ''),
      to_member_id: String(item.to_member_id ?? ''),
      to_name: String(item.to_name ?? ''),
      amount: toCents(item.amount),
    };
  });
}

// ---------------------------------------------------------------------------
// Résolution du foyer
// ---------------------------------------------------------------------------

/**
 * Foyer visé : celui demandé s'il est fourni, sinon le premier de l'appelant.
 *
 * La lecture passe par le client **utilisateur** : la RLS ne renvoie que les
 * memberships de l'appelant, un identifiant usurpé ne peut donc pas élargir la
 * requête. Deux foyers ou plus rendent la cible ambiguë : le corps doit alors
 * porter `household_id`.
 */
async function resolveHousehold(
  user: UserClient,
  userId: string,
  requested: string | undefined,
): Promise<string> {
  const { data, error } = await user
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (error) throw new SettlementError(500, 'Foyer introuvable.');

  const memberships = ((data ?? []) as MembershipRow[]).filter((row) =>
    Boolean(row?.household_id),
  );

  if (requested) {
    const match = memberships.find((row) => row.household_id === requested);
    if (!match) {
      throw new SettlementError(403, 'Vous n’appartenez pas à ce foyer.');
    }
    return match.household_id;
  }

  if (memberships.length === 0) {
    throw new SettlementError(404, 'Vous n’appartenez à aucun foyer.');
  }
  if (memberships.length > 1) {
    throw new SettlementError(400, 'Indiquez le foyer concerné : household_id est requis.');
  }

  return memberships[0].household_id;
}

/** Traduit une erreur PostgreSQL en réponse HTTP lisible. */
function translateRpcError(error: { code?: string; message?: string }): SettlementError {
  const message = error.message ?? '';

  // Les motifs sont posés en base (migrations 0006 et 0013) : la base est
  // l'unique source de vérité sur la raison d'un refus.
  if (message.includes('n’appartenez pas') || message.includes("n'appartenez pas")) {
    return new SettlementError(403, 'Vous n’appartenez pas à ce foyer.');
  }
  if (message.includes('session requise')) {
    return new SettlementError(401, 'Connectez-vous pour consulter l’Ardoise.');
  }
  if (message.includes('foyer obligatoire') || error.code === '22023') {
    return new SettlementError(400, 'Foyer manquant ou invalide.');
  }
  if (error.code === '42501') {
    return new SettlementError(403, 'Accès refusé à ce foyer.');
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
    return new SettlementError(503, 'Le calcul des soldes n’est pas encore disponible.');
  }

  // Le détail technique n'est jamais renvoyé au client. Aucun montant n'est
  // journalisé ici, même en cas d'échec : les journaux serveur ne doivent pas
  // contenir de somme d'argent.
  console.error('expense-settlement: erreur RPC', { code: error.code });
  return new SettlementError(500, 'Calcul des soldes impossible.');
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
        return json({ error: 'Connectez-vous pour consulter l’Ardoise.' }, 401);
      }

      const body = await parseBody(request);
      const householdId = await resolveHousehold(ctx.supabase, userId, body.household_id);

      const admin: AdminClient = ctx.supabaseAdmin;
      const { data, error } = await admin.rpc('expense_settlement', {
        p_actor_id: userId,
        p_household_id: householdId,
      });

      if (error) throw translateRpcError(error);

      const result = (data ?? {}) as SettlementResult;

      return json({
        household_id: result.household_id ?? householdId,
        balances: readBalances(result.balances),
        settlements: readSettlements(result.settlements),
        generated_at: result.generated_at ?? new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof SettlementError) return json({ error: error.message }, error.status);

      // Message générique : le détail reste dans les journaux serveur, sans
      // montant et sans secret.
      console.error('expense-settlement: erreur inattendue', {
        message: error instanceof Error ? error.name : 'inconnue',
      });
      return json({ error: 'Calcul des soldes impossible.' }, 500);
    }
  }),
);
