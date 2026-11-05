import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useMutation } from '@tanstack/react-query';
import { buildQueryClient } from '@/lib/query-policy';
import { useLinkedRows, useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { DataError, REMOVE_MISSING_MESSAGE, REMOVE_WHERE_MISSING_MESSAGE } from '@/lib/data/adapter';
import { useHouseholdStore } from '@/stores/household-store';
import {
  type OutboxEntry,
  buildEntityKey,
  classifyFailure,
  enqueueOutbox,
  isNetworkFailure,
  outboxKeyFor,
  setOutboxScopeProvider,
} from './outbox';

/**
 * Preuves de la file d'écriture hors-ligne (phase 34, WRQ-02/WRQ-03).
 *
 * La chaîne exercée est celle de la production : useResource → useMutation
 * marquée `meta { table, operation }` → échec réseau simulé →
 * MutationCache.onError (query-policy.ts) → entrée dans la query
 * `['outbox', userId, householdId]`. Les méthodes de l'adaptateur sont
 * remplacées par des doubles : ce qui est prouvé ici est le chemin CLIENT de
 * l'enfilage, pas le comportement PostgREST (couvert par les suites SQL).
 */

vi.mock('@/lib/data', () => ({
  data: {
    list: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
  },
}));

const SCOPE = { userId: 'user-a', householdId: 'h1' };

/** Client de test : la fabrique réelle (jamais un QueryClient écrit à la main — Test E). */
function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false }, mutations: { retry: false } });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

function outboxEntries(client: QueryClient): OutboxEntry[] {
  return client.getQueryData<OutboxEntry[]>(outboxKeyFor(SCOPE.userId, SCOPE.householdId)) ?? [];
}

beforeEach(() => {
  setOutboxScopeProvider(() => SCOPE);
  useHouseholdStore.setState({ householdId: SCOPE.householdId });
});

afterEach(() => {
  onlineManager.setOnline(true);
  setOutboxScopeProvider(null);
  vi.clearAllMocks();
});

describe('enfilage hors-ligne (tracer WRQ-02, D-02)', () => {
  it('enfile un create hors-ligne dans la query outbox, avec id ET client_key distincts', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('shopping_list_items'), { wrapper: wrapperFor(client) });
    await expect(result.current.create({ name: 'Pain', household_id: 'h1' })).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries, 'l’échec réseau doit laisser UNE entrée en file').toHaveLength(1);
    expect(entries[0].table).toBe('shopping_list_items');
    expect(entries[0].operation).toBe('create');
    expect(entries[0].id, 'l’id texte est généré côté client (Pitfall 7)').toBeTruthy();
    expect(entries[0].clientKey, 'la client_key uuid est générée côté client (D-05)').toBeTruthy();
    expect(entries[0].id).not.toBe(entries[0].clientKey);
    expect(entries[0].status).toBe('pending');
    expect(entries[0].values?.name).toBe('Pain');
    expect(entries[0].values?.client_key).toBe(entries[0].clientKey);
  });

  it('le create hors-ligne PEINT la ligne avec l’identité client (overlay optimiste, Pitfall 7)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    // Hors ligne, la lecture aussi échoue (networkMode 'always') : le refetch
    // ne vient pas écraser l'overlay avec un état vide mensonger.
    vi.mocked(data.list).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('shopping_list_items'), { wrapper: wrapperFor(client) });
    await expect(result.current.create({ name: 'Beurre', household_id: 'h1' })).rejects.toThrow('fetch failed');

    const painted = client
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[0] === 'shopping_list_items')?.state.data as Array<Record<string, unknown>>;
    expect(painted, 'la ligne reste peinte pendant la coupure — elle est en file, pas perdue').toHaveLength(1);
    const entries = outboxEntries(client);
    expect(painted[0].id).toBe(entries[0].id);
    expect(painted[0].client_key).toBe(entries[0].clientKey);
  });

  it('une mutation NON marquée ne part jamais en file', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new TypeError('fetch failed');
          },
        }),
      { wrapper: wrapperFor(client) },
    );
    await expect(result.current.mutateAsync(undefined)).rejects.toThrow('fetch failed');

    expect(outboxEntries(client), 'sans meta { table, operation }, l’enfilage ne décide rien').toHaveLength(0);
  });
});

