import type { QueryClient } from '@tanstack/react-query';
import { data, type DataAdapter } from '@/lib/data';
import { isKeylessTable } from '@/lib/data/keys';
import { classifyFailure, outboxKeyFor, type OutboxEntry } from './outbox';

/**
 * Moteur de rejeu de la file d'écriture hors-ligne (phase 34, WRQ-02/04/06).
 *
 * POURQUOI SÉQUENTIEL, JAMAIS `Promise.all` (D-09). L'ordre des écritures
 * porte le sens (un create avant son update, une écriture avant la suivante
 * de la même entité) et le compteur « N en attente » (D-13) doit descendre
 * de façon lisible pendant le rejeu. Un envoi parallèle brouillerait les
 * deux — et un échec du milieu de vol ne laisserait aucune garantie sur ce
 * qui est parti.
 *
 * POURQUOI L'UPSERT, PAS UN CREATE (D-14). La contrainte unique
 * `(household_id, client_key)` posée par la migration 0177 est le contrat
 * d'idempotence : rejouer une entrée déjà appliquée fusionne au lieu de
 * dupliquer. « Exactement une fois » = « au plus une fois par rejeu » côté
 * client + « fusion » côté base — jamais un comptage.
 *
 * POURQUOI AUCUNE PRÉ-LECTURE AVANT UN `remove` (Pitfall 3). Un delete
 * refusé par RLS et un delete d'une ligne déjà absente sont
 * indistinguables par HTTP (0 lignes, erreur nulle) ; lire avant pour
 * trancher serait une course. On envoie, et le 0-lignes lève
 * REMOVE_*_MISSING : c'est la matière de la classification terminale.
 */

/** Résultat d'une passe de rejeu (compteurs dérivés, D-13 : jamais stockés). */
export interface ReplayResult {
  /** Entrées appliquées avec succès (retirées de la file). */
  applied: number;
  /** Entrées classées terminales (status 'failed', visibles, jamais rejouées). */
  failed: number;
}

/**
 * Garde anti-parallélisme : les déclencheurs D-08 (online + visibilitychange
 * + montage) peuvent se rapprocher à la milliseconde. Une seconde passe
 * lancée pendant la première rejouerait des entrées déjà en vol — l'ordre
 * D-09 et l'exactitude du comptage l'exigent. Les déclencheurs suivants ne
 * font rien : la passe en cours couvre déjà la file.
 */
let inFlight = false;

export async function replayOutbox(
  client: QueryClient,
  userId: string,
  householdId: string,
  adapter: DataAdapter = data,
): Promise<ReplayResult> {
  if (inFlight) return { applied: 0, failed: 0 };
  inFlight = true;
  try {
    const key = outboxKeyFor(userId, householdId);
    const entries = client.getQueryData<OutboxEntry[]>(key) ?? [];
    // NO-OP EXPLICITE (§2.7 F : un succès muet est un échec inexpliqué) —
    // file vide = rien à rejouer, zéro appel d'adaptateur, prouvé par test.
    const pending = entries.filter((entry) => entry.status === 'pending');
    if (pending.length === 0) return { applied: 0, failed: 0 };

    // D-09 : creates D'ABORD, puis updates, puis suppressions ; dans chaque
    // groupe, l'ordre d'enfilage global (enqueuedAt croissant). La fusion
    // D-04 garantit une écriture pendante par entité, donc l'ordre de groupe
    // suffit à respecter les dépendances naturelles.
    const groupRank: Record<OutboxEntry['operation'], number> = { create: 0, update: 1, remove: 2, removeWhere: 2 };
    const ordered = [...pending].sort(
      (a, b) => groupRank[a.operation] - groupRank[b.operation] || a.enqueuedAt - b.enqueuedAt,
    );

    let applied = 0;
    let failed = 0;

    for (const entry of ordered) {
      try {
        await replayEntry(adapter, entry);
      } catch (error) {
        const classification = classifyFailure(error);
        if (classification.kind === 'retryable') {
          // Réseau/5xx : l'entrée reste 'pending' TELLE QUELLE — les passes
          // suivantes (prochain déclencheur D-08) la retenteront. La passe
          // s'arrête proprement : les écritures suivantes peuvent en
          // dépendre, et marteler un serveur injoignable ne sert rien.
          return { applied, failed };
        }
        // TERMINAL (refus RLS 42501, check 23514, ligne absente REMOVE_*,
        // Pitfall 3) : l'entrée RESTE en file mais passe à 'failed' —
        // jamais rejouée automatiquement (replayOutbox ne lit que
        // 'pending' : la boucle est structurellement impossible), jamais
        // effacée en silence (D-11/D-12 : le surfacage et l'action
        // Réessayer/Abandonner viennent du panneau, plan 04).
        failed += 1;
        markFailed(client, key, entry, classification);
        continue;
      }
      // Succès : l'entrée QUITTE la file ET la table est invalidée — moitié
      // client de la réconciliation D-16 (l'autre moitié : l'overlay du
      // plan 02 porte déjà l'id + le client_key du row serveur). Le serveur
      // prime toujours sur l'optimiste, jamais de doublon ni de flash.
      applied += 1;
      client.setQueryData<OutboxEntry[]>(key, (current) => (current ?? []).filter((candidate) => candidate !== entry));
      void client.invalidateQueries({ queryKey: [entry.table] });
    }
    return { applied, failed };
  } finally {
    inFlight = false;
  }
}

