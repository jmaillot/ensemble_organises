import { describe, expect, it } from 'vitest';
import type { Row, RowFilter } from '@/types';
import { enqueueMutation, pendingCount } from './sync-queue';
import {
  FULL_SYNC_CHILD_TABLES,
  FULL_SYNC_EXCLUDED,
  FULL_SYNC_TABLES,
  syncHousehold,
  type FullSyncProgress,
} from './full-sync';

/**
 * Double d’adaptateur : enregistre l’ordre exact des appels et échoue sur
 * demande par table. Aucun réseau, aucune Supabase — seule l’orchestration
 * (ordre file-d’abord, isolation, progression) est prouvée ici.
 */
class StubAdapter {
  calls: string[] = [];
  failures = new Set<string>();
  rows = new Map<string, Row[]>();
  lastFilters = new Map<string, RowFilter | undefined>();

  fail(table: string) {
    this.failures.add(table);
    return this;
  }

  seed(table: string, rows: Row[]) {
    this.rows.set(table, rows);
    return this;
  }

  async list<T = Row>(table: string, filter?: RowFilter): Promise<T[]> {
    this.calls.push(`list:${table}`);
    this.lastFilters.set(table, filter);
    if (this.failures.has(table)) throw new Error(`boom ${table}`);
    return ((this.rows.get(table) ?? []) as T[]).map((row) => ({ ...row }));
  }

  async create(table: string, values: Record<string, unknown>): Promise<Row> {
    this.calls.push(`create:${table}`);
    if (this.failures.has(table)) throw new Error(`boom ${table}`);
    return values as Row;
  }

  async update(table: string, id: string, _values: Record<string, unknown>): Promise<Row> {
    this.calls.push(`update:${table}:${id}`);
    if (this.failures.has(table)) throw new Error(`boom ${table}`);
    return { id } as Row;
  }

  async remove(table: string, id: string): Promise<void> {
    this.calls.push(`remove:${table}:${id}`);
    if (this.failures.has(table)) throw new Error(`boom ${table}`);
  }

  async removeWhere(table: string, _filter: RowFilter): Promise<void> {
    this.calls.push(`removeWhere:${table}`);
    if (this.failures.has(table)) throw new Error(`boom ${table}`);
  }
}

const AUDITED_TABLES = [
  'households',
  'household_members',
  'shopping_lists',
  'shopping_list_items',
  'products',
  'events',
  'event_reminders',
  'event_categories',
  'event_calendars',
  'notes',
  'note_folders',
  'note_attachments',
  'tasks',
  'task_lists',
  'task_assignees',
  'task_reminders',
  'routines',
  'routine_folders',
  'routine_assignees',
  'routine_reminders',
  'routine_completions',
  'recipes',
  'ardoises',
  'expenses',
  'expense_participants',
  'gift_lists',
  'gift_items_for_list',
  'gift_list_shares',
  'gift_ideas',
  'contact_lists',
  'contacts',
  'birthdays',
  'pets',
  'pet_records',
  'pet_attachments',
  'provider_types',
  'providers',
  'provider_attachments',
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
  'notification_reads',
];

