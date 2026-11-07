import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import { buildQueryClient } from '@/lib/query-policy';
import { DataError, REMOVE_MISSING_MESSAGE, REMOVE_WHERE_MISSING_MESSAGE, type DataAdapter } from '@/lib/data/adapter';
import { useOutboxReplay, OutboxReplayWatcher } from '@/hooks/use-outbox-replay';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import {
  type OutboxEntry,
  enqueueOutbox,
  failureLabel,
  outboxKeyFor,
  setOutboxScopeProvider,
} from './outbox';
import { replayOutbox } from './outbox-replay';

/**
 * Preuves du rejeu de la file (phase 34, plans 03 — WRQ-02 volet rejeu,
 * WRQ-04, WRQ-06). L'adaptateur est un double injecté : ce qui est prouvé
 * ici est le chemin CLIENT du rejeu (ordre D-09, upsert idempotent D-14,
 * classification D-10, déclencheurs D-08), pas le comportement PostgREST.
 */

const SCOPE = { userId: 'user-a', householdId: 'h1' };

function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function outboxEntries(client: QueryClient): OutboxEntry[] {
  return client.getQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId)) ?? [];
}

/** Double d'adaptateur : enregistre les appels, applique un upsert fusionnant. */
function makeAdapterMock(options: { upsertMerge?: boolean } = {}): DataAdapter & {
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  removeWhere: ReturnType<typeof vi.fn>;
  rows: Map<string, number>;
} {
  const rows = new Map<string, number>();
  const adapter = {
    kind: 'supabase' as const,
    list: vi.fn(async () => []),
    create: vi.fn(),
    upsert: vi.fn(async (_table: string, values: Record<string, unknown>) => {
      // Sémantique upsert (fusion) : le client_key ne crée la ligne qu'une
      // fois — rejouer la même entrée laisse le compte à 1 (exactement une fois).
      const key = String(values.client_key);
      if (!rows.has(key)) rows.set(key, 1);
      return values as never;
    }),
    update: vi.fn(async (_table: string, _id: string, values: Record<string, unknown>) => values as never),
    remove: vi.fn(async () => undefined),
    removeWhere: vi.fn(async () => undefined),
    replaceSet: vi.fn(async () => undefined),
    deleteFolder: vi.fn(async () => undefined),
    createHousehold: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    rows,
  };
  if (options.upsertMerge === false) {
    // Comportement NON fusionnant : le second upsert du même client_key
    // échouerait sur la contrainte (23505) — utilisé pour prouver que le
    // client ne repasse jamais deux fois la même entrée.
    adapter.upsert.mockImplementation(async (_table: string, values: Record<string, unknown>) => {
      if (rows.has(String(values.client_key))) {
        throw new DataError('doublon', { code: '23505', status: 409 });
      }
      rows.set(String(values.client_key), 1);
      return values as never;
    });
  }
  return adapter as never;
}

function enqueueEntry(
  client: QueryClient,
  marker: Parameters<typeof enqueueOutbox>[1],
  variables: unknown,
): OutboxEntry {
  enqueueOutbox(client, marker, variables);
  return outboxEntries(client).at(-1)!;
}

