import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { DataError, type DataAdapter, type ListResult } from './adapter';
import { getDatabase } from './dexie';
import { enqueueMutation, isReplayingQueue, readCached } from './sync-queue';
import { isKeylessTable, rowKey } from './keys';
import { randomId } from '@/lib/utils';
import type { Row, RowFilter } from '@/types';

/** Tables dont l'accès passe par la colonne `household_id`. */
const HOUSEHOLD_SCOPED = new Set([
  'households',
  'household_members',
  'shopping_lists',
  'shopping_list_items',
  'products',
  'events',
  'event_reminders',
  'notes',
  'tasks',
  'task_assignees',
  'task_reminders',
  'routines',
  'routine_assignees',
  'routine_reminders',
  'routine_completions',
  'recipes',
  'expenses',
  'expense_participants',
  'gift_lists',
  'gift_items',
  'gift_list_shares',
  'gift_ideas',
  'contact_lists',
  'contacts',
  // `gift_list_invites` est volontairement EXCLUE : RLS sans politique
  // (0079), lisible uniquement via les RPC `service_role` appelés par l'Edge
  // `gift-list-invite` — même régime que `household_invite_tokens`.
  'birthdays',
  'pets',
  'pet_records',
  'provider_types',
  'providers',
  'loyalty_cards',
  'places',
  'posts',
  'post_media',
  'post_comments',
  'post_reactions',
  'trips',
  'conversations',
  'conversation_members',
  'messages',
  'dashboard_widgets',
]);

/**
 * Adaptateur Supabase auto-hébergé. La RLS reste la frontière d'autorisation :
 * le client n'envoie aucun filtre de sécurité maison, il transmet uniquement
 * les contraintes métier (foyer, parent).
 */
export class SupabaseAdapter implements DataAdapter {
  readonly kind = 'supabase' as const;

  private channels = new Map<string, { channel: RealtimeChannel; listeners: Set<() => void> }>();

  private client() {
    if (!supabase) throw new DataError('Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
    return supabase;
  }

  async list<T = Row>(table: string, filter: RowFilter = {}): Promise<T[]> {
    return (await this.listWithMeta<T>(table, filter)).rows;
  }

  /**
   * Lecture avec repli hors ligne (D-01) : tout échec réseau (exception
   * levée, timeout, portail captif, 5xx) sert les lignes Dexie mises en cache
   * par les lectures précédentes, avec `fromCache: true` pour que l'UI les
   * marque comme périmées. Cache vide = rien à servir : l'erreur d'origine
   * remonte telle quelle, comme avant.
   */
  async listWithMeta<T = Row>(table: string, filter: RowFilter = {}): Promise<ListResult<T>> {
    const client = this.client();
    let query = client.from(table).select('*');
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (value === null) query = query.is(key, null);
      else if (Array.isArray(value)) query = query.in(key, value as string[]);
      else query = query.eq(key, value);
    }
    let rows: T[] | null = null;
    let failure: unknown = null;
    try {
      const { data, error } = await query;
      if (error) failure = error;
      else rows = (data ?? []) as T[];
    } catch (networkError) {
      failure = networkError;
    }
    if (failure !== null) return this.serveCached<T>(table, filter, failure);
    await this.cacheRows(table, (rows ?? []) as Row[]);
    return { rows: rows ?? [], fromCache: false };
  }

  /**
   * Sert le cache local après un échec de lecture. Le filtre `household_id`
   * passe par l'index composite, les autres clés sont appliquées en mémoire :
   * le repli respecte le même filtre que la lecture en direct.
   */
  private async serveCached<T>(table: string, filter: RowFilter, failure: unknown): Promise<ListResult<T>> {
    const householdId = typeof filter.household_id === 'string' ? filter.household_id : undefined;
    const cached = await readCached<Row>(table, householdId);
    const rows = cached.filter((row) => matchesRow(row, filter)) as T[];
    if (rows.length === 0) {
      if (failure instanceof DataError) throw failure;
      const message = failure instanceof Error ? failure.message : 'Lecture impossible.';
      throw new DataError(message, failure);
    }
    return { rows, fromCache: true };
  }

  async create<T = Row>(table: string, values: Partial<T>): Promise<T> {
    const client = this.client();
    const givenId = (values as { id?: string }).id;
    const payload = isKeylessTable(table) ? { ...values } : { ...values, id: givenId ?? randomId(table) };
    const { data: row, error } = await client.from(table).insert(payload as never).select('*').single();
    const insertedId = String((payload as { id?: string }).id ?? '');
    if (error) throw this.queueOrFail(table, 'insert', insertedId, payload as Record<string, unknown>, error);
    return row as T;
  }

  async createHousehold(values: {
    name: string;
    avatarColor: string;
    actor: { id: string; displayName: string | null; avatarUrl: string | null } | null;
  }): Promise<{ household: Row; member: Row }> {
    const client = this.client();
    // `values.actor` n'est volontairement pas transmis : la fonction SQL prend
    // l'acteur de `auth.uid()`. Lui envoyer un identifiant rendrait la création
    // impersonable, et la fonction refuse précisément de prendre l'acteur en
    // argument.
    //
    // La fonction fait les deux insertions dans une transaction et renvoie le
    // foyer par sa valeur de retour : aucun `RETURNING` n'est exposé à la
    // politique de lecture, qui refuserait un foyer dont l'appelant n'est pas
    // encore membre.
    const { data, error } = await client.rpc('create_household', {
      p_name: values.name,
      p_avatar_color: values.avatarColor,
    });
    if (error) throw new DataError(error.message, error);
    // Déstructuré plutôt que lu sur l'objet : c'est ce qui permet à TypeScript
    // de réduire le type après le garde.
    const { household, member } = (data ?? {}) as { household?: Row; member?: Row };
    if (!household || !member) {
      throw new DataError('Le foyer créé est incomplet.');
    }
    // Le cache local est renseigné comme le fait `list` : sinon une lecture
    // hors ligne faite juste après la création ne trouverait rien.
    await this.cacheRows('households', [household]);
    await this.cacheRows('household_members', [member]);
    return { household, member };
  }

