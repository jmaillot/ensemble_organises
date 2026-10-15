import { getDatabase, type StoredRow } from './dexie';
import { seedRows, DEMO_HOUSEHOLD_ID } from './seed';
import { DataError, REMOVE_MISSING_MESSAGE, REMOVE_WHERE_MISSING_MESSAGE, type DataAdapter, type RemoveOptions } from './adapter';
import { isKeylessTable, rowKey } from './keys';
import { randomId } from '@/lib/utils';
import type { Row, RowFilter } from '@/types';

/**
 * Adaptateur local : IndexedDB via Dexie. Il permet à l'application de
 * fonctionner sans backend configuré (démo, tests). Depuis le retrait du
 * mode offline données (D-10), le mode Supabase ne lit plus ce cache :
 * chaque lecture part directement au backend.
 */

export class LocalAdapter implements DataAdapter {
  readonly kind = 'local' as const;

  private listeners = new Map<string, Set<() => void>>();
  /** Tables déjà vérifiées : évite de recontrôler le cache à chaque lecture. */
  private seededTables = new Set<string>();

  /** À appeler après un vidage du cache (tests, « effacer les données »). */
  invalidateSeedCache() {
    this.seededTables.clear();
    this.seedPromise = null;
  }

  /**
   * Amorce en cours partagé : N lectures concurrentes au montage (une page
   * ouvre ~10 requêtes d'un coup) ne doivent amorcer qu'une seule fois, sinon
   * les N parcours séquentiels des tables se sérialisent dans IndexedDB et le
   * montage dépasse le budget des `findBy*` (constaté : ~1 s à 10 concurrents
   * contre ~40 ms en série sur le moteur simulé des tests).
   */
  private seedPromise: Promise<void> | null = null;

