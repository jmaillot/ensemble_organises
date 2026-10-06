/**
 * Edge Function `refresh-calendrier-ref`.
 *
 * Point d'entrée : `POST /functions/v1/refresh-calendrier-ref`
 * Corps : `{ year?: number }` (défaut : année en cours Europe/Paris)
 *
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['secret']`
 *   * `secret` → appel serveur seul (pg_cron via `private.dispatch_calendrier_refresh`,
 *     clé service dans l'en-tête `apikey`). Tout autre mode est refusé avec 401
 *     SANS toucher aux sources ni au cache.
 *
 * CONTRAT FAIL-OPEN (D-15)
 *   Toute erreur de fetch (source injoignable, schéma inattendu, upsert en
 *   échec partiel) → log + `200 { refreshed: false }`. L'ancien cache reste
 *   affiché, le retry a lieu au prochain passage cron. Jamais d'erreur
 *   bloquante.
 *
 * SOURCES OFFICIELLES (D-13, miroir `use-ref-days.ts`)
 *   * Fériés métropole : `https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json`
 *   * Vacances par zone : dataset EN `fr-en-calendrier-scolaire`
 *     (`where zones="Zone {Z}"` + `annee_scolaire`), zones A/B/C.
 *
 * SÉCURITÉ
 *   * Aucun secret HMAC ici : pas de token, donc pas de réutilisation de
 *     `INVITE_TOKEN_HMAC_SECRET` (ni d'aucun autre).
 *   * Compteur mémoire basse limite sur l'action `refresh` (le cron ne passe
 *     que 2×/an ; limite 10/min pour les relances manuelles).
 */

// Spécificateur BARE, comme `gift-list-invite` : le runtime épingle
// `@supabase/server` via sa table d'importation (`volumes/functions/deno.jsonc`).
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

/** Erreur applicative : le message est destiné au log serveur. */
class RefreshCalendrierError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Limitation de débit (compteur mémoire, mono-instance — motif gift-list-invite)
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { refresh: 10 };
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
    if (entry.count > (LIMITS[action] ?? 10)) {
      throw new RefreshCalendrierError(429, 'Trop de tentatives. Patientez une minute avant de réessayer.');
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
// Sources officielles (formes miroir de `use-ref-days.ts`, sans le fetch client)
// ---------------------------------------------------------------------------

import {
  ZONES,
  feriesUrl,
  parseVacationRecords,
  schoolYearsForYear,
  vacancesUrl,
} from './ref-days.ts';
import type { SchoolZone, VacationRecord } from './ref-days.ts';

// ---------------------------------------------------------------------------
// Validation des entrées (Zod)
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
});

function currentParisYear(): number {
  return Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }).slice(0, 4));
}

// ---------------------------------------------------------------------------
// Accès base
// ---------------------------------------------------------------------------

/** Client privilégié fourni par `withSupabase` (contourne la RLS). */
type AdminClient = SupabaseClient;

async function refreshHolidays(admin: AdminClient, year: number): Promise<number> {
  const response = await fetch(feriesUrl(year));
  if (!response.ok) throw new Error(`Jours fériés indisponibles (${response.status}).`);
  const payload = (await response.json()) as Record<string, string>;
  const rows = Object.entries(payload).map(([holiday_date, name]) => ({ holiday_date, name }));
  if (rows.length === 0) throw new Error('Jours fériés vides.');
  const { error } = await admin
    .from('public_holidays')
    .upsert(rows, { onConflict: 'holiday_date' });
  if (error) throw new Error(`Upsert fériés : ${error.message}`);
  return rows.length;
}

async function refreshVacations(admin: AdminClient, year: number): Promise<number> {
  const schoolYears = schoolYearsForYear(year);
  let count = 0;
  for (const zone of ZONES) {
    const pages = await Promise.all(
      schoolYears.map(async (schoolYear) => {
        const response = await fetch(vacancesUrl(zone, schoolYear));
        if (!response.ok) throw new Error(`Vacances zone ${zone} indisponibles (${response.status}).`);
        const payload = (await response.json()) as { results?: VacationRecord[] };
        return { schoolYear, records: payload.results ?? [] };
      }),
    );
    for (const { schoolYear, records } of pages) {
      const ranges = parseVacationRecords(records);
      if (ranges.length === 0) continue;
      const rows = ranges.map((range) => ({
        zone,
        school_year: schoolYear,
        name: range.label,
        start_date: range.start,
        end_date: range.end,
      }));
      const { error } = await admin
        .from('school_holidays')
        .upsert(rows, { onConflict: 'zone,start_date,end_date' });
      if (error) throw new Error(`Upsert vacances zone ${zone} : ${error.message}`);
      count += rows.length;
    }
  }
  if (count === 0) throw new Error('Vacances vides (toutes zones).');
  return count;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(
  withSupabase({ auth: ['secret'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== 'POST') {
        return json({ error: 'Méthode non autorisée.' }, 405);
      }

      // Appel serveur seul : aucun autre mode n'exécute le refresh.
      if (ctx.authMode !== 'secret') {
        return json({ error: 'Appel serveur requis.' }, 401);
      }

      enforceRateLimit(request, 'refresh');

      let raw: unknown = {};
      try {
        raw = await request.json();
      } catch {
        raw = {};
      }
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Requête invalide.' }, 400);
      }
      const year = parsed.data.year ?? currentParisYear();

      const admin = ctx.supabaseAdmin;
      const holidays = await refreshHolidays(admin, year);
      const vacations = await refreshVacations(admin, year);
      return json({ refreshed: true, year, holidays, vacations });
    } catch (error) {
      // FAIL-OPEN (D-15) : une source en panne ne casse jamais l'affichage.
      // L'ancien cache reste en base, le retry a lieu au prochain passage.
      if (error instanceof RefreshCalendrierError && error.status === 429) {
        return json({ error: error.message }, error.status);
      }
      console.error('refresh-calendrier-ref: échec non bloquant', {
        message: error instanceof Error ? error.message : String(error),
      });
      return json({ refreshed: false }, 200);
    }
  }),
);
