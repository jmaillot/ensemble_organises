import { getDatabase, type PendingMutation } from './dexie';
import type { Row } from '@/types';

/**
 * File de synchronisation : lorsqu'une écriture échoue faute de réseau, elle
 * est conservée localement puis rejouée à la reconnexion, dans l'ordre.
 */
export async function enqueueMutation(mutation: Omit<PendingMutation, 'id' | 'attempts' | 'createdAt'>) {
  const db = getDatabase();
  await db.mutations.add({ ...mutation, attempts: 0, createdAt: Date.now() });
}

export async function pendingCount() {
  return getDatabase().mutations.count();
}

export type FlushResult = { replayed: number; failed: number };

/** Rejoue la file ; les échecs sont conservés avec un compteur d'essais. */
export async function flushMutations(
  send: (mutation: PendingMutation) => Promise<{ ok: boolean }>,
): Promise<FlushResult> {
  const db = getDatabase();
  const entries = await db.mutations.orderBy('createdAt').toArray();
  let replayed = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const outcome = await send(entry);
      if (outcome.ok) {
        await db.mutations.delete(entry.id as number);
        replayed += 1;
      } else {
        await db.mutations.update(entry.id as number, { attempts: entry.attempts + 1 });
        failed += 1;
      }
    } catch {
      await db.mutations.update(entry.id as number, { attempts: entry.attempts + 1 });
      failed += 1;
    }
  }
  return { replayed, failed };
}

/** Lecture hors ligne d'une table depuis le cache local. */
export async function readCached<T extends Row>(table: string, householdId?: string): Promise<T[]> {
  const db = getDatabase();
  const entries =
    householdId === undefined
      ? await db.rows.where('table').equals(table).toArray()
      : await db.rows.where('[table+householdId]').equals([table, householdId]).toArray();
  return entries.map((entry) => entry.data) as T[];
}
