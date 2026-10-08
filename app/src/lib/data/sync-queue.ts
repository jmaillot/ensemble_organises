import { getDatabase, type PendingMutation } from './dexie';
import type { Row, RowFilter } from '@/types';
import { requestQueueSync } from '@/hooks/use-pwa';

/**
 * File de synchronisation : lorsqu'une écriture échoue faute de réseau, elle
 * est conservée localement puis rejouée à la reconnexion, dans l'ordre.
 *
 * Conflits (D-06, dernier-écrivain documenté, aucune fusion tentée) : si le
 * serveur a bougé entre la mise en file et le rejeu, l'écriture rejouée
 * écrase silencieusement l'état serveur — le dernier écrivain gagne. Les
 * insertions portent un identifiant client (`randomId`) donc un double rejeu
 * ne duplique pas la ligne ; les `update`/`delete` rejoués deux fois sont
 * idempotents par construction (même valeurs, même cible). Au-delà de ce
 * périmètre, aucune idempotence n'est garantie : c'est documenté dans le
 * panneau hors ligne plutôt que silencieusement accepté.
 */
export async function enqueueMutation(mutation: Omit<PendingMutation, 'id' | 'attempts' | 'createdAt'>) {
  const db = getDatabase();
  await db.mutations.add({ ...mutation, attempts: 0, createdAt: Date.now() });
  // Réveille le worker pour un rejeu même onglet fermé là où le navigateur
  // le permet (D-05). Sans support : sans effet, le rejeu foreground reste.
  // Import depuis le hook : utilitaire pur navigateur, sans dépendance React.
  requestQueueSync();
}

export async function pendingCount() {
  return getDatabase().mutations.count();
}

export type FlushResult = { replayed: number; failed: number };

/**
 * Vrai pendant un rejeu : l'adaptateur ne doit pas remettre en file une
 * écriture qui y est déjà (sinon chaque rejeu en échec dupliquerait la file).
 */
let replaying = false;

export function isReplayingQueue() {
  return replaying;
}

/** Rejoue la file ; les échecs sont conservés avec un compteur d'essais. */
export async function flushMutations(
  send: (mutation: PendingMutation) => Promise<{ ok: boolean }>,
): Promise<FlushResult> {
  const db = getDatabase();
  const entries = await db.mutations.orderBy('createdAt').toArray();
  let replayed = 0;
  let failed = 0;
  replaying = true;
  try {
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
  } finally {
    replaying = false;
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

/**
 * Adaptateur minimal capable de rejouer une mutation. `DataAdapter` complet
 * non requis : les tests y branchent un double, le client y passe `data`.
 */
export interface ReplayTarget {
  create(table: string, values: Record<string, unknown>): Promise<unknown>;
  update(table: string, id: string, values: Record<string, unknown>): Promise<unknown>;
  remove(table: string, id: string): Promise<void>;
  removeWhere(table: string, filter: RowFilter): Promise<void>;
}

/**
 * Rejoue une mutation vers sa cible. Toute exception remonte : c'est
 * `flushMutations` qui comptabilise l'essai, jamais l'expéditeur.
 */
export async function replayOne(target: ReplayTarget, mutation: PendingMutation): Promise<void> {
  switch (mutation.operation) {
    case 'insert':
      await target.create(mutation.table, mutation.values);
      return;
    case 'update':
      await target.update(mutation.table, mutation.rowId, mutation.values);
      return;
    case 'delete':
      await target.remove(mutation.table, mutation.rowId);
      return;
    case 'deleteWhere':
      await target.removeWhere(mutation.table, mutation.values as RowFilter);
      return;
  }
}

/**
 * Rejeu par défaut : chaque entrée est rejouée dans l'ordre d'arrivée vers la
 * cible, les échecs restant en file avec `attempts` incrémenté.
 */
export async function flushWithAdapter(target: ReplayTarget): Promise<FlushResult> {
  return flushMutations(async (mutation) => {
    try {
      await replayOne(target, mutation);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
}
