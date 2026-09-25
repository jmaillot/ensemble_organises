import { createClient } from '@supabase/supabase-js';

/** URL de la stack Supabase auto-hébergée (build arg `VITE_SUPABASE_URL`). */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/** Clé publiable uniquement : la clé secrète reste dans les services serveur. */
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * Client unique. Le typage métier est porté par `src/types/database.ts` et
 * l'adaptateur `src/lib/data/supabase-adapter.ts` ; `createClient` reste non
 * générique pour éviter une duplication des types générés.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabasePublishableKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'x-application-name': 'ensemble-organises' } },
    })
  : null;

export const supabaseFunctionsBase = isSupabaseConfigured ? `${supabaseUrl}/functions/v1` : null;