describe('sémantique de file (D-04 fusion, D-05 annulation, Pitfall 2)', () => {
  it('coche puis décoche hors-ligne = UNE écriture finale (fusion D-04)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.update).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('tasks'), { wrapper: wrapperFor(client) });
    await expect(result.current.update('t1', { name: 'cochée' })).rejects.toThrow('fetch failed');
    await expect(result.current.update('t1', { name: 'décochée' })).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries, 'la dernière action locale gagne : une seule écriture pendante').toHaveLength(1);
    expect(entries[0].operation).toBe('update');
    expect(entries[0].id).toBe('t1');
    expect(entries[0].values?.name).toBe('décochée');
  });

  it('create puis delete hors-ligne = ZÉRO écriture (annulation D-05)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(data.remove).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('shopping_list_items'), { wrapper: wrapperFor(client) });
    await expect(result.current.create({ name: 'Pain', household_id: 'h1' })).rejects.toThrow('fetch failed');
    const createdId = outboxEntries(client)[0].id as string;
    await expect(result.current.remove(createdId)).rejects.toThrow('fetch failed');

    expect(outboxEntries(client), 'la ligne n’a jamais existé côté serveur : create ET remove disparaissent').toHaveLength(0);
  });

  it('remove après update : l’update est retiré, le remove part (la ligne existe côté serveur)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.update).mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(data.remove).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useResource('tasks'), { wrapper: wrapperFor(client) });
    await expect(result.current.update('t1', { name: 'x' })).rejects.toThrow('fetch failed');
    await expect(result.current.remove('t1')).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('remove');
    expect(entries[0].id).toBe('t1');
  });

  it('un refus RLS (42501) en ligne n’est JAMAIS enfilé (Pitfall 2)', async () => {
    onlineManager.setOnline(true);
    vi.mocked(data.update).mockRejectedValue(new DataError('refus RLS', { code: '42501', status: 403 }));
    const client = makeClient();

    const { result } = renderHook(() => useResource('tasks'), { wrapper: wrapperFor(client) });
    await expect(result.current.update('t1', { name: 'x' })).rejects.toThrow('refus RLS');

    expect(outboxEntries(client), 'un refus métier échoue devant l’utilisateur, il ne part pas en file').toHaveLength(0);
  });

  it('removeWhere enfile un filtre sérialisé rejouable (Pitfall 6 : useLinkedRows)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.removeWhere).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useLinkedRows('task_assignees'), { wrapper: wrapperFor(client) });
    await expect(result.current.remove({ task_id: 't1' })).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('removeWhere');
    expect(entries[0].filter).toEqual({ task_id: 't1' });
    // Le filtre sérialisé est rejouable tel quel : il porte la cible exacte.
    expect(entries[0].key).toBe(buildEntityKey('task_assignees', { operation: 'removeWhere', filter: { task_id: 't1' } }));
    expect(entries[0].key).toContain('task_id=t1');
  });

  it('add sur jointure enfile un create avec client_key, sans id (tables sans id)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useLinkedRows('task_assignees'), { wrapper: wrapperFor(client) });
    await expect(result.current.add({ task_id: 't1', member_id: 'm1' })).rejects.toThrow('fetch failed');

    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('create');
    expect(entries[0].clientKey, '0177 : la jointure porte client_key (unique, sans household_id)').toBeTruthy();
    expect(entries[0].id, 'task_assignees n’a pas de colonne id : rien n’est inventé').toBeUndefined();
  });

  it('un removeWhere annule le create pendante de la même jointure (D-05 sans fantôme)', async () => {
    onlineManager.setOnline(false);
    vi.mocked(data.create).mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(data.removeWhere).mockRejectedValue(new TypeError('fetch failed'));
    const client = makeClient();

    const { result } = renderHook(() => useLinkedRows('task_assignees'), { wrapper: wrapperFor(client) });
    await expect(result.current.add({ task_id: 't1', member_id: 'm1' })).rejects.toThrow('fetch failed');
    await expect(result.current.remove({ task_id: 't1' })).rejects.toThrow('fetch failed');

    expect(outboxEntries(client), 'assigner puis retirer hors-ligne = zéro écriture serveur').toHaveLength(0);
  });
});

