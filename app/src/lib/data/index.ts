import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getLocalAdapter } from './local-adapter';
import { SupabaseAdapter } from './supabase-adapter';
import type { DataAdapter } from './adapter';

export type { DataAdapter } from './adapter';
export { DataError } from './adapter';

const localAdapter = getLocalAdapter();
const supabaseAdapter = new SupabaseAdapter();

/**
 * Adaptateur actif. Sans configuration Supabase, l'application tourne sur le
 * cache local (dEMO) — utile pour le design, les tests et la démonstration.
 */
export const data: DataAdapter = isSupabaseConfigured ? supabaseAdapter : localAdapter;

export const isLocalMode = !isSupabaseConfigured;
