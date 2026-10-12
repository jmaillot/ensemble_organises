import Dexie, { type Table } from 'dexie';
import type { Row } from '@/types';

export interface StoredRow {
  key: string; // `${table}:${id}`
  table: string;
  householdId: string;
  data: Row;
  updatedAt: number;
}

/** Base locale : jeu de démonstration et données du mode local (D-10 : la file
 * de mutations du mode offline a été retirée — `version(2)` supprime le store). */
export class EnsembleDatabase extends Dexie {
  rows!: Table<StoredRow, string>;

  constructor(name = 'ensemble-organises') {
    super(name);
    this.version(1).stores({
      rows: 'key, table, householdId, [table+householdId], updatedAt',
      mutations: '++id, table, createdAt',
    });
    // Retrait du mode offline données (D-10) : plus de file, le store
    // `mutations` est supprimé de la base existante des utilisateurs.
    this.version(2).stores({
      rows: 'key, table, householdId, [table+householdId], updatedAt',
      mutations: null,
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
  await db.rows.clear();
}
