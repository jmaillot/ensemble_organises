import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { data, DataError } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { isEnqueuedFailure, composeOfflineAwareError, MESSAGE_HORS_LIGNE_SANS_DONNEES, queryKeys, useResource } from './useResource';

/**
 * G-33-3, unitaire : après un refetch échoué hors ligne, TanStack v5 pose
 * `status: "error"` même quand `state.data` existe. L'erreur n'est honnête
 * que SANS données en cache (D-09/D-10) : avec des données, les lignes du
 * cache restent rendues et `isError` reste faux.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useResource — cloisonnement erreur/données', () => {
  const CACHED_ROWS = [{ id: 'a', household_id: DEMO_HOUSEHOLD_ID, name: 'ligne en cache' }];
  const key = queryKeys.table('exemples', DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID });

  function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it('refetch échoué avec données en cache : isError faux, lignes du cache rendues', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(key, CACHED_ROWS);
    vi.spyOn(data, 'list').mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const { result } = renderHook(() => useResource('exemples'), { wrapper: wrapperFor(queryClient) });

    // L'échec du refetch est réel avant d'asserter le cloisonnement : sans
    // lui, un isError faux ne prouverait rien.
    await waitFor(() => {
      expect(queryClient.getQueryCache().find({ queryKey: key })?.state.status).toBe('error');
    });
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(CACHED_ROWS);
  });

  it('échec sans aucune donnée en cache : isError vrai, erreur d’origine exposée (D-10)', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    vi.spyOn(data, 'list').mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const { result } = renderHook(() => useResource('exemples'), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error?.message).toContain('NetworkError');
  });
});

/**
 * UAT-34-1, unitaire — absorption de l'échec enfilé.
 *
 * Quand une écriture sur table allowlistée échoue RÉSEAU (le MutationCache
 * de buildQueryClient vient de l'enfiler dans l'outbox, D-02), le hook ne
 * doit PAS re-propager l'incident transport : create rend la ligne overlay,
 * update rend la ligne fusionnée du cache, remove résout — le signal
 * utilisateur est le badge (D-11/D-12), pas un toast d'erreur. En revanche
 * un refus MÉTIER (DataError, code PG) ou un échec réseau sur table HORS
 * liste se propagent toujours (T-34-14 : avaler un échec non enfilé serait
 * une perte silencieuse).
 */
