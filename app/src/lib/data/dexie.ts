import Dexie, { type Table } from 'dexie';
import type { Row } from '@/types';

export interface StoredRow {
  key: string; // `${table}:${id}`
  table: string;
  householdId: string;
  data: Row;
  updatedAt: number;
}

export interface PendingMutation {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  rowId: string;
  values: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

/** Cache applicatif local : données consultées hors ligne + file de synchronisation. */
export class EnsembleDatabase extends Dexie {
  rows!: Table<StoredRow, string>;
  mutations!: Table<PendingMutation, number>;

  constructor(name = 'ensemble-organises') {
    super(name);
    this.version(1).stores({
      rows: 'key, table, householdId, [table+householdId], updatedAt',
      mutations: '++id, table, createdAt',
    });
  }
}

let instance: EnsembleDatabase | null = null;
let instanceName = 'ensemble-organises';

export function getDatabase() {
  if (!instance || instance.name !== instanceName) instance = new EnsembleDatabase(instanceName);
  return instance;
}

/**
 * Isole une base par contexte d'exécution. Les tests partagent le même moteur
 * IndexedDB simulé : sans nom distinct, les suites se vident les données les
 * unes des autres.
 */
export function useDatabaseName(name: string) {
  if (instanceName === name) return;
  instanceName = name;
  instance = null;
}

/** Utilisé par les tests (IndexedDB simulé). */
export function resetDatabaseSingleton() {
  instance = null;
}

export async function clearDatabase() {
  const db = getDatabase();
  await db.transaction('rw', db.rows, db.mutations, async () => {
    await db.rows.clear();
    await db.mutations.clear();
  });
}
