import type { Row, RowFilter } from '@/types';

/** Une entité porte un `id` texte ; les tables de jointure n'en ont pas. */
export interface Entity {
  id: string;
}

/**
 * Comportement du contrat quand une suppression n'affecte aucune ligne.
 *
 * Sous RLS, une politique `for delete using (...)` exige la **visibilité** de
 * la ligne : zéro ligne supprimée signifie donc « la politique a refusé » ou
 * « la ligne n'existe plus ». Le défaut (`'error'`) fait remonter ces deux cas
 * plutôt que de mentir sur un succès. Un appelant qui accepte volontairement
 * une suppression idempotente — remplacement avant insertion, nettoyage en
 * cascade, bascule éteinte — le déclare par `{ ifMissing: 'ignore' }`.
 */
export interface RemoveOptions {
  ifMissing?: 'error' | 'ignore';
}

/** Message utilisateur d'une suppression `remove` qui n'affecte rien. */
export const REMOVE_MISSING_MESSAGE =
  'Suppression refusée : la ligne n’existe plus ou votre rôle ne le permet pas.';

/** Message utilisateur d'une suppression `removeWhere` qui n'affecte rien. */
export const REMOVE_WHERE_MISSING_MESSAGE =
  'Suppression refusée : aucune ligne ne correspond, ou votre rôle ne le permet pas.';

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
  /** Lève si zéro ligne est supprimée, sauf `{ ifMissing: 'ignore' }`. */
  remove(table: string, id: string, options?: RemoveOptions): Promise<void>;
  /** Suppression d'un ensemble de lignes correspondant à un filtre (jointures). */
  removeWhere(table: string, filter: RowFilter, options?: RemoveOptions): Promise<void>;
  /**
   * Crée un foyer et son premier membre d'un seul tenant.
   *
   * Méthode à part entière, et non deux `create()` : le foyer et son
   * administrateur forment une seule opération. Deux requêtes laisseraient un
   * foyer sans administratrice en cas d'échec de la seconde — et
   * `households_delete` exige un administrateur, donc un foyer orphelin ne
   * serait supprimable par personne. Côté PostgREST, l'insertion renverrait en
   * outre la ligne à la politique de lecture, qui refuse un foyer dont
   * l'appelant n'est pas encore membre.
   */
  createHousehold(values: {
    name: string;
    avatarColor: string;
    /**
     * Acteur, pour l'adaptateur local. L'adaptateur PostgREST l'IGNORE
     * volontairement : l'acteur y est `auth.uid()`, jamais un paramètre, sinon
     * un client pourrait créer un foyer au nom d'un autre. Le paramètre existe
     * pour que le mode local dispose du même contexte, pas pour être transmis.
     */
    actor: { id: string; displayName: string | null; avatarUrl: string | null } | null;
  }): Promise<{ household: Row; member: Row }>;
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
