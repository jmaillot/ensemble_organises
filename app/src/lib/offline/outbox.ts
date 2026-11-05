import type { QueryClient } from '@tanstack/react-query';
import { REMOVE_MISSING_MESSAGE, REMOVE_WHERE_MISSING_MESSAGE } from '@/lib/data/adapter';

/**
 * File d'écriture hors-ligne (outbox) — phase 34, WRQ-02.
 *
 * POURQUOI UNE QUERY, PAS UN STORE (D-01). La file est une query TanStack
 * dont `data` est la liste d'entrées : elle hérite GRATUITEMENT de la
 * persistance, du namespacing (utilisateur, foyer), de la purge et du
 * restore de la phase 33. Aucun stockage séparé, aucun Dexie (D-10 phase 33).
 * Toute mutation de la file passe par `queryClient.setQueryData` — jamais
 * d'état parallèle (D-03 : le comptage N est dérivé de la liste, jamais
 * stocké à part).
 *
 * POURQUOI L'ENFILAGE VIENT D'ONERROR, PAS DE LA REPRISE PAUSED (Pitfall 1).
 * Sous `networkMode: 'always'` (QUERY_POLICY), une écriture hors ligne ne se
 * met JAMAIS en pause : elle échoue. Le chemin officiel TanStack
 * (`setMutationDefaults` + `resumePausedMutations`) ne rejouerait donc jamais
 * rien ici — c'est le `MutationCache.onError` de `query-policy.ts` qui
 * appelle `enqueueOutbox` (D-02).
 */

/** Préfixe de la query outbox — la clé complète est `[...OUTBOX_KEY, userId, householdId]`. */
export const OUTBOX_KEY = ['outbox'] as const;

export function outboxKeyFor(userId: string, householdId: string) {
  return [...OUTBOX_KEY, userId, householdId] as const;
}

export type OutboxOperation = 'create' | 'update' | 'remove' | 'removeWhere';

/** Marque posée sur les mutations centralisées (`meta:`) — lue par le MutationCache. */
export interface MutationMarker {
  table: string;
  operation: OutboxOperation;
}

export interface OutboxEntry {
  /** Identité d'entité (`buildEntityKey`) : support de la fusion D-04. */
  key: string;
  table: string;
  operation: OutboxOperation;
  /** Pour create/update/remove sur une table à `id`. */
  id?: string;
  /** Pour removeWhere (tables de jointure) : le filtre EST l'identité. */
  filter?: Record<string, unknown>;
  /** Pour create/update : les valeurs finales à rejouer. */
  values?: Record<string, unknown>;
  /** uuid généré côté client (D-05/D-14) : clé d'idempotence du rejeu. */
  clientKey?: string;
  enqueuedAt: number;
  status: 'pending' | 'failed';
  failure?: { kind: 'terminal'; code: string; message: string };
}

export interface OutboxScope {
  userId: string;
  householdId: string;
}

/**
 * Portée de l'outbox : le couple (utilisateur, foyer) courant.
 *
 * POURQUOI UN FOURNISSEUR ET PAS UN IMPORT DE STORE. `query-policy.ts` (qui
 * installe le MutationCache) ne peut pas importer `session-store` :
 * session-store → household-store → query-persistence → query-policy serait
 * un cycle d'imports. Le store de session s'enregistre ici au chargement du
 * module (`setOutboxScopeProvider`) ; la portée est lue AU MOMENT de
 * l'enfilage, donc elle suit naturellement les changements de session et de
 * foyer sans notification.
 */
let scopeProvider: (() => OutboxScope | null) | null = null;

export function setOutboxScopeProvider(provider: (() => OutboxScope | null) | null): void {
  scopeProvider = provider;
}