describe('absorption de l’échec enfilé — UAT-34-1', () => {
  const NETWORK_ERROR = new TypeError('NetworkError when attempting to fetch resource.');
  const ALLOWED_TABLE = 'shopping_list_items';
  const FORBIDDEN_TABLE = 'notes';

  function wrapperFor(queryClient: ReturnType<typeof createTestQueryClient>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it('create enfilé : résout avec la ligne overlay (id + client_key), overlay resté peint', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    const createSpy = vi.spyOn(data, 'create').mockRejectedValue(NETWORK_ERROR);
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useResource(ALLOWED_TABLE), { wrapper: wrapperFor(queryClient) });

    let resolved: unknown;
    let rejection: unknown;
    await act(async () => {
      await result.current.create({ name: 'Café' }).then((row) => (resolved = row), (error) => (rejection = error));
    });

    // L'échec est réel (la mock a bien été appelée) : l'absorption n'est pas
    // un court-circuit de l'appel.
    expect(createSpy).toHaveBeenCalledOnce();
    expect(rejection).toBeUndefined();
    const row = resolved as Record<string, unknown>;
    expect(typeof row.id).toBe('string');
    expect(typeof row.client_key).toBe('string');

    // L'overlay RESTE peint dans le cache (symétrie WR-02).
    const key = queryKeys.table(ALLOWED_TABLE, DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID });
    const cached = queryClient.getQueryData<Record<string, unknown>[]>(key) ?? [];
    expect(cached.some((candidate) => candidate.id === row.id && candidate.client_key === row.client_key)).toBe(true);
  });

  it('update et remove enfilés : update résout avec la ligne fusionnée du cache, remove résout', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    const existing = { id: 'a', household_id: DEMO_HOUSEHOLD_ID, name: 'Beurre', checked: false };
    const key = queryKeys.table(ALLOWED_TABLE, DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID });
    queryClient.setQueryData(key, [existing]);
    vi.spyOn(data, 'update').mockRejectedValue(NETWORK_ERROR);
    vi.spyOn(data, 'remove').mockRejectedValue(NETWORK_ERROR);
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useResource(ALLOWED_TABLE), { wrapper: wrapperFor(queryClient) });

    let updateRejection: unknown;
    let updated: Record<string, unknown> | undefined;
    await act(async () => {
      await result.current
        .update('a', { name: 'Beurre salé' })
        .then((row) => (updated = row as Record<string, unknown>), (error) => (updateRejection = error));
    });
    expect(updateRejection).toBeUndefined();
    expect(updated?.name).toBe('Beurre salé');

    // L'overlay (ligne fusionnée) reste peint — WR-02.
    const cached = queryClient.getQueryData<Record<string, unknown>[]>(key) ?? [];
    expect(cached[0]?.name).toBe('Beurre salé');

    let removeRejection: unknown;
    await act(async () => {
      await result.current.remove('a').catch((error) => (removeRejection = error));
    });
    expect(removeRejection).toBeUndefined();
  });

  it('refus métier et table hors liste : le rejet se propage et l’overlay est retiré (WR-02)', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    const dataError = new DataError('new row violates row-level security policy', { code: '42501', status: 403 });
    vi.spyOn(data, 'list').mockResolvedValue([]);
    vi.spyOn(data, 'create').mockRejectedValue(dataError);
    vi.spyOn(data, 'update').mockRejectedValue(dataError);

    // Refus métier sur table allowlistée : rejet + overlay retiré.
    const { result } = renderHook(() => useResource(ALLOWED_TABLE), { wrapper: wrapperFor(queryClient) });
    await expect(result.current.create({ name: 'Café' })).rejects.toThrow('row-level security');
    const key = queryKeys.table(ALLOWED_TABLE, DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID });
    expect(queryClient.getQueryData<unknown[]>(key) ?? []).toHaveLength(0);

    // Idem update : snapshot restauré (WR-02).
    const existing = { id: 'a', household_id: DEMO_HOUSEHOLD_ID, name: 'Beurre' };
    queryClient.setQueryData(key, [existing]);
    await expect(result.current.update('a', { name: 'X' })).rejects.toThrow('row-level security');
    expect((queryClient.getQueryData<Record<string, unknown>[]>(key) ?? [])[0]?.name).toBe('Beurre');

    // Échec réseau sur table HORS liste : rejet — le prédicat ferme la porte.
    // Second hook, car le prédicat est propre à CHAQUE instance de hook : la
    // table fait partie du montage, pas de l'appel. En ligne : la garde
    // upfront D-07 ne parle qu'hors ligne, l'échec vient donc du transport —
    // et le prédicat (table hors liste) ne l'absorbe pas.
    vi.spyOn(data, 'create').mockRejectedValue(NETWORK_ERROR);
    onlineManager.setOnline(true);
    const forbidden = renderHook(() => useResource(FORBIDDEN_TABLE), { wrapper: wrapperFor(queryClient) });
    await expect(forbidden.result.current.create({ title: 'note' })).rejects.toThrow('NetworkError');
  });

  it('invariant T-34-14 : le prédicat du hook recopie exactement le filtre onError du MutationCache', async () => {
    // Comportemental : le prédicat exporté par useResource renvoie VRAI
    // uniquement sur (table allowlistée ET échec réseau) — jamais sur un
    // refus métier ni sur une table hors liste.
    const NETWORK_ERROR = new TypeError('Failed to fetch');
    const dataError = new DataError('duplicate key', { code: '23505' });
    expect(isEnqueuedFailure(ALLOWED_TABLE, NETWORK_ERROR)).toBe(true);
    expect(isEnqueuedFailure(ALLOWED_TABLE, dataError)).toBe(false);
    expect(isEnqueuedFailure(FORBIDDEN_TABLE, NETWORK_ERROR)).toBe(false);

    // Divergence refusée : les deux expressions doivent vivre l'une dans
    // l'autre — le catch du hook doit appeler isEnqueuedFailure, et le
    // filtre onError de query-policy doit rester
    // (allowlist ET réseau). Un test de texte, faible par nature (§2.7 D),
    // qui ne sert qu'à refuser qu'une des deux couches change seule.
    const hookSource = await readFile('src/lib/data/useResource.ts', 'utf8');
    const policySource = await readFile('src/lib/query-policy.ts', 'utf8');
    expect(hookSource).toContain('isEnqueuedFailure(table, error)');
    expect(policySource).toContain('isWriteAllowed(marker.table)');
    expect(policySource).toContain('isNetworkFailure(error)');
  });
});

/**
 * 35-10 (G-35-6) : le garde de composition partage — même mécanique que la
 * substitution interne de `useResource`, exposé pour les annexes `useQuery`
 * brutes des hooks (tâches, routines). Trois branches : substitution honnête
 * hors ligne sans données (cause préservée), null avec données (D-09),
 * erreur brute en ligne (D-11 n'édulcore rien en ligne).
 */
describe('composeOfflineAwareError (G-35-6)', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  it('hors ligne + en erreur + sans données : message honnête, cause préservée', () => {
    onlineManager.setOnline(false);
    const brute = new TypeError('failed to fetch');
    const composee = composeOfflineAwareError({ isError: true, data: undefined, error: brute });
    expect(composee).toBeInstanceOf(Error);
    expect(composee?.message).toBe(MESSAGE_HORS_LIGNE_SANS_DONNEES);
    expect(composee?.cause).toBe(brute);
  });

  it('en ligne : l’erreur brute passe telle quelle', () => {
    onlineManager.setOnline(true);
    const brute = new TypeError('failed to fetch');
    expect(composeOfflineAwareError({ isError: true, data: undefined, error: brute })).toBe(brute);
  });

  it('avec des données en cache : null (D-09 — les lignes rendues restent autoritaires)', () => {
    onlineManager.setOnline(false);
    expect(composeOfflineAwareError({ isError: true, data: [{ id: 't1' }], error: new TypeError('failed to fetch') })).toBeNull();
  });

  it('sans erreur : null, quel que soit l’état réseau', () => {
    expect(composeOfflineAwareError({ isError: false, data: undefined, error: null })).toBeNull();
  });
});
