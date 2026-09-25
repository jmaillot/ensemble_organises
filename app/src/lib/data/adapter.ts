import type { Row, RowFilter } from '@/types';

/** Une entité porte un `id` texte ; les tables de jointure n'en ont pas. */
export interface Entity {
  id: string;
}

/**
 * Contrat d'accès aux données. Deux implémentations : PostgREST (Supabase
 * auto-hébergé) et IndexedDB (mode local / hors ligne). Les modules ne
 * connaissent que cette interface via `src/lib/data/index.ts`.
 */
export interface DataAdapter {
  readonly kind: 'supabase' | 'local';
  list<T = Row>(table: string, filter?: RowFilter): Promise<T[]>;
  create<T = Row>(table: string, values: Partial<T>): Promise<T>;
  update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T>;
  remove(table: string, id: string): Promise<void>;
  /** Suppression d'un ensemble de lignes correspondant à un filtre (jointures). */
  removeWhere(table: string, filter: RowFilter): Promise<void>;
  /** Notifie les abonnés quand une table change (temps réel ou onglet). */
  subscribe(table: string, onChange: () => void): () => void;
}

export class DataError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DataError';
  }
}