/**
 * Clé d'identité d'une entité dans la file.
 *
 * - create/update/remove : `table:id` ;
 * - removeWhere (jointures, Pitfall 6) : `table#filtre sérialisé trié` — le
 *   filtre est la seule identité disponible, il doit être rejouable tel quel ;
 * - create SANS id (table de jointure allowlistée, ex. `task_assignees`) :
 *   `table#valeurs sérialisées` — deux assignations de membres différents ne
 *   fusionnent pas, deux fois la même fusionnent (D-04 reste correct).
 */
export function buildEntityKey(
  table: string,
  entry: { operation: OutboxOperation; id?: string; filter?: Record<string, unknown>; values?: Record<string, unknown> },
): string {
  if (entry.operation === 'removeWhere') return `${table}#${serializePairs(entry.filter ?? {})}`;
  if (!entry.id && entry.values) return `${table}#${serializePairs(withoutClientKey(entry.values))}`;
  return `${table}:${entry.id ?? ''}`;
}

function serializePairs(pairs: Record<string, unknown>): string {
  return Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? [...value].sort().join(',') : String(value)}`)
    .sort()
    .join('&');
}

function withoutClientKey(values: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...values };
  delete rest.client_key; // la clé d'idempotence ne fait pas partie de l'identité métier
  return rest;
}

function readClientKey(values: Record<string, unknown>): string | undefined {
  return typeof values.client_key === 'string' && values.client_key.length > 0 ? values.client_key : undefined;
}

/**
 * Enfile (ou fusionne/annule dans) la file du couple courant.
 *
 * L'entrée est construite depuis le marqueur `meta` de la mutation et ses
 * variables telles que transmises à `mutateAsync` — la forme exacte dépend de
 * l'opération (create/update : valeurs ; remove : id ; removeWhere : filtre).
 */
export function enqueueOutbox(client: QueryClient, marker: MutationMarker, variables: unknown): void {
  const scope = scopeProvider?.() ?? null;
  if (!scope) return; // pas de couple (utilisateur, foyer) établi : rien à enfiler
  const key = outboxKeyFor(scope.userId, scope.householdId);
  const entries = client.getQueryData<OutboxEntry[]>(key) ?? [];
  const incoming = buildEntry(marker, variables);

  if (incoming.operation === 'remove' || incoming.operation === 'removeWhere') {
    // D-05 annulation : le retrait d'une entité retire d'abord toute écriture
    // pendante la concernant — le serveur ne doit jamais voir un fantôme.
    const cancelled = entries.filter((entry) => entry.status === 'pending' && sameEntity(entry, incoming));
    if (cancelled.some((entry) => entry.operation === 'create')) {
      // Create puis delete hors-ligne = ZÉRO écriture : la ligne n'a jamais
      // existé côté serveur, lui envoyer le remove n'aurait aucun sens.
      client.setQueryData(key, entries.filter((entry) => !cancelled.includes(entry)));
      return;
    }
    client.setQueryData(key, [...entries.filter((entry) => !cancelled.includes(entry)), incoming]);
    return;
  }

  // D-04 fusion : la NOUVELLE écriture écrase la pendante de la même entité —
  // une écriture finale par entité, la dernière action locale gagne.
  client.setQueryData(key, [
    ...entries.filter(
      (entry) => !(entry.status === 'pending' && entry.table === incoming.table && entry.key === incoming.key),
    ),
    incoming,
  ]);
}

/**
 * Une entrée pendante concerne-t-elle l'entité que `removal` retire ?
 *
 * Pour un remove par id : même clé d'entité. Pour un removeWhere : toute
 * entrée dont les valeurs portent TOUTES les paires du filtre (ex. un create
 * `{ task_id, member_id }` est annulé par un removeWhere `{ task_id }`).
 */
function sameEntity(entry: OutboxEntry, removal: OutboxEntry): boolean {
  if (entry.table !== removal.table) return false;
  if (removal.operation === 'removeWhere') {
    if (!removal.filter) return false;
    if (entry.operation === 'removeWhere') return entry.key === removal.key;
    const source = entry.values ?? {};
    return Object.entries(removal.filter).every(([key, value]) => source[key] === value);
  }
  return entry.key === removal.key;
}

function buildEntry(marker: MutationMarker, variables: unknown): OutboxEntry {
  const { table, operation } = marker;
  const enqueuedAt = Date.now();
  if (operation === 'remove') {
    const id = typeof variables === 'string' ? variables : (variables as { id?: string } | null)?.id;
    return { key: buildEntityKey(table, { operation, id }), table, operation, id, enqueuedAt, status: 'pending' };
  }
  if (operation === 'removeWhere') {
    const filter = { ...((variables as Record<string, unknown> | null) ?? {}) };
    return { key: buildEntityKey(table, { operation, filter }), table, operation, filter, enqueuedAt, status: 'pending' };
  }
  if (operation === 'update') {
    const { id, values } = (variables ?? {}) as { id?: string; values?: Record<string, unknown> };
    const merged = { ...(values ?? {}) };
    return {
      key: buildEntityKey(table, { operation, id, values: merged }),
      table,
      operation,
      id,
      values: merged,
      clientKey: readClientKey(merged),
      enqueuedAt,
      status: 'pending',
    };
  }
  const values = { ...((variables ?? {}) as Record<string, unknown>) };
  const id = typeof values.id === 'string' ? values.id : undefined;
  return {
    key: buildEntityKey(table, { operation, id, values }),
    table,
    operation,
    id,
    values,
    clientKey: readClientKey(values),
    enqueuedAt,
    status: 'pending',
  };
}

/**
 * `client_key` uuid généré côté client (D-05/D-14) — clé d'idempotence du
 * rejeu. `crypto.randomUUID()` est natif (contexte sécurisé, iOS ≥ 15.4) ;
 * le repli est le même que `randomId` (utils) pour les environnements de
 * test qui n'exposent pas l'API.
 */
export function newClientKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * L'échec est-il un incident RÉSEAU (la file doit l'enfiler), et non un refus
 * métier (Pitfall 2) ? Un refus RLS (42501), d'unicité (23505) ou de check
 * (23514) porte un code PostgREST : il échoue devant l'utilisateur, JAMAIS
 * enfilé. Une suppression de 0 ligne (`REMOVE_*_MISSING`, Pitfall 3 : RLS
 * refusée et ligne absente sont indistinguables) est un refus métier sans
 * code PG — reconnue par son message, la seule marque stable que l'adaptateur
 * expose. Réseau/5xx : retryable, part en file.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch échoué : réseau indisponible
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null | undefined;
  if (candidate && typeof candidate === 'object') {
    if (typeof candidate.code === 'string' && candidate.code.length > 0) return false;
    if (candidate.message === REMOVE_MISSING_MESSAGE || candidate.message === REMOVE_WHERE_MISSING_MESSAGE) return false;
    if (typeof candidate.status === 'number') return candidate.status >= 500;
  }
  return true; // ni code ni statut : échec transport par défaut
}

export type FailureClassification = { kind: 'terminal'; code: string; message: string } | { kind: 'retryable' };

/**
 * Classification D-10 d'un échec de rejeu : terminal (refus RLS, ligne
 * absente — à surfacer et retirer de la file, JAMAIS rejoué) vs retryable
 * (réseau/5xx — reste en file, rejeté plus tard). Pitfall 4 : on lit le
 * CODE, jamais un fragment de message PostgREST.
 */
export function classifyFailure(error: unknown): FailureClassification {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null | undefined;
  const message = candidate && typeof candidate.message === 'string' ? candidate.message : String(error);
  if (typeof candidate?.code === 'string' && candidate.code.length > 0) {
    return { kind: 'terminal', code: candidate.code, message };
  }
  if (candidate?.message === REMOVE_MISSING_MESSAGE) return { kind: 'terminal', code: 'REMOVE_MISSING', message };
  if (candidate?.message === REMOVE_WHERE_MISSING_MESSAGE) {
    return { kind: 'terminal', code: 'REMOVE_WHERE_MISSING', message };
  }
  return { kind: 'retryable' };
}