describe('synchro foyer complet (D-08)', () => {
  it('le registre couvre les tables auditées, rien de adossé aux RPC', () => {
    const registered = FULL_SYNC_TABLES.map((entry) => entry.table);
    for (const table of AUDITED_TABLES) {
      expect(registered, `table auditée manquante : ${table}`).toContain(table);
    }
    expect(registered).toHaveLength(AUDITED_TABLES.length);
    for (const rpcBacked of ['household_invite_tokens', 'gift_list_invites', 'profiles']) {
      expect(registered, `${rpcBacked} ne doit jamais être préchargée`).not.toContain(rpcBacked);
    }
    const excluded = FULL_SYNC_EXCLUDED.map((entry) => entry.table);
    for (const rpcBacked of ['household_invite_tokens', 'gift_list_invites', 'profiles']) {
      expect(excluded, `${rpcBacked} doit être exclue avec sa raison`).toContain(rpcBacked);
    }
    for (const entry of FULL_SYNC_EXCLUDED) {
      expect(entry.reason.length, `raison manquante pour ${entry.table}`).toBeGreaterThan(0);
    }
  });

  it('la progression suit l’ordre du registre, compteur monotone', async () => {
    const adapter = new StubAdapter();
    const events: FullSyncProgress[] = [];

    const report = await syncHousehold(adapter, 'foyer-a', (progress) => events.push(progress));

    expect(report.failed).toEqual([]);
    expect(events.map((event) => event.table)).toEqual([
      ...FULL_SYNC_TABLES.map((entry) => entry.table),
      // Aucun parent (aucune ardoise) : les enfants sont sautés, sans événement.
    ]);
    events.forEach((event, index) => {
      expect(event.done).toBe(index + 1);
    });
    // Filtres exacts des appels réels : foyer cadré, vue cadeaux cadrée.
    expect(adapter.lastFilters.get('tasks')).toEqual({ household_id: 'foyer-a' });
    expect(adapter.lastFilters.get('gift_items_for_list')).toEqual({ household_id: 'foyer-a' });
    expect(adapter.lastFilters.get('households')).toEqual({ id: 'foyer-a' });
  });

  it('une table en échec n’arrête jamais les autres', async () => {
    const adapter = new StubAdapter().fail('tasks');
    const events: FullSyncProgress[] = [];

    const report = await syncHousehold(adapter, 'foyer-a', (progress) => events.push(progress));

    expect(report.failed).toEqual([{ table: 'tasks', message: 'boom tasks' }]);
    expect(report.synced).not.toContain('tasks');
    // Les voisines sont quand même rechargées, dans l’ordre.
    expect(report.synced).toContain('task_assignees');
    expect(report.synced).toContain('notes');
    expect(events).toHaveLength(FULL_SYNC_TABLES.length);
    expect(events.map((event) => event.table)).toContain('routines');
  });

  it('la file est rejouée avant le rechargement (le serveur gagne)', async () => {
    await enqueueMutation({ table: 'tasks', operation: 'update', rowId: 't1', values: { name: 'x' } });
    const adapter = new StubAdapter();

    const report = await syncHousehold(adapter, 'foyer-a');

    expect(report.replayed).toBe(1);
    expect(report.replayFailed).toBe(0);
    expect(await pendingCount()).toBe(0);
    const firstList = adapter.calls.findIndex((call) => call.startsWith('list:'));
    const replay = adapter.calls.findIndex((call) => call === 'update:tasks:t1');
    expect(replay).toBeGreaterThanOrEqual(0);
    expect(replay).toBeLessThan(firstList);
  });

  it('les enfants sans household_id suivent les parents lus en passe 1', async () => {
    const adapter = new StubAdapter().seed('ardoises', [{ id: 'a1', household_id: 'foyer-a' } as Row]);

    const report = await syncHousehold(adapter, 'foyer-a');

    expect(report.synced).toContain('ardoise_members');
    expect(report.synced).toContain('ardoise_guests');
    expect(adapter.lastFilters.get('ardoise_members')).toEqual({ ardoise_id: ['a1'] });
    expect(adapter.lastFilters.get('ardoise_guests')).toEqual({ ardoise_id: ['a1'] });
    expect(report.skipped).toEqual([]);
  });

  it('un parent en échec fait sauter ses enfants, sans les compter en échec', async () => {
    const adapter = new StubAdapter().fail('ardoises');

    const report = await syncHousehold(adapter, 'foyer-a');

    expect(report.failed.map((failure) => failure.table)).toEqual(['ardoises']);
    expect(report.skipped).toContain('ardoise_members (parent ardoises en échec)');
    expect(report.skipped).toContain('ardoise_guests (parent ardoises en échec)');
    expect(adapter.calls.some((call) => call === 'list:ardoise_members')).toBe(false);
  });

  it('les enfants déclarent leur parent et leur clé de filtre', () => {
    expect(FULL_SYNC_CHILD_TABLES).toEqual([
      { table: 'ardoise_members', parentTable: 'ardoises', filterKey: 'ardoise_id' },
      { table: 'ardoise_guests', parentTable: 'ardoises', filterKey: 'ardoise_id' },
    ]);
  });
});