/**
 * Action « Réessayer » du panneau offline (D-11, plan 04). L'entrée passe à
 * `pending` UNE fois — sur une action utilisateur EXPLICITE (T-34-10 : le
 * rejeu automatique ne lit que 'pending' déjà là, jamais une entrée failed ;
 * ici c'est l'inverse, un humain a tranché) — puis une passe de rejeu
 * complète est déclenchée : d'autres entrées pendantes peuvent attendre
 * derrière, la passe FIFO (D-09) les couvre gratuitement.
 *
 * Ici et pas dans `outbox.ts` : `retryOutboxEntry` appelle `replayOutbox`,
 * et importer `outbox-replay` depuis `outbox.ts` créerait un cycle de
 * modules (outbox-replay importe déjà `./outbox`).
 */
export async function retryOutboxEntry(
  client: QueryClient,
  userId: string,
  householdId: string,
  entry: OutboxEntry,
): Promise<ReplayResult> {
  const key = outboxKeyFor(userId, householdId);
  client.setQueryData<OutboxEntry[]>(key, (current) =>
    (current ?? []).map((candidate) =>
      candidate === entry ? { ...entry, status: 'pending' as const, failure: undefined } : candidate,
    ),
  );
  return replayOutbox(client, userId, householdId);
}

/**
 * Rejoue UNE entrée par les méthodes typées de l'adaptateur — JAMAIS de SQL
 * construit ni de requête brute : le payload de la file (persistée côté
 * client) ne peut toucher le serveur qu'à travers le contrat `DataAdapter`,
 * et la RLS reste la frontière finale (T-34-06).
 */
async function replayEntry(adapter: DataAdapter, entry: OutboxEntry): Promise<void> {
  const { table, operation } = entry;
  if (operation === 'create') {
    // Les tables de jointure sans `id` (task_assignees…) portent client_key
    // SANS household_id : leur cible d'unicité 0178 est `client_key` seul.
    const onConflict = isKeylessTable(table) ? 'client_key' : 'household_id,client_key';
    const payload: Record<string, unknown> = { ...entry.values };
    if (entry.id !== undefined) payload.id = entry.id;
    if (entry.clientKey !== undefined) payload.client_key = entry.clientKey;
    await adapter.upsert(table, payload, { onConflict });
    return;
  }
  if (operation === 'update') {
    // L'update est naturellement idempotent (même id) ; client_key est
    // porté pour satisfaire la contrainte NOT NULL posée par 0177.
    const payload: Record<string, unknown> = { ...entry.values };
    if (entry.clientKey !== undefined) payload.client_key = entry.clientKey;
    await adapter.update(table, entry.id ?? '', payload);
    return;
  }
  if (operation === 'remove') {
    // PAS de `{ ifMissing: 'ignore' }` : le 0-lignes doit rester VISIBLE
    // pour la classification — un delete refusé par RLS et un delete d'une
    // ligne déjà partie lèvent le même REMOVE_MISSING (Pitfall 3, terminal
    // dans les deux cas). Ignorer ici effacerait le refus en silence.
    await adapter.remove(table, entry.id ?? '');
    return;
  }
  await adapter.removeWhere(table, entry.filter as never);
}

/** Passe une entrée à `status: 'failed'` avec sa classification (D-10). */
function markFailed(
  client: QueryClient,
  key: readonly unknown[],
  entry: OutboxEntry,
  failure: { kind: 'terminal'; code: string; message: string },
): void {
  client.setQueryData<OutboxEntry[]>(key, (current) =>
    (current ?? []).map((candidate) => (candidate === entry ? { ...entry, status: 'failed', failure } : candidate)),
  );
}
