import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { DataError, type DataAdapter } from './adapter';
import { getDatabase } from './dexie';
import { enqueueMutation } from './sync-queue';
import { isKeylessTable, rowKey } from './keys';
import { randomId } from '@/lib/utils';
import type { Row, RowFilter } from '@/types';

/** Tables dont l'accès passe par la colonne `household_id`. */
const HOUSEHOLD_SCOPED = new Set([
  'households',
  'household_members',
  'shopping_lists',
  'shopping_list_items',
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
  'external_participants',
  'gift_lists',
  'gift_items',
  'gift_list_shares',
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
    const client = this.client();
    let query = client.from(table).select('*');
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (value === null) query = query.is(key, null);
      else if (Array.isArray(value)) query = query.in(key, value as string[]);
      else query = query.eq(key, value);
    }
    const { data: rows, error } = await query;
    if (error) throw new DataError(error.message, error);
    await this.cacheRows(table, (rows ?? []) as Row[]);
    return (rows ?? []) as T[];
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

  async update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T> {
    const client = this.client();
    const { data: row, error } = await client.from(table).update(values as never).eq('id', id).select('*').single();
    if (error) throw this.queueOrFail(table, 'update', id, values as Record<string, unknown>, error);
    return row as T;
  }

  async remove(table: string, id: string) {
    const client = this.client();
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw this.queueOrFail(table, 'delete', id, {}, error);
    await getDatabase().rows.delete(rowKey(table, { id }));
  }

  /**
   * Hors ligne, l'écriture est conservée dans la file de synchronisation et
   * rejouée à la reconnexion ; sinon l'erreur remonte à l'UI.
   */
  private queueOrFail(
    table: string,
    operation: 'insert' | 'update' | 'delete',
    rowId: string,
    values: Record<string, unknown>,
    error: { message: string } | null,
  ) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline) {
      void enqueueMutation({ table, operation, rowId, values });
      return new DataError('Hors ligne : la modification sera synchronisée au retour du réseau.', error);
    }
    return new DataError(error?.message ?? 'Écriture refusée.', error);
  }

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
    if (error) throw new DataError(error.message, error);
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