  async update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T> {
    const client = this.client();
    const { data: row, error } = await client.from(table).update(values as never).eq('id', id).select('*').single();
    if (error) throw this.queueOrFail(table, 'update', id, values as Record<string, unknown>, error);
    return row as T;
  }

  async remove(table: string, id: string) {
    const client = this.client();
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) {
      const queued = this.queueOrFail(table, 'delete', id, {}, error);
      // Éviction optimiste : une ligne supprimée ne doit pas ressurgir des
      // lectures périmées avant son rejeu.
      await getDatabase().rows.delete(rowKey(table, { id }));
      throw queued;
    }
    await getDatabase().rows.delete(rowKey(table, { id }));
  }

  /**
   * Mise en file sur échec constaté (D-02) : toute erreur d'écriture est
   * mise en file pour rejeu, que le navigateur se dise hors ligne ou non —
   * un timeout, une 5xx ou un portail captif ne font plus perdre une
   * mutation. Politique volontairement « transitoire d'abord » : une erreur
   * durable (droits, validation) restera en file avec `attempts` incrémenté
   * au lieu d'être perdue, et remontera au rejeu. Le `DataError` porte
   * `queuedForSync` pour que l'UI garde son état optimiste.
   */
  private queueOrFail(
    table: string,
    operation: 'insert' | 'update' | 'delete' | 'deleteWhere',
    rowId: string,
    values: Record<string, unknown>,
    error: { message: string } | null,
  ) {
    // Pendant un rejeu, l'écriture rejouée est déjà en file : l'y remettre
    // dupliquerait la file à chaque échec. L'erreur remonte sans file et le
    // compteur d'essais est incrémenté par `flushMutations`.
    if (isReplayingQueue()) return new DataError(error?.message ?? 'Écriture refusée.', error);
    void enqueueMutation({ table, operation, rowId, values });
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return new DataError(
      offline
        ? 'Hors ligne : la modification sera synchronisée au retour du réseau.'
        : 'Écriture non confirmée (réseau ou serveur) : elle est conservée et sera rejouée automatiquement.',
      error,
      true,
    );
  }

  /**
   * Jointures (lignes sans `id`) : l'échec est mis en file comme les autres
   * verbes (D-02), avec le filtre dans `values` pour un rejeu à l'identique.
   */
  async removeWhere(table: string, filter: RowFilter) {
    const client = this.client();
    let query = client.from(table).delete();
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (value === null) query = query.is(key, null);
      else if (Array.isArray(value)) query = query.in(key, value as string[]);
      else query = query.eq(key, value);
    }
    const { error } = await query;
    if (error) {
      const queued = this.queueOrFail(table, 'deleteWhere', '*', filter as Record<string, unknown>, error);
      await this.evictCachedWhere(table, filter);
      throw queued;
    }
  }

  /** Éviction optimiste des lignes du cache correspondant à un filtre. */
  private async evictCachedWhere(table: string, filter: RowFilter) {
    const db = getDatabase();
    const entries = await db.rows.where('table').equals(table).toArray();
    const targets = entries.filter((entry) => matchesRow(entry.data, filter));
    if (targets.length > 0) await db.rows.bulkDelete(targets.map((entry) => entry.key));
  }

  subscribe(table: string, onChange: () => void) {
    const client = this.client();
    const entry = this.channels.get(table) ?? { channel: null as unknown as RealtimeChannel, listeners: new Set<() => void>() };
    entry.listeners.add(onChange);
    if (!entry.channel) {
      entry.channel = client
        .channel(`table:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          entry.listeners.forEach((listener) => listener());
        })
        .subscribe();
      this.channels.set(table, entry);
    }
    return () => {
      entry.listeners.delete(onChange);
      if (entry.listeners.size === 0 && entry.channel) {
        void client.removeChannel(entry.channel);
        this.channels.delete(table);
      }
    };
  }

  /** Alimente le cache IndexedDB pour la lecture hors ligne. */
  private async cacheRows(table: string, rows: Row[]) {
    if (rows.length === 0) return;
    const db = getDatabase();
    await db.rows.bulkPut(
      rows.map((data) => ({
        key: rowKey(table, data),
        table,
        householdId: String(data.household_id ?? ''),
        data,
        updatedAt: Date.now(),
      })),
    );
  }
}

export const householdScopedTables = HOUSEHOLD_SCOPED;

/** Applique un `RowFilter` en mémoire sur une ligne du cache (repli D-01). */
function matchesRow(row: Row, filter: RowFilter): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined) return true;
    if (value === null) return row[key] === null;
    if (Array.isArray(value)) return (value as readonly unknown[]).includes(row[key]);
    return row[key] === value;
  });
}
