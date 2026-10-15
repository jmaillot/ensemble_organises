import type { Row } from '@/types';

/**
 * Tables de jointure dépourvues de colonne `id` : leur clé est composite
 * (colonnes parentes). La règle tient en une ligne — **table de jointure ⇒ clé
 * composite ⇒ aucun `id` injecté** — et `keys.test.ts` la rapproche des
 * migrations dans les deux sens.
 *
 * WR-03 : `ardoise_members` portait une clé composite `(ardoise_id, member_id)`
 * et manquait ici ; l'adaptateur y injectait un `id` inexistant, PostgREST
 * rejetait l'insertion, et le repli silencieux de l'appelant masquait l'échec.
 */
export const KEYLESS_TABLES = new Set(['task_assignees', 'routine_assignees', 'conversation_members', 'trip_members', 'recipe_tag_links', 'recipe_favorites', 'ardoise_members']);

export const isKeylessTable = (table: string) => KEYLESS_TABLES.has(table);

/** Clé de stockage locale d'une ligne (lignes à clé composite comprises). */
export function rowKey(table: string, data: Row) {
  if (typeof data.id === 'string' && data.id.length > 0) return `${table}:${data.id}`;
  const signature = Object.entries(data)
    .filter(([, value]) => value !== null && typeof value !== 'object')
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('&');
  return `${table}#${signature}`;
}