describe('garde upfront hors liste (WRQ-03, D-07)', () => {
  it('update sur expenses (hors liste) rejette SANS appel adaptateur ni enfilage', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();

    const { result } = renderHook(() => useResource('expenses'), { wrapper: wrapperFor(client) });
    await expect(result.current.update('e1', { title: 'Courses' })).rejects.toThrow('hors-ligne');

    expect(vi.mocked(data.update), 'aucun départ réseau : la garde parle avant le fetch').not.toHaveBeenCalled();
    expect(outboxEntries(client), 'un module hors liste n’est jamais enfilé').toHaveLength(0);
  });

  it('removeWhere hors liste via useLinkedRows est refusé aussi (T-34-05 : les DEUX chemins)', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();

    const { result } = renderHook(() => useLinkedRows('routine_assignees'), { wrapper: wrapperFor(client) });
    await expect(result.current.remove({ routine_id: 'r1' })).rejects.toThrow('hors-ligne');

    expect(vi.mocked(data.removeWhere)).not.toHaveBeenCalled();
    expect(outboxEntries(client)).toHaveLength(0);
  });

  it('EN LIGNE, une écriture hors liste passe normalement — la liste blanche borne le hors-ligne', async () => {
    onlineManager.setOnline(true);
    vi.mocked(data.update).mockResolvedValue([{ id: 'e1' }] as never);
    const client = makeClient();

    const { result } = renderHook(() => useResource('expenses'), { wrapper: wrapperFor(client) });
    await expect(result.current.update('e1', { title: 'Courses' })).resolves.toBeDefined();

    expect(vi.mocked(data.update)).toHaveBeenCalledOnce();
  });
});

describe('classification d’enfilage (D-10, Pitfall 4)', () => {
  it('isNetworkFailure : TypeError et 5xx sont réseau, un code PG ne l’est jamais', () => {
    expect(isNetworkFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkFailure({ status: 502, message: 'Bad Gateway' })).toBe(true);
    expect(isNetworkFailure(new DataError('refus', { code: '42501', status: 403 }))).toBe(false);
    expect(isNetworkFailure(new DataError('doublon', { code: '23505', status: 409 }))).toBe(false);
  });

  it('isNetworkFailure : REMOVE_*_MISSING (0 ligne, Pitfall 3) n’est pas un incident réseau', () => {
    expect(isNetworkFailure(new DataError(REMOVE_MISSING_MESSAGE, { table: 'tasks', id: 't1' }))).toBe(false);
    expect(isNetworkFailure(new DataError(REMOVE_WHERE_MISSING_MESSAGE, { table: 'task_assignees', filter: {} }))).toBe(false);
  });

  it('classifyFailure : code PG → terminal avec code et message ; réseau → retryable', () => {
    expect(classifyFailure(new DataError('refus RLS', { code: '42501', status: 403 }))).toEqual({
      kind: 'terminal',
      code: '42501',
      message: 'refus RLS',
    });
    expect(classifyFailure(new DataError(REMOVE_MISSING_MESSAGE, { table: 'tasks', id: 't1' }))).toEqual({
      kind: 'terminal',
      code: 'REMOVE_MISSING',
      message: REMOVE_MISSING_MESSAGE,
    });
    expect(classifyFailure(new TypeError('fetch failed'))).toEqual({ kind: 'retryable' });
    expect(classifyFailure({ status: 503, message: 'Service Unavailable' })).toEqual({ kind: 'retryable' });
  });
});

describe('enfilage direct par le MutationCache (D-02, forme buildEntry)', () => {
  it('enqueueOutbox construit une entrée remove par id à partir des variables brutes', () => {
    const client = makeClient();
    enqueueOutbox(client, { table: 'tasks', operation: 'remove' }, 't9');
    const entries = outboxEntries(client);
    expect(entries[0]).toMatchObject({ table: 'tasks', operation: 'remove', id: 't9', status: 'pending' });
    expect(entries[0].key).toBe('tasks:t9');
  });
});