beforeEach(() => {
  setOutboxScopeProvider(() => SCOPE);
  useSessionStore.setState({ user: { id: SCOPE.userId, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' } });
  useHouseholdStore.setState({ householdId: SCOPE.householdId });
});

afterEach(() => {
  onlineManager.setOnline(true);
  setOutboxScopeProvider(null);
  vi.clearAllMocks();
});

describe('rejeu d’un create (tracer, D-09/D-14/WRQ-06)', () => {
  it('rejoue l’entrée create par upsert onConflict household_id,client_key, retire l’entrée et invalide la table', async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const adapter = makeAdapterMock();
    enqueueEntry(
      client,
      { table: 'shopping_list_items', operation: 'create' },
      { id: 'sli-1', name: 'Pain', household_id: 'h1', client_key: 'ck-1' },
    );

    const result = await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(result).toEqual({ applied: 1, failed: 0 });
    expect(adapter.upsert).toHaveBeenCalledOnce();
    const [table, payload, options] = adapter.upsert.mock.calls[0];
    expect(table).toBe('shopping_list_items');
    expect(payload).toMatchObject({ id: 'sli-1', client_key: 'ck-1', name: 'Pain', household_id: 'h1' });
    expect(options).toEqual({ onConflict: 'household_id,client_key' });
    expect(outboxEntries(client), 'l’entrée appliquée quitte la file').toHaveLength(0);
    // D-16 : l'invalidation de la table est déclenchée après le succès —
    // le serveur (Realtime/invalidation) prime sur l'overlay optimiste.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shopping_list_items'] });
  });

  it('la jointure sans id (task_assignees) part avec onConflict client_key SEUL', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    enqueueEntry(client, { table: 'task_assignees', operation: 'create' }, { task_id: 't1', member_id: 'm1', client_key: 'ck-j1' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    const [, payload, options] = adapter.upsert.mock.calls[0];
    expect(payload).not.toHaveProperty('id');
    expect(options).toEqual({ onConflict: 'client_key' });
  });

  it('rejouer DEUX FOIS la même entrée ne crée qu’UNE ligne (exactement une fois, D-14)', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't9', name: 'Pain', household_id: 'h1', client_key: 'ck-9' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);
    // Simulation d'un double rejeu (reload, second déclencheur) : la même
    // entrée est ré-enfilée telle quelle, l'upsert du mock FUSIONNE.
    client.setQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId), [
      { key: 'tasks:t9', table: 'tasks', operation: 'create', id: 't9', values: { id: 't9', name: 'Pain', household_id: 'h1', client_key: 'ck-9' }, clientKey: 'ck-9', enqueuedAt: 1, status: 'pending' },
    ]);
    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(adapter.rows.get('ck-9'), 'l’upsert fusionne : le mock ne compte qu’une ligne pour ce client_key').toBe(1);
  });

  it('file vide : replayOutbox ne fait AUCUN appel d’adaptateur (no-op prouvé, §2.7 F)', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();

    const result = await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(result).toEqual({ applied: 0, failed: 0 });
    expect(adapter.upsert).not.toHaveBeenCalled();
    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.remove).not.toHaveBeenCalled();
    expect(adapter.removeWhere).not.toHaveBeenCalled();
  });

  it('ordre D-09 : creates d’abord, puis updates, puis suppressions — FIFO dans chaque groupe', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    // Enfilage volontairement dans l'ordre inverse des groupes.
    enqueueEntry(client, { table: 'tasks', operation: 'remove' }, 't3');
    enqueueEntry(client, { table: 'tasks', operation: 'update' }, { id: 't2', values: { name: 'u1' }, client_key: 'ck-u1' });
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'c1', household_id: 'h1', client_key: 'ck-c1' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    const calls = [
      ...adapter.upsert.mock.calls.map((c) => ['upsert', c[0], c[1].client_key]),
      ...adapter.update.mock.calls.map((c) => ['update', c[0], c[1]]),
      ...adapter.remove.mock.calls.map((c) => ['remove', c[0], c[1]]),
    ];
    expect(calls).toEqual([
      ['upsert', 'tasks', 'ck-c1'],
      ['update', 'tasks', 't2'],
      ['remove', 'tasks', 't3'],
    ]);
  });

  it('update rejoué par adapter.update avec client_key porté ; remove SANS ifMissing ignore (Pitfall 3)', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    enqueueEntry(client, { table: 'tasks', operation: 'update' }, { id: 't1', values: { name: 'cochée', client_key: 'ck-u' } });
    enqueueEntry(client, { table: 'tasks', operation: 'remove' }, 't2');

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(adapter.update.mock.calls[0]).toEqual(['tasks', 't1', { name: 'cochée', client_key: 'ck-u' }]);
    expect(adapter.remove).toHaveBeenCalledWith('tasks', 't2');
    expect(adapter.remove.mock.calls[0][2], 'le 0-lignes doit rester visible pour la classification').toBeUndefined();
  });

  it('échec réseau (TypeError) : la passe s’arrête, les entrées suivantes restent pending', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    adapter.upsert.mockRejectedValueOnce(new TypeError('fetch failed'));
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'a', household_id: 'h1', client_key: 'ck-1' });
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't2', name: 'b', household_id: 'h1', client_key: 'ck-2' });

    const result = await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(result).toEqual({ applied: 0, failed: 0 });
    expect(adapter.upsert).toHaveBeenCalledOnce();
    const entries = outboxEntries(client);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.status === 'pending')).toBe(true);
  });
});