  private ensureSeeded(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.seedNow().catch((error: unknown) => {
        this.seedPromise = null;
        throw error;
      });
    }
    return this.seedPromise;
  }

  /**
   * Amorce le jeu de démonstration table par table. Le contrôle est global
   * pour chaque table et non sur le total : une écriture tardive (ou un cache
   * partiellement vidé) ne peut pas empêcher le ré-amorçage des autres tables.
   */
  private async seedNow() {
    const db = getDatabase();
    const entries: StoredRow[] = [];
    for (const [table, rows] of Object.entries(seedRows())) {
      if (this.seededTables.has(table)) continue;
      const already = await db.rows.where('table').equals(table).count();
      this.seededTables.add(table);
      if (already > 0) continue;
      for (const data of rows) {
        entries.push({
          key: rowKey(table, data),
          table,
          householdId: String(data.household_id ?? DEMO_HOUSEHOLD_ID),
          data,
          updatedAt: Date.now(),
        });
      }
    }
    if (entries.length > 0) await db.rows.bulkPut(entries);
  }

  async list<T = Row>(table: string, filter: RowFilter = {}): Promise<T[]> {
    await this.ensureSeeded();
    const db = getDatabase();
    // `gift_items_for_list` (0080, T-05-03) n'existe qu'en base : en mode
    // local on sert la vue depuis le magasin `gift_items` (mêmes lignes,
    // mêmes colonnes). Le masquage `reserved_by → NULL` au propriétaire est
    // une barrière serveur (vue `SECURITY INVOKER` + `current_member_id`) :
    // hors ligne, sans identité serveur, les lignes sont rendues telles
    // quelles — le repli d'affichage reste la conditionnelle JSX existante.
    const sourceTable = table === 'gift_items_for_list' ? 'gift_items' : table;
    const householdId = filter.household_id;
    const collection =
      typeof householdId === 'string'
        ? db.rows.where('[table+householdId]').equals([sourceTable, householdId])
        : db.rows.where('table').equals(sourceTable);
    const stored = await collection.toArray();
    const rows = stored.map((entry) => entry.data);
    return rows.filter((row) => matchesFilter(row, filter)) as T[];
  }

  async create<T = Row>(table: string, values: Partial<T>): Promise<T> {
    await this.ensureSeeded();
    const db = getDatabase();
    const id = isKeylessTable(table) ? undefined : ((values as { id?: string }).id ?? randomId(table));
    // Le schéma SQL pose `created_at` par défaut : on reproduit ce comportement
    // en mode local pour que les tris par date restent justes.
    const record = values as Record<string, unknown>;
    const row = {
      ...values,
      ...(id === undefined ? {} : { id }),
      created_at: record.created_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? record.created_at ?? new Date().toISOString(),
    } as unknown as T;
    const householdId = String((values as Record<string, unknown>).household_id ?? DEMO_HOUSEHOLD_ID);
    await db.rows.put({ key: rowKey(table, row as unknown as Row), table, householdId, data: row as unknown as Row, updatedAt: Date.now() });
    this.emit(table);
    return row;
  }

  /**
   * Symétrie du mode démo de `SupabaseAdapter.upsert` : la ligne est retrouvée
   * par les colonnes d'`onConflict` — jamais par la lecture de l'appelant, qui
   * peut être vide sans que la base le soit — puis fusionnée en conservant son
   * `id`. Sans cette symétrie, Dexie (ni contrainte unique ni `CHECK`) laisserait
   * coexister deux lignes pour un même couple et le défaut resterait invisible
   * en CI.
   */
  async upsert<T = Row>(table: string, values: Partial<T>, options: { onConflict: string }): Promise<T> {
    await this.ensureSeeded();
    const db = getDatabase();
    const columns = options.onConflict.split(',').map((column) => column.trim()).filter(Boolean);
    const record = values as Record<string, unknown>;
    const householdId = record.household_id;
    // Même mécanisme que `list` : l'index composite quand l'écriture porte son
    // foyer, l'index de table sinon.
    const collection =
      typeof householdId === 'string'
        ? db.rows.where('[table+householdId]').equals([table, householdId])
        : db.rows.where('table').equals(table);
    const entries = await collection.toArray();
    const existing = entries.find((entry) => columns.every((column) => entry.data[column] === record[column]));
    const id = existing?.data.id;
    // Aucune ligne ne porte la cible : c'est une création, avec sa clé et ses
    // horodatages, exactement comme `create`.
    if (!existing || typeof id !== 'string') return this.create<T>(table, values);
    const row = {
      ...existing.data,
      ...values,
      id,
      created_at: (existing.data.created_at as string | undefined) ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    } as unknown as T;
    await db.rows.put({ ...existing, data: row as unknown as Row, updatedAt: Date.now() });
    this.emit(table);
    return row;
  }

  /**
   * En mode local, la création d'un foyer passe par la même méthode que le
   * reste : il n'y a ni politique RLS ni transaction à outrepasser, et
   * l'adaptateur IndexedDB est lui-même atomique sur une écriture. Le contrat
   * impose la méthode pour que le code métier soit identique dans les deux
   * modes — c'est le client, et lui seul, qui choisit le chemin.
   */
  async createHousehold(values: {
    name: string;
    avatarColor: string;
    actor: { id: string; displayName: string | null; avatarUrl: string | null } | null;
  }): Promise<{ household: Row; member: Row }> {
    const household = await this.create<Row>('households', {
      name: values.name,
      avatar_color: values.avatarColor,
      created_by: values.actor?.id ?? null,
    });
    const member = await this.create<Row>('household_members', {
      household_id: household.id,
      user_id: values.actor?.id ?? null,
      display_name: values.actor?.displayName ?? 'Nouveau foyer',
      avatar_url: values.actor?.avatarUrl ?? null,
      color_tag: values.avatarColor,
      role: 'admin',
    });
    return { household, member };
  }

  async update<T = Row>(table: string, id: string, values: Partial<T>): Promise<T> {
    await this.ensureSeeded();
    const db = getDatabase();
    const key = rowKey(table, { id });
    const entry = await db.rows.get(key);
    if (!entry) throw new DataError(`Ligne introuvable : ${table}/${id}`);
    const record = values as Record<string, unknown>;
    const row = {
      ...entry.data,
      ...values,
      id,
      updated_at: record.updated_at ?? new Date().toISOString(),
    } as unknown as T;
    await db.rows.put({ ...entry, data: row as unknown as Row, updatedAt: Date.now() });
    this.emit(table);
    return row;
  }

  /**
   * Le mode démo doit se comporter comme le serveur : une ligne absente est
   * un échec bruyant, pas une réussite muette. Sans cette symétrie, le défaut
   * resterait invisible en CI — Vitest tourne en Dexie, sans RLS (constat
   * structurel de la phase).
   */
  async remove(table: string, id: string, options?: RemoveOptions) {
    await this.ensureSeeded();
    const db = getDatabase();
    const key = rowKey(table, { id });
    const existing = await db.rows.get(key);
    if (!existing && options?.ifMissing !== 'ignore') {
      throw new DataError(REMOVE_MISSING_MESSAGE, { table, id });
    }
    await db.rows.delete(key);
    this.emit(table);
  }

  /** Jointures : les lignes sont repérées par la valeur de leurs clés parentes. */
  async removeWhere(table: string, filter: RowFilter, options?: RemoveOptions) {
    await this.ensureSeeded();
    const db = getDatabase();
    const entries = await db.rows.where('table').equals(table).toArray();
    const targets = entries.filter((entry) => matchesFilter(entry.data, filter));
    if (targets.length === 0 && options?.ifMissing !== 'ignore') {
      throw new DataError(REMOVE_WHERE_MISSING_MESSAGE, { table, filter });
    }
    await db.rows.bulkDelete(targets.map((entry) => entry.key));
    this.emit(table);
  }

  subscribe(table: string, onChange: () => void) {
    const set = this.listeners.get(table) ?? new Set();
    set.add(onChange);
    this.listeners.set(table, set);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ table: string }>).detail;
      if (detail.table === table) onChange();
    };
    if (typeof window !== 'undefined') window.addEventListener('eo:data-change', handler);
    return () => {
      set.delete(onChange);
      if (typeof window !== 'undefined') window.removeEventListener('eo:data-change', handler);
    };
  }

  private emit(table: string) {
    this.listeners.get(table)?.forEach((listener) => listener());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eo:data-change', { detail: { table } }));
    }
  }
}

let sharedAdapter: LocalAdapter | null = null;

/** Adaptateur local partagé : un seul cache, une seule table d'amorçage. */
export function getLocalAdapter() {
  sharedAdapter ??= new LocalAdapter();
  return sharedAdapter;
}

function matchesFilter(row: Row, filter: RowFilter): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined) return true;
    if (Array.isArray(value)) return (value as readonly unknown[]).includes(row[key]);
    return row[key] === value;
  });
}
