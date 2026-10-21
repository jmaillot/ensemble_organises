import type { Row, RowFilter } from '@/types';
import type { SetTable } from './set-tables';

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
  /**
   * Écriture idempotente sur une **cible d'unicité déclarée par l'appelant**.
   *
   * Pendant de `create` quand l'unicité d'une ligne ne vient pas de sa clé
   * primaire : `onConflict` nomme la contrainte qui la matérialise (ici
   * `dashboard_widgets_member_type_key unique (member_id, widget_type)`, 0004)
   * et `values` doit porter ses colonnes.
   *
   * Décider `create` ou `update` après une **lecture** ne rend pas le même
   * service : entre la lecture et l'écriture, l'état lu n'est plus l'état de la
   * base (course au premier rendu, lecture en échec, onglet resté ouvert). La
   * ligne écrite ne retrouve alors pas celle qui existe déjà, et l'écriture
   * échoue sur la contrainte (`23505`) ou ajoute une seconde ligne. La cible de
   * conflit reste donc un paramètre explicite, jamais déduit du payload.
   *
   * **Ne jamais fournir d'`id`** dans `values` : voir `SupabaseAdapter.upsert`.
   */
  upsert<T = Row>(table: string, values: Partial<T>, options: { onConflict: string }): Promise<T>;
  update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T>;
  /** Lève si zéro ligne est supprimée, sauf `{ ifMissing: 'ignore' }`. */
  remove(table: string, id: string, options?: RemoveOptions): Promise<void>;
  /** Suppression d'un ensemble de lignes correspondant à un filtre (jointures). */
  removeWhere(table: string, filter: RowFilter, options?: RemoveOptions): Promise<void>;
  /**
   * Remplace d'un seul tenant l'ensemble des lignes rattachées à un parent.
   *
   * Méthode à part entière, et non `removeWhere()` suivi de `create()` : deux
   * requêtes PostgREST n'ont aucune transaction en commun. Si la seconde
   * échoue (réseau, session expirée, refus RLS), la première a déjà supprimé
   * l'ensemble précédent — les assignataires ou les rappels sont perdus alors
   * que l'utilisateur n'a rien supprimé. En mode démo, la même séquence laisse
   * un intervalle pendant lequel un lecteur voit l'ensemble vide.
   *
   * Côté Supabase, l'écriture est UNE fonction SQL (`0133`) : suppression et
   * insertion dans la même transaction, et un refus RLS annule les deux. Côté
   * démo, une transaction Dexie. `values` porte la colonne enfant de la table
   * (membre, instant de rappel, étiquette) ; un tableau vide est un
   * remplacement légitime par zéro ligne, jamais un no-op silencieux.
   */
  replaceSet(table: SetTable, parentId: string, values: string[]): Promise<void>;
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
