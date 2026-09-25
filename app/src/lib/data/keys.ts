import type { Row } from '@/types';

/**
 * Tables de jointure dépourvues de colonne `id` : leur clé est composite
 * (colonnes parentes). Aucun identifiant ne doit être injecté à l'écriture.
 */
export const KEYLESS_TABLES = new Set(['task_assignees', 'routine_assignees', 'conversation_members']);

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