describe('classification intégrée au rejeu (Task 2, D-10, Pitfall 3/4)', () => {
  it('42501 au rejeu → status failed, failure.code 42501, l’entrée n’est JAMAIS rejouée (non-boucle)', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    adapter.upsert.mockRejectedValue(new DataError('refus RLS', { code: '42501', status: 403 }));
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'a', household_id: 'h1', client_key: 'ck-1' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);
    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('failed');
    expect(entries[0].failure).toEqual({ kind: 'terminal', code: '42501', message: 'refus RLS' });

    // Non-boucle (T-34-02) : dix déclencheurs d'affilée — replayOutbox ne
    // touche plus l'entrée failed, l'adaptateur n'est pas rappelé.
    for (let round = 0; round < 10; round += 1) {
      await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);
    }
    expect(adapter.upsert, 'un refus terminal est visible mais jamais rejoué automatiquement').toHaveBeenCalledOnce();
  });

  it('TypeError réseau au rejeu → status reste pending, aucune trace failed', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    adapter.upsert.mockRejectedValue(new TypeError('fetch failed'));
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'a', household_id: 'h1', client_key: 'ck-1' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    const entries = outboxEntries(client);
    expect(entries[0].status).toBe('pending');
    expect(entries[0].failure).toBeUndefined();
  });

  it('REMOVE_MISSING (ligne déjà supprimée, Pitfall 3) → terminal, visible en failed, jamais rejoué', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    adapter.remove.mockRejectedValue(new DataError(REMOVE_MISSING_MESSAGE, { table: 'tasks', id: 't1' }));
    enqueueEntry(client, { table: 'tasks', operation: 'remove' }, 't1');

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    const entries = outboxEntries(client);
    expect(entries[0].status).toBe('failed');
    expect(entries[0].failure?.code).toBe('REMOVE_MISSING');
    // Pas d'effacement silencieux : l'entrée reste dans la file, visible.
    expect(outboxEntries(client)).toHaveLength(1);
  });

  it('REMOVE_WHERE_MISSING → terminal également (jointures, Pitfall 3)', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    adapter.removeWhere.mockRejectedValue(new DataError(REMOVE_WHERE_MISSING_MESSAGE, { table: 'task_assignees', filter: {} }));
    enqueueEntry(client, { table: 'task_assignees', operation: 'removeWhere' }, { task_id: 't1' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(outboxEntries(client)[0].failure?.code).toBe('REMOVE_WHERE_MISSING');
  });

  it('un terminal ne bloque pas la suite de la passe ; un retryable l’interrompt', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    // ck-1 refusé (terminal), ck-2 passe, ck-3 échoue réseau → ck-4 jamais tenté.
    adapter.upsert
      .mockRejectedValueOnce(new DataError('refus', { code: '42501', status: 403 }))
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'a', household_id: 'h1', client_key: 'ck-1' });
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't2', name: 'b', household_id: 'h1', client_key: 'ck-2' });
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't3', name: 'c', household_id: 'h1', client_key: 'ck-3' });
    enqueueEntry(client, { table: 'tasks', operation: 'create' }, { id: 't4', name: 'd', household_id: 'h1', client_key: 'ck-4' });

    const result = await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    expect(result).toEqual({ applied: 1, failed: 1 });
    expect(adapter.upsert).toHaveBeenCalledTimes(3);
    const entries = outboxEntries(client);
    expect(entries.map((entry) => [entry.id, entry.status])).toEqual([
      ['t1', 'failed'],
      ['t3', 'pending'],
      ['t4', 'pending'],
    ]);
  });
});

