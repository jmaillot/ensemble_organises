import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/toast';
import { buildQueryClient } from '@/lib/query-policy';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { outboxKeyFor, type OutboxEntry } from '@/lib/offline/outbox';
import { replayOutbox } from '@/lib/offline/outbox-replay';
import { OFFLINE_WRITE_REFUSED_MESSAGE, assertWriteAllowed } from '@/lib/data/write-policy';
import { data, DataError } from '@/lib/data';
import type { ProductRow, ShoppingListItemRow } from '@/types';
import { useCourses } from './hooks/use-courses';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';

/**
 * Régression de bout en bout de G-34-1 (plan 34-05, WRQ-02/WRQ-06) :
 * créer un article Courses HORS LIGNE n'émet aucune écriture réseau —
 * l'écriture est enfilée dans l'outbox par le MutationCache (D-02), la ligne
 * optimiste (overlay) reste peinte, et le rejeu la réconcilie sans doublon.
 *
 * MONTAGE RÉEL : le client vient de `buildQueryClient` (politique réelle, la
 * fabrique installe le MutationCache central), le hook `useCourses` est le
 * hook de production, et `data` est l'adaptateur Supabase RÉEL posé sur un
 * faux client `@/lib/supabase/client` :
 * - les LECTURES réussissent (magasin local simulé) ;
 * - les ÉCRITURES lèvent TypeError('Failed to fetch') tant que le réseau est
 *   déclaré coupé — exactement l'incident transport que supabase-js produit
 *   hors ligne, sans émettre de fetch réel.
 */

const HOISTED = vi.hoisted(() => {
  /** Magasin par table — les tests le sèment et le lisent. */
  const store: Record<string, Record<string, unknown>[]> = {};
  /** Journal des appels `from(table)` — la preuve « zéro appel » de la classe. */
  const fromCalls: string[] = [];
  /** Quand faux, TOUTE écriture lève TypeError (incident transport). */
  const state = { writesSucceed: false };
  return { store, fromCalls, state };
});

vi.mock('@/lib/supabase/client', () => {
  function rowsOf(table: string): Record<string, unknown>[] {
    HOISTED.store[table] ??= [];
    return HOISTED.store[table];
  }
  function matches(row: Record<string, unknown>, filters: [string, unknown][]): boolean {
    return filters.every(([key, value]) =>
      Array.isArray(value) ? (value as unknown[]).includes(row[key]) : row[key] === value,
    );
  }
  function makeBuilder(table: string) {
    const pending: { filters: [string, unknown][]; payload: Record<string, unknown> | null; op: string } = {
      filters: [],
      payload: null,
      op: 'select',
    };
    const failOrThrow = () => {
      if (!HOISTED.state.writesSucceed) throw new TypeError('Failed to fetch');
    };
    const commit = (): Record<string, unknown> | null => {
      try {
        failOrThrow();
      } catch (transportError) {
        // UAT-34-1 : depuis l'absorption de l'échec enfilé (D-02) dans
        // useResource, la promesse de création RÉSOUT et le module invalide
        // ses requêtes — la relecture révèle ce magasin. Il simule l'état
        // APRÈS rejeu : l'écriture est enfilée dans l'outbox, pas perdue, et
        // le rejeu (scénario f) upsert en dédupliquant par client_key, donc
        // aucune doublon n'est créé. Le transport lève quand même : le
        // verdict « aucun succès réseau » reste porté par le throw.
        if (pending.op === 'insert' || pending.op === 'upsert') {
          const rows = rowsOf(table);
          const clientKey = pending.payload?.client_key;
          const existing = clientKey ? rows.find((row) => row.client_key === clientKey) : undefined;
          if (existing) Object.assign(existing, pending.payload);
          else if (clientKey) rows.push({ ...pending.payload });
        }
        throw transportError;
      }
      const rows = rowsOf(table);
      if (pending.op === 'insert') {
        rows.push({ ...pending.payload });
        return pending.payload;
      }
      if (pending.op === 'update') {
        const target = rows.find((row) => matches(row, pending.filters));
        if (target) Object.assign(target, pending.payload);
        // `target` peut être indéfini (id absent du magasin) : l'adaptateur
        // lit `error` dans ce cas, que le faux client ne produit pas — les
        // scénarios n'écrivent que sur des lignes semées.
        return target ?? null;
      }
      if (pending.op === 'upsert') {
        const clientKey = pending.payload?.client_key;
        const existing = clientKey ? rows.find((row) => row.client_key === clientKey) : undefined;
        if (existing) {
          Object.assign(existing, pending.payload);
          return existing;
        }
        rows.push({ ...pending.payload });
        return pending.payload;
      }
      return null;
    };
    const builder = {
      select: () => builder,
      single: () =>
        Promise.resolve().then(() => {
          const row = commit();
          return { data: row, error: null };
        }),
      insert: (payload: Record<string, unknown>) => {
        pending.op = 'insert';
        pending.payload = payload;
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        pending.op = 'update';
        pending.payload = payload;
        return builder;
      },
      delete: () => {
        pending.op = 'delete';
        return builder;
      },
      upsert: (payload: Record<string, unknown>) => {
        pending.op = 'upsert';
        pending.payload = payload;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        pending.filters.push([key, value]);
        return builder;
      },
      in: (key: string, value: unknown) => {
        pending.filters.push([key, value]);
        return builder;
      },
      is: (key: string, value: unknown) => {
        pending.filters.push([key, value]);
        return builder;
      },
      then: (onFulfilled: unknown, onRejected: unknown) =>
        Promise.resolve()
          .then(() => ({ data: rowsOf(table).filter((row) => matches(row, pending.filters)), error: null }))
          .then(onFulfilled as never, onRejected as never),
    };
    return builder;
  }
  const fakeClient = {
    from: (table: string) => {
      HOISTED.fromCalls.push(table);
      return makeBuilder(table);
    },
    channel: () => ({
      on: () => fakeClient.channel(),
      subscribe: (cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED');
        return fakeClient.channel();
      },
    }),
    removeChannel: () => Promise.resolve(),
  };
  return {
    supabaseUrl: 'https://api.tests.local',
    supabasePublishableKey: 'sb_publishable_test',
    isSupabaseConfigured: true,
    supabase: fakeClient,
    supabaseFunctionsBase: 'https://api.tests.local/functions/v1',
  };
});

