import type { Row, RowFilter } from '@/types';
import { flushWithAdapter, type ReplayTarget } from './sync-queue';

/**
 * Synchro foyer complet (D-08) : orchestration au-dessus des chemins éprouvés,
 * jamais un nouveau protocole.
 *
 * - Rejeu : `flushWithAdapter` (09-01) d'abord — le serveur gagne, puis on
 *   recharge. Aucun second chemin de rejeu.
 * - Lecture : les mêmes appels `adapter.list` que la navigation fait déjà
 *   (donc le même remplissage Dexie via `cacheRows`, et le même repli D-01).
 * - Chaque table est lue séquentiellement (pas d'éventail parallèle — T-09-05)
 *   dans son propre try/catch : l'échec d'une table n'arrête jamais les autres.
 */

/** Une table lue en passe 1, avec le filtre exact que l'app utilise déjà. */
export interface FullSyncEntry {
  table: string;
  filter: (householdId: string) => RowFilter;
  /**
   * Raison documentée quand le filtre n'est pas `{ household_id }` : la
   * synchro rejoue l'appel réel, pas un filtre deviné.
   */
  note?: string;
}

const byHousehold = (householdId: string): RowFilter => ({ household_id: householdId });

/**
 * Registre audité des tables lisibles en cache (D-08). Source : les appels
 * `useResource` / `data.list` réellement émis par les modules (audit
 * 2026-10-09 sur `app/src`), croisés avec les migrations (chaque table
 * ci-dessous existe et porte `household_id`, sauf mention `note`).
 */
export const FULL_SYNC_TABLES: FullSyncEntry[] = [
  // Racine : lue par `id` (session-store), pas par `household_id`.
  { table: 'households', filter: (householdId) => ({ id: householdId }), note: 'racine du tenant, lue par id' },
  { table: 'household_members', filter: byHousehold },
  // Courses
  { table: 'shopping_lists', filter: byHousehold },
  { table: 'shopping_list_items', filter: byHousehold },
  { table: 'products', filter: byHousehold },
  // Calendrier
  { table: 'events', filter: byHousehold },
  { table: 'event_reminders', filter: byHousehold },
  { table: 'event_categories', filter: byHousehold },
  { table: 'event_calendars', filter: byHousehold },
  // Notes
  { table: 'notes', filter: byHousehold },
  { table: 'note_folders', filter: byHousehold },
  { table: 'note_attachments', filter: byHousehold },
  // Tâches
  { table: 'tasks', filter: byHousehold },
  { table: 'task_lists', filter: byHousehold },
  { table: 'task_assignees', filter: byHousehold },
  { table: 'task_reminders', filter: byHousehold },
  // Routines
  { table: 'routines', filter: byHousehold },
  { table: 'routine_folders', filter: byHousehold },
  { table: 'routine_assignees', filter: byHousehold },
  { table: 'routine_reminders', filter: byHousehold },
  { table: 'routine_completions', filter: byHousehold },
  // Recettes
  { table: 'recipes', filter: byHousehold },
  // Ardoise (les écritures restent transactionnelles côté RPC — voir exclus ;
  // les lectures, elles, passent par `data.list` comme partout ailleurs)
  { table: 'ardoises', filter: byHousehold },
  { table: 'expenses', filter: byHousehold },
  { table: 'expense_participants', filter: byHousehold },
  // Cadeaux / contacts (la vue masque `reserved_by` au propriétaire — 0080 ;
  // l'UI ne lit JAMAIS la table brute pour afficher)
  { table: 'gift_lists', filter: byHousehold },
  {
    table: 'gift_items_for_list',
    filter: byHousehold,
    note: 'vue (0080), même appel que fetchCadeauxSnapshot ; les écritures passent par gift_items',
  },
  {
    table: 'gift_list_shares',
    filter: () => ({}),
    note: 'même appel non filtré que fetchCadeauxSnapshot (cadré par la RLS, parts inter-foyers comprises)',
  },
  { table: 'gift_ideas', filter: byHousehold },
  { table: 'contact_lists', filter: byHousehold },
  { table: 'contacts', filter: byHousehold },
  // Anniversaires
  { table: 'birthdays', filter: byHousehold },
  // Animaux
  { table: 'pets', filter: byHousehold },
  { table: 'pet_records', filter: byHousehold },
  { table: 'pet_attachments', filter: byHousehold },
  // Prestataires
  { table: 'provider_types', filter: byHousehold },
  { table: 'providers', filter: byHousehold },
  { table: 'provider_attachments', filter: byHousehold },
  // Fidélité
  { table: 'loyalty_cards', filter: byHousehold },
  // Adresses
  { table: 'places', filter: byHousehold },
  // Cercle
  { table: 'posts', filter: byHousehold },
  { table: 'post_media', filter: byHousehold },
  { table: 'post_comments', filter: byHousehold },
  { table: 'post_reactions', filter: byHousehold },
  // Voyages
  { table: 'trips', filter: byHousehold },
  // Messages
  { table: 'conversations', filter: byHousehold },
  { table: 'conversation_members', filter: byHousehold },
  { table: 'messages', filter: byHousehold },
  // Widgets
  { table: 'dashboard_widgets', filter: byHousehold },
  // Lectures de notifications : personnelles, sans `household_id` — même appel
  // non filtré que `useSyncedReads` (cadré par la RLS au seul utilisateur).
  {
    table: 'notification_reads',
    filter: () => ({}),
    note: 'personnel, sans household_id — même appel non filtré que useSyncedReads',
  },
];

