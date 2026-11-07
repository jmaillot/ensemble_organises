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
  // CR-02 : sauf quand la pendante est un CREATE — le retirer au profit d'un
  // update rejouerait un update sur une ligne qui n'existe pas côté serveur
  // (0 ligne modifiée, PGRST116, échec terminal) : la ligne ne serait jamais
  // créée. Les valeurs de l'update sont donc fusionnées DANS le create, qui
  // conserve son client_key (clé d'idempotence du rejeu) : l'invariant
  // « une écriture finale par entité » est maintenu SANS faire disparaître
  // la création.
  const superseded = entries.find(
    (entry) => entry.status === 'pending' && entry.table === incoming.table && entry.key === incoming.key,
  );
  if (incoming.operation === 'update' && superseded?.operation === 'create') {
    client.setQueryData(key, [
      ...entries.filter((entry) => entry !== superseded),
      {
        ...superseded,
        values: { ...superseded.values, ...incoming.values },
        enqueuedAt: incoming.enqueuedAt,
      },
    ]);
    return;
  }
  client.setQueryData(key, [
    ...entries.filter((entry) => entry !== superseded),
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
 * Retire UNE entrée de la file (action « Abandonner » du panneau offline,
 * D-11, plan 04). Le retrait est EXPLICITE : jamais automatique (T-34-09) —
 * l'appelant UI doit d'abord avoir montré la confirm-dialog (§6 AGENTS :
 * toute suppression destructive passe par une confirmation).
 *
 * Ici et pas dans `outbox-replay.ts` : aucune passe de rejeu n'est déclenchée,
 * la fonction est pure (setQueryData), et `outbox.ts` reste sans dépendance
 * vers l'adaptateur.
 */
export function abandonOutboxEntry(
  client: QueryClient,
  userId: string,
  householdId: string,
  entry: OutboxEntry,
): void {
  const key = outboxKeyFor(userId, householdId);
  client.setQueryData<OutboxEntry[]>(key, (current) => (current ?? []).filter((candidate) => candidate !== entry));
}

/**
 * Libellé lisible du panneau (D-11) : opération en français + table. AUCUNE
 * valeur de ligne n'y entre (T-34-08, plan 04) : l'identité affichée se borne
 * à la table, à l'opération et, pour une entrée à `id`, à l'identifiant —
 * les `values` et le `filter` ne quittent jamais la file vers l'écran.
 */
export function outboxEntryLabel(entry: OutboxEntry): string {
  const operations: Record<OutboxOperation, string> = {
    create: 'Ajout',
    update: 'Modification',
    remove: 'Suppression',
    removeWhere: 'Suppression multiple',
  };
  const tables: Partial<Record<string, string>> = {
    tasks: 'tâche',
    shopping_list_items: 'article de liste',
    events: 'événement',
    notes: 'note',
    expenses: 'dépense',
    routines: 'routine',
    routine_completions: 'complétion de routine',
    messages: 'message',
    posts: 'publication',
    post_comments: 'commentaire',
    post_reactions: 'réaction',
    task_assignees: 'assignation',
    profile: 'profil',
  };
  const table = tables[entry.table] ?? entry.table;
  return `${operations[entry.operation]} — ${table}`;
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
  // DataError enveloppe l'erreur d'origine (`cause` = erreur supabase-js) :
  // le code PG vit dans la cause, jamais sur l'Error elle-même. Les deux
  // maillons sont examinés — un code PG à l'un OU l'autre est un refus métier.
  const chain: unknown[] = [error];
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  if (cause !== undefined && cause !== error) chain.push(cause);
  for (const candidate of chain) {
    if (candidate instanceof TypeError) {
      continue;
    }
    const c = candidate as { code?: unknown; status?: unknown; message?: unknown } | null | undefined;
    if (!c || typeof c !== 'object') continue;
    // Pitfall 2 : un code PostgREST est un refus métier (42501 RLS, 23505
    // unicité, 23514 check) — JAMAIS enfilé, il échoue devant l'utilisateur.
    if (typeof c.code === 'string' && c.code.length > 0) return false;
    // Une suppression de 0 ligne (RLS-refusée ou ligne déjà absente — les
    // deux indistinguables, Pitfall 3) lève REMOVE_*_MISSING sans code PG :
    // un refus métier, pas un incident réseau.
    if (c.message === REMOVE_MISSING_MESSAGE || c.message === REMOVE_WHERE_MISSING_MESSAGE) return false;
    if (typeof c.status === 'number') {
      if (c.status < 500) return false;
    }
  }
  return true; // ni code ni statut décisif : échec transport par défaut
}

export type FailureClassification = { kind: 'terminal'; code: string; message: string } | { kind: 'retryable' };

/**
 * Matrice D-05 : catalogue des codes terminaux connus → libellé français non
 * générique. Les codes sont EXACTS (Pitfall 1 : jamais un préfixe qui
 * rattraperait PGRST116 dans une autre famille — la famille « malformé »
 * liste SES codes, elle ne commence pas par « PGRST10 »). Le libellé du 404
 * (PGRST116) est VERROUILLÉ mot pour mot (D-01).
 */
export const FAILURE_FAMILIES: ReadonlyArray<{ codes: readonly string[]; label: string }> = [
  // D-01 : la ligne visée a été supprimée côté serveur entre-temps.
  { codes: ['PGRST116'], label: 'cet élément a été supprimé entre-temps' },
  // D-05 : refus d'autorisation — RLS PG (42501) ou HTTP 403 PostgREST.
  { codes: ['42501', '403'], label: 'droits insuffisants pour cette action' },
  // D-05 : violation de contrainte CHECK / NOT NULL.
  { codes: ['23514'], label: 'données invalides' },
  // D-05 : clé étrangère violée — la cible n'existe pas (ou plus).
  { codes: ['23503'], label: 'référence à un élément inexistant' },
  // D-05 : violation d'unicité.
  { codes: ['23505'], label: 'cet élément existe déjà' },
  // D-05 : requête malformée — cast impossible (22P02) ou payload invalide
  // (PGRST100) ; codes listés explicitement, jamais un préfixe de PGRST116.
  { codes: ['22P02', 'PGRST100'], label: 'requête malformée' },
];

/** D-06 : tout code imprévu reçoit ce libellé générique — jamais un silence, jamais une boucle. */
const LIBELLE_GENERIQUE = 'cette écriture a été refusée par le serveur';

/**
 * Libellé du panneau offline (D-01/D-05) : fonction PURE dérivée au rendu
 * du SEUL `code` (T-36-01 — le message PostgREST brut ne franchit jamais
 * l'écran). Matching EXACT sur le code (`===`, jamais startsWith — Pitfall 1).
 * Aucune extension de la forme persistée `OutboxEntry.failure` (D-13,
 * Pitfall 5) : zéro migration IndexedDB, les entrées d'avant la phase
 * rendent le même libellé.
 */
export function failureLabel(failure: { code: string; message: string }): string {
  for (const family of FAILURE_FAMILIES) {
    if (family.codes.some((code) => failure.code === code)) return family.label;
  }
  return LIBELLE_GENERIQUE; // D-06 : code imprévu → libellé générique, défaut terminal
}

/**
 * Classification D-10 d'un échec de rejeu : terminal (refus RLS, ligne
 * absente — à surfacer et retirer de la file, JAMAIS rejoué) vs retryable
 * (réseau/5xx — reste en file, rejeté plus tard). Pitfall 4 : on lit le
 * CODE, jamais un fragment de message PostgREST.
 */
export function classifyFailure(error: unknown): FailureClassification {
  const chain: unknown[] = [error];
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  if (cause !== undefined && cause !== error) chain.push(cause);
  const message =
    chain.find(
      (candidate): candidate is { message: string } =>
        Boolean(candidate) && typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string',
    )?.message ?? String(error);
  for (const candidate of chain) {
    const c = candidate as { code?: unknown; message?: unknown } | null | undefined;
    if (!c || typeof c !== 'object') continue;
    // Pitfall 4 : le CODE décide, jamais un fragment de message PostgREST.
    if (typeof c.code === 'string' && c.code.length > 0) return { kind: 'terminal', code: c.code, message };
    if (c.message === REMOVE_MISSING_MESSAGE) return { kind: 'terminal', code: 'REMOVE_MISSING', message };
    if (c.message === REMOVE_WHERE_MISSING_MESSAGE) return { kind: 'terminal', code: 'REMOVE_WHERE_MISSING', message };
  }
  return { kind: 'retryable' }; // réseau / 5xx : rejeté, reste en file (D-10)
}