const USER_ID = 'user-a';

function makeClient(): QueryClient {
  return buildQueryClient({ queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } });
}

function outboxEntries(client: QueryClient): OutboxEntry[] {
  return client.getQueryData<OutboxEntry[]>(outboxKeyFor(USER_ID, DEMO_HOUSEHOLD_ID)) ?? [];
}

function establishSession() {
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: USER_ID, email: 'a@b.c', displayName: 'A', avatarUrl: null, provider: 'email' },
  });
  useHouseholdStore.setState({
    householdId: DEMO_HOUSEHOLD_ID,
    currentMemberId: 'member-camille',
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, children));
  };
}

/** Sème un produit connu du foyer (lecture = réussie même hors ligne). */
function seedProduct(ean: string): ProductRow {
  const row: ProductRow = {
    id: `product-${ean}`,
    household_id: DEMO_HOUSEHOLD_ID,
    ean,
    name: 'Produit connu',
    brand: null,
    category: 'Frais',
    photo_url: null,
    off_data: {},
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as ProductRow;
  HOISTED.store['products'] ??= [];
  HOISTED.store['products'].push(row as unknown as Record<string, unknown>);
  return row;
}

/**
 * Row d'article peinte dans le cache (l'overlay inclus). L'overlay porte
 * TOUJOURS l'identité client (`id` + `client_key`) posée par `prepareCreate`
 * — le type de ligne métier ne les déclare pas, l'intersection les rend
 * lisibles dans les assertions.
 */
type OverlayRow = ShoppingListItemRow & { id: string; client_key: string };

/** Row d'article peinte dans le cache (l'overlay inclus). */
function cachedItemRows(client: QueryClient): OverlayRow[] {
  const entries = client.getQueryCache().findAll({ queryKey: ['shopping_list_items'] });
  return entries.flatMap((entry) => (entry.state.data as OverlayRow[] | undefined) ?? []);
}

beforeEach(() => {
  HOISTED.store['products'] = [];
  HOISTED.store['shopping_list_items'] = [];
  HOISTED.store['notes'] = [];
  HOISTED.fromCalls.length = 0;
  HOISTED.state.writesSucceed = false;
  establishSession();
});

afterEach(() => {
  onlineManager.setOnline(true);
  useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  useHouseholdStore.getState().reset();
  vi.restoreAllMocks();
});

describe('écritures Courses hors ligne — file d\'écriture et rejeu (G-34-1)', () => {
  it('(a) addItem hors ligne : overlay peint (id + client_key), écriture enfilée, aucun TypeError remonté', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    // La charge initiale est terminée AVANT la coupure : sinon le résultat de
    // la toute première lecture (magasin encore vide) arrive APRÈS l'overlay
    // optimiste et l'écrase — artefact de calendrier du faux client (les
    // lectures réussissent hors ligne), pas le comportement visé.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    onlineManager.setOnline(false);

    // Aucune écriture réseau : le transport lève (TypeError simulé par le faux
    // client), le MutationCache l'absorbe en enfilage. La couche hook
    // re-propage l'erreur d'origine (D-10 : les erreurs d'origine s'affichent)
    // — l'UI l'attrape et toaste ; le verdict porte sur l'enfilage et
    // l'overlay, pas sur la propagation.
    await act(async () => {
      await result.current
        .addItem({ listId: 'l1', newListName: '', name: 'Beurre', quantity: '', unit: '', rayon: 'Crèmerie & Produits laitiers', off: null })
        .catch(() => undefined);
    });

    const rows = cachedItemRows(client);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].id).toBe('string');
    expect(typeof rows[0].client_key).toBe('string');

    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      table: 'shopping_list_items',
      operation: 'create',
      status: 'pending',
      id: rows[0].id,
      clientKey: rows[0].client_key,
    });
  });

  it('(b) addItemToList hors ligne : même verdict, une écriture enfilée', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    // Même attente que (a) : la première lecture ne doit pas écraser
    // l'overlay après coup.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    onlineManager.setOnline(false);

    await act(async () => {
      await result.current.addItemToList('l1', 'Café').catch(() => undefined);
    });

    expect(cachedItemRows(client)).toHaveLength(1);
    expect(outboxEntries(client)).toHaveLength(1);
    expect(outboxEntries(client)[0].operation).toBe('create');
  });

  it('(c) re-scan d\'un produit CONNU hors ligne : l\'article s\'enfile, aucune fiche créée', async () => {
    const product = seedProduct('1234567890123');
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    // Même attente que (a) : la première lecture ne doit pas écraser
    // l'overlay après coup.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    onlineManager.setOnline(false);

    await act(async () => {
      await result.current.addScannedToList('l1', '1234567890123').catch(() => undefined);
    });

    // L'article part en file — c'est le D-06 qu'aucun refus ne casse.
    expect(outboxEntries(client)).toHaveLength(1);
    expect(outboxEntries(client)[0]).toMatchObject({ table: 'shopping_list_items', operation: 'create' });
    // Aucune écriture de fiche : le magasin produits n'a pas bougé.
    expect(HOISTED.store['products']).toHaveLength(1);
    expect(HOISTED.store['products'][0].id).toBe(product.id);
  });

  it('(d) produit INCONNU hors ligne : refus DataError avant toute écriture d\'article, zéro entrée', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    onlineManager.setOnline(false);

    // Mutateurs qui feraient échouer le test s'ils étaient appelés : le refus
    // doit arriver AVANT toute écriture d'article.
    const createItem = vi.fn();
    const { resolveScannedProduct } = await import('./products-api');
    await expect(
      resolveScannedProduct(
        { householdId: DEMO_HOUSEHOLD_ID, listId: 'l1', ean: '9999999999999', name: 'Inconnu' },
        { createItem, updateItem: vi.fn() },
      ),
    ).rejects.toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
    expect(createItem).not.toHaveBeenCalled();
    expect(outboxEntries(client)).toHaveLength(0);
    expect(cachedItemRows(client)).toHaveLength(0);

    // Le hook lui-même reste inchangé pour l'utilisateur : l'article connu
    // est requis d'abord (message existant).
    await expect(result.current.addScannedToList('l1', '9999999999999')).rejects.toThrow('Produit inconnu');
    expect(outboxEntries(client)).toHaveLength(0);
  });

  it('(e) classe : data.create sur une table hors liste hors ligne lève le refus français, avant tout appel réseau', async () => {
    const client = makeClient();
    renderHook(() => useCourses(), { wrapper: wrapper(client) });
    onlineManager.setOnline(false);

    await expect(data.create('notes', { title: 'x' })).rejects.toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
    await expect(data.create('notes', { title: 'x' })).rejects.toBeInstanceOf(DataError);
    // La garde jette AVANT la construction de la requête : `from('notes')`
    // n'a jamais été touché par l'écriture.
    expect(HOISTED.fromCalls).not.toContain('notes');
    // Et la garde directe porte le même message (filet Task 1).
    expect(() => assertWriteAllowed('notes')).toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
  });

  it('(f) retour en ligne : replayOutbox réconcilie — id et client_key préservés, file vide', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    // Même attente que (a) : la première lecture ne doit pas écraser
    // l'overlay après coup — l'assertion d'identité en dépend.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    onlineManager.setOnline(false);
    await act(async () => {
      await result.current
        .addItem({ listId: 'l1', newListName: '', name: 'Beurre', quantity: '', unit: '', rayon: 'Crèmerie & Produits laitiers', off: null })
        .catch(() => undefined);
    });

    const overlay = cachedItemRows(client)[0];
    expect(overlay).toBeDefined();

    // Le réseau revient : les écritures réussissent, la passe rejoue via
    // l'adaptateur par défaut (`data`) — upsert idempotent sur
    // (household_id, client_key).
    onlineManager.setOnline(true);
    HOISTED.state.writesSucceed = true;
    const replay = await replayOutbox(client, USER_ID, DEMO_HOUSEHOLD_ID);
    expect(replay).toEqual({ applied: 1, failed: 0 });

    // La file est vide : le badge retombe à zéro.
    expect(outboxEntries(client)).toHaveLength(0);

    // La ligne serveur porte EXACTEMENT l'identité client : pas de doublon,
    // pas de réallocation d'identité (assert sur l'identité conservée).
    const stored = HOISTED.store['shopping_list_items'];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(overlay.id);
    expect(stored[0].client_key).toBe(overlay.client_key);
    expect(stored[0].name).toBe('Beurre');

    // L'invalidation post-rejeu ramène la ligne serveur dans le cache.
    await waitFor(() => {
      const rows = cachedItemRows(client);
      expect(rows.some((row) => row.id === overlay.id && row.client_key === overlay.client_key)).toBe(true);
    });
  });

  it('(g) ajout hors-ligne enfilé : la promesse résout, AUCUN toast d\'erreur — seulement le badge (UAT-34-1, D-11/D-12)', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useCourses(), { wrapper: wrapper(client) });
    // Même attente que (a) : la première lecture ne doit pas écraser
    // l'overlay après coup.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    onlineManager.setOnline(false);

    // UAT-34-1 : l'ajout hors-ligne est enfilé dans l'outbox (D-02) — la
    // promesse DOIT résoudre, l'incident transport ne traverse plus la couche
    // hook. Le pending se lit sur le badge, le toast d'erreur ne porte plus
    // que les refus réels (D-11/D-12). Pas de `.catch(() => undefined)` :
    // c'est le changement de verdict, un rejet ici ferait échouer le test.
    let outcome: 'resolved' | { rejected: unknown } = 'resolved';
    await act(async () => {
      await result.current.addItemToList('l1', 'Café').then(
        () => undefined,
        (error) => (outcome = { rejected: error }),
      );
    });
    expect(outcome).toBe('resolved');

    // ZÉRO toast : le ToastProvider du wrapper peint chaque toast dans le
    // document (role="status", fond coral-text pour le niveau erreur). La
    // preuve d'absence est observable et falsifiable — un toast émis
    // rougirait le sélecteur.
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0);

    // L'écriture est enfilée et l'overlay peint : l'utilisateur voit la
    // ligne et le badge.
    const entries = outboxEntries(client);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ table: 'shopping_list_items', operation: 'create', status: 'pending' });
    const rows = cachedItemRows(client);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].id).toBe('string');
    expect(typeof rows[0].client_key).toBe('string');
  });
});