describe('scénario 404 : ligne supprimée serveur pendant la coupure (phase 36, D-07/D-09)', () => {
  it('update rejouée sur une ligne disparue (PGRST116) : entrée failed, libellé verrouillé, jamais évaporée ni rejouée', async () => {
    const client = makeClient();
    const adapter = makeAdapterMock();
    // Le serveur répond 406/PGRST116 : la ligne visée n'existe plus (supprimée
    // entre-temps par un autre membre du foyer).
    adapter.update.mockRejectedValue(
      new DataError('JSON object requested, multiple (or no) rows returned', { code: 'PGRST116', status: 406 }),
    );
    enqueueEntry(client, { table: 'tasks', operation: 'update' }, { id: 't404', values: { name: 'x' }, client_key: 'ck-404' });

    await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);

    const entries = outboxEntries(client);
    // Jamais d'effacement silencieux (D-34) : l'entrée reste dans la file.
    expect(entries, 'l’entrée PGRST116 n’est JAMAIS évaporée').toHaveLength(1);
    expect(entries[0].status).toBe('failed');
    expect(entries[0].failure?.code).toBe('PGRST116');
    // D-01 verrouillé mot pour mot : le libellé est dérivé du SEUL code,
    // jamais le message PostgREST brut.
    expect(failureLabel(entries[0].failure!)).toBe('cet élément a été supprimé entre-temps');

    // Non-boucle (T-34-02) : dix déclencheurs d'affilée, l'adaptateur n'est
    // pas rappelé — une entrée terminal n'est jamais rejetée en boucle.
    for (let round = 0; round < 10; round += 1) {
      await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);
    }
    expect(adapter.update, 'un refus terminal est visible mais jamais rejoué automatiquement').toHaveBeenCalledOnce();
  });
});

describe('déclencheurs foreground (Task 3, D-08)', () => {
  function wrapperFor(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  }

  function pendingCreate(client: QueryClient): void {
    enqueueOutbox(client, { table: 'tasks', operation: 'create' }, { id: 't1', name: 'Pain', household_id: 'h1', client_key: 'ck-1' });
  }

  /** Mock de '@/lib/data' : le hook appelle replayOutbox avec l'adaptateur par défaut. */
  async function mockDataAdapterModule() {
    const adapter = makeAdapterMock();
    const mod = await import('@/lib/data');
    vi.spyOn(mod, 'data', 'get').mockReturnValue(adapter);
    return adapter;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('le retour en ligne (onlineManager) déclenche le rejeu des entrées pendantes', async () => {
    const client = makeClient();
    const adapter = await mockDataAdapterModule();
    pendingCreate(client);
    onlineManager.setOnline(false);

    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(client) });
    expect(adapter.upsert, 'hors ligne au montage : rien ne part').not.toHaveBeenCalled();

    onlineManager.setOnline(true); // déclencheur : subscribe onlineManager
    await waitFor(() => expect(adapter.upsert).toHaveBeenCalledOnce());
    expect(outboxEntries(client)).toHaveLength(0);
  });

  it('visibilitychange (retour d’onglet) déclenche le rejeu', async () => {
    const client = makeClient();
    const adapter = await mockDataAdapterModule();
    pendingCreate(client);
    // En ligne, mais l'événement onlineManager ne change pas : seul le
    // visibilitychange peut déclencher la passe.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });

    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(adapter.upsert).toHaveBeenCalledOnce());

    // Une seconde entrée, puis un second retour d'onglet.
    pendingCreate(client);
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(adapter.upsert).toHaveBeenCalledTimes(2));
  });

  it('le rejeu part au montage quand des écritures pendent (reload précédent)', async () => {
    const client = makeClient();
    const adapter = await mockDataAdapterModule();
    pendingCreate(client);
    onlineManager.setOnline(true);

    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(adapter.upsert).toHaveBeenCalledOnce());
  });

  it('hors ligne, aucun déclencheur ne lance le rejeu ; sans foyer chargé non plus', async () => {
    const client = makeClient();
    const adapter = await mockDataAdapterModule();
    pendingCreate(client);
    onlineManager.setOnline(false);

    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(client) });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(adapter.upsert, 'hors ligne : aucun appel adaptateur, ni au montage ni au retour d’onglet').not.toHaveBeenCalled();

    // Sans foyer chargé (householdId null) : le rejeu ne fait rien, même en ligne.
    useHouseholdStore.setState({ householdId: null });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adapter.upsert).not.toHaveBeenCalled();
  });

  it('le watcher est un composant qui ne peint rien (montage unique dans l’app)', () => {
    const client = makeClient();
    const { container } = render(
      createElement(QueryClientProvider, { client }, createElement(OutboxReplayWatcher)),
    );
    expect(container, 'aucun nœud peint : le watcher ne porte que l’effet de rejeu').toBeEmptyDOMElement();
  });
});