/**
 * Tables explicitement EXCLUES, avec la raison enregistrée (D-08 : les lectures
 * RPC/Edge restent en ligne uniquement).
 */
export const FULL_SYNC_EXCLUDED: { table: string; reason: string }[] = [
  {
    table: 'household_invite_tokens',
    reason: 'jamais lisible par le client (AGENTS.md §2.6) : création, régénération et usage via opérations serveur uniquement',
  },
  {
    table: 'gift_list_invites',
    reason: 'sans politique RLS (0079) : lisible uniquement via les RPC service_role appelés par l’Edge gift-list-invite',
  },
  {
    table: 'profiles',
    reason: 'globale et personnelle (lue par id utilisateur pour les préférences) : pas une donnée du foyer, reste paresseuse',
  },
  {
    table: 'gift_items',
    reason: 'table brute jamais lue pour afficher (voir gift_items_for_list) : les écritures y passent, la synchro lit la vue',
  },
  {
    table: 'invitations',
    reason: 'partages ciblées via les Edge household-invitation / ardoise-invitation : jamais lues en direct par l’app',
  },
];

/**
 * Tables enfants sans `household_id`, lues en passe 2 par identifiants parents
 * collectés en passe 1 — toujours via `adapter.list`, jamais un nouveau chemin.
 */
export interface FullSyncChildEntry {
  table: string;
  parentTable: string;
  filterKey: string;
}

export const FULL_SYNC_CHILD_TABLES: FullSyncChildEntry[] = [
  { table: 'ardoise_members', parentTable: 'ardoises', filterKey: 'ardoise_id' },
  { table: 'ardoise_guests', parentTable: 'ardoises', filterKey: 'ardoise_id' },
];

export interface FullSyncProgress {
  done: number;
  total: number;
  table: string;
}

export interface FullSyncTableFailure {
  table: string;
  message: string;
}

export interface FullSyncReport {
  /** Mutations rejouées avant le rechargement (file d’abord — le serveur gagne). */
  replayed: number;
  replayFailed: number;
  /** Tables rechargées avec succès, dans l’ordre du registre. */
  synced: string[];
  /** Une table en échec n’arrête jamais les autres (isolation par table). */
  failed: FullSyncTableFailure[];
  /** Enfants sans objet (aucun parent, ou parent en échec) : sautés, pas en échec. */
  skipped: string[];
}

/** Adaptateur minimal : lecture + cible de rejeu (le `DataAdapter` convient tel quel). */
export type FullSyncAdapter = ReplayTarget & {
  list<T = Row>(table: string, filter?: RowFilter): Promise<T[]>;
};

/**
 * Synchro foyer : rejoue la file, puis recharge chaque table du registre.
 * Ne lève jamais pour une table en échec (rapport), seulement en cas de
 * catastrophe (adaptateur inutilisable).
 */
export async function syncHousehold(
  adapter: FullSyncAdapter,
  householdId: string,
  onProgress: (progress: FullSyncProgress) => void = () => {},
): Promise<FullSyncReport> {
  // File d’abord (09-01) : le serveur gagne, puis on recharge.
  const flush = await flushWithAdapter(adapter);

  const synced: string[] = [];
  const failed: FullSyncTableFailure[] = [];
  const skipped: string[] = [];
  const parentIds = new Map<string, string[]>();
  const childParents = new Set(FULL_SYNC_CHILD_TABLES.map((child) => child.parentTable));
  let done = 0;

  for (const entry of FULL_SYNC_TABLES) {
    try {
      const rows = await adapter.list<Row>(entry.table, entry.filter(householdId));
      synced.push(entry.table);
      if (childParents.has(entry.table)) {
        parentIds.set(
          entry.table,
          rows.map((row) => row.id).filter((id): id is string => typeof id === 'string'),
        );
      }
    } catch (error) {
      failed.push({ table: entry.table, message: error instanceof Error ? error.message : 'Lecture impossible.' });
    }
    done += 1;
    // Passe 1 : le total des enfants est encore inconnu (il dépend des lignes
    // lues) — la passe 2 continue le compteur sur le total final.
    onProgress({ done, total: FULL_SYNC_TABLES.length, table: entry.table });
  }

  const childRuns = FULL_SYNC_CHILD_TABLES.flatMap((child) => {
    const ids = parentIds.get(child.parentTable);
    if (ids === undefined) {
      skipped.push(`${child.table} (parent ${child.parentTable} en échec)`);
      return [];
    }
    if (ids.length === 0) {
      skipped.push(`${child.table} (aucun parent)`);
      return [];
    }
    return [{ child, ids }];
  });
  const total = FULL_SYNC_TABLES.length + childRuns.length;

  for (const { child, ids } of childRuns) {
    try {
      await adapter.list<Row>(child.table, { [child.filterKey]: ids });
      synced.push(child.table);
    } catch (error) {
      failed.push({ table: child.table, message: error instanceof Error ? error.message : 'Lecture impossible.' });
    }
    done += 1;
    onProgress({ done, total, table: child.table });
  }

  return { replayed: flush.replayed, replayFailed: flush.failed, synced, failed, skipped };
}
