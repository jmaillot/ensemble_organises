import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { DataError, REMOVE_MISSING_MESSAGE, REMOVE_WHERE_MISSING_MESSAGE, type DataAdapter, type RemoveOptions } from './adapter';
import { isKeylessTable } from './keys';
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

  /**
   * Lecture directe : toute erreur (réseau, droits, validation) remonte
   * telle quelle à l'appelant — aucun repli, aucun cache, aucune file
   * (retrait du mode offline D-10 : le backend répond ou l'erreur d'origine
   * s'affiche).
   */
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
    return (rows ?? []) as T[];
  }

  async create<T = Row>(table: string, values: Partial<T>): Promise<T> {
    const client = this.client();
    const givenId = (values as { id?: string }).id;
    const payload = isKeylessTable(table) ? { ...values } : { ...values, id: givenId ?? randomId(table) };
    const { data: row, error } = await client.from(table).insert(payload as never).select('*').single();
    if (error) throw new DataError(error.message, error);
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
    return { household, member };
  }

  async update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T> {
    const client = this.client();
    const { data: row, error } = await client.from(table).update(values as never).eq('id', id).select('*').single();
    if (error) throw new DataError(error.message, error);
    return row as T;
  }

  /**
   * Suppression d'une ligne avec **représentation** : `.select()` demande les
   * lignes réellement retirées, et c'est ce compte qui rend le refus visible.
   * Sans lui, PostgREST répond 204 que 0 ou N lignes soient parties, et un
   * refus RLS (`*_delete_admin` pour un membre) se présente comme un succès
   * (WR-01). On ne demande pas `count: 'exact'` : c'est la représentation qui
   * compte, et une seconde requête de comptage serait une fenêtre de course.
   */
  async remove(table: string, id: string, options?: RemoveOptions) {
    const client = this.client();
    const { data: removed, error } = await client.from(table).delete().eq('id', id).select();
    if (error) throw new DataError(error.message, error);
    if ((removed ?? []).length === 0 && options?.ifMissing !== 'ignore') {
      throw new DataError(REMOVE_MISSING_MESSAGE, { table, id });
    }
  }

  /**
   * Jointures (lignes sans `id`) : suppression par filtre, comptée comme
   * `remove`. `.select()` est appelé **sans** nom de colonne : la table peut
   * ne pas porter d'`id`, et un `select('id')` y échouerait.
   */
  async removeWhere(table: string, filter: RowFilter, options?: RemoveOptions) {
    const client = this.client();
    let query = client.from(table).delete();
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (value === null) query = query.is(key, null);
      else if (Array.isArray(value)) query = query.in(key, value as string[]);
      else query = query.eq(key, value);
    }
    const { data: removed, error } = await query.select();
    if (error) throw new DataError(error.message, error);
    if ((removed ?? []).length === 0 && options?.ifMissing !== 'ignore') {
      throw new DataError(REMOVE_WHERE_MISSING_MESSAGE, { table, filter });
    }
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
}

export const householdScopedTables = HOUSEHOLD_SCOPED;
