import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createStore, get } from 'idb-keyval';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';

/**
 * Régression du 27/09/2026 : après un ménage manuel côté serveur (foyers
 * supprimés, base restaurée), le `currentMemberId` persisté localement
 * désignait un membre qui n'existait plus. `loadHousehold` le conservait tel
 * quel (`store.currentMemberId || members[0]?.id`), et chaque écriture au nom
 * de ce fantôme était refusée par `validate_member_refs` (23514) — dont la
 * création de liste de cadeaux. Le foyer, lui, se chargeait bien : le
 * symptôme ressemblait à un problème de droits, pas à un identifiant périmé.
 */

const memberships = [
  { id: 'm1', household_id: 'h1', user_id: 'u1', display_name: 'Alice', role: 'admin' },
] as HouseholdMemberRow[];

const households = [{ id: 'h1', name: 'Foyer', avatar_color: 'accent' }] as HouseholdRow[];

const listMock = vi.fn(async (table: string) => {
  if (table === 'household_members') return memberships;
  if (table === 'households') return households;
  return [];
});

vi.mock('@/lib/data', () => ({
  data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

/**
 * OFFR-04 (plan 33-04) : le goulot signOut. La purge passe par
 * `purgeUserCache`, espionnée ici — délégation à l'implémentation réelle par
 * défaut (fake-indexeddb est actif : les assertions lisent le stockage brut),
 * et rejet contrôlé pour le test de blocage (D-05).
 */
const { purgeUserCacheSpy, stopPersistingSpy } = vi.hoisted(() => ({
  purgeUserCacheSpy: vi.fn(),
  stopPersistingSpy: vi.fn(),
}));

vi.mock('@/lib/offline/query-persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offline/query-persistence')>();
  return {
    ...actual,
    purgeUserCache: (...args: Parameters<typeof actual.purgeUserCache>) => purgeUserCacheSpy(...args),
    stopPersisting: () => stopPersistingSpy(),
  };
});

const { loadHousehold } = await import('./session-store');
const { useHouseholdStore } = await import('./household-store');
const { useSessionStore } = await import('./session-store');

describe('loadHousehold et membre courant', () => {
  beforeEach(() => {
    listMock.mockClear();
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null });
  });

  it('conserve le membre persisté quand le serveur le renvoie', async () => {
    useHouseholdStore.setState({ currentMemberId: 'm1' });

    const active = await loadHousehold();

    expect(active?.id).toBe('h1');
    expect(useHouseholdStore.getState().householdId).toBe('h1');
    expect(useHouseholdStore.getState().currentMemberId).toBe('m1');
  });

  it('retombe sur le premier membre quand le persisté est un fantôme', async () => {
    useHouseholdStore.setState({ currentMemberId: 'membre-supprime-cote-serveur' });

    await loadHousehold();

    expect(useHouseholdStore.getState().householdId).toBe('h1');
    expect(useHouseholdStore.getState().currentMemberId).toBe('m1');
  });

  it('désigne la ligne liée à l’utilisateur connecté, pas la première ni la persistée', async () => {
    // Régression : un second compte du même foyer (membre existant, session
    // persistée d'un autre membre ou premier de liste) répondait au nom
    // d'autrui, et la RLS refusait l'insertion (`messages` : « new row
    // violates row-level security policy »).
    const duo = [
      { id: 'm1', household_id: 'h1', user_id: 'u1', display_name: 'Alice', role: 'admin' },
      { id: 'm2', household_id: 'h1', user_id: 'u2', display_name: 'Bob', role: 'membre' },
    ] as HouseholdMemberRow[];
    listMock
      .mockImplementationOnce(async () => duo)
      .mockImplementationOnce(async () => households);
    useHouseholdStore.setState({ currentMemberId: 'm1' });
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: 'u2', email: 'bob@example.fr', displayName: 'Bob', avatarUrl: null, provider: 'email' },
    });

    await loadHousehold();

    expect(useHouseholdStore.getState().currentMemberId).toBe('m2');
  });
});

/**
 * OFFR-04, D-05 (plan 33-04) : la purge de déconnexion vit dans le goulot
 * `useSessionStore.signOut()` — le SEUL chemin par lequel passent les quatre
 * débranchements (use-auth signOut, listener SIGNED_OUT, branches bootstrap
 * sans session, mode local). La lire ICI corrige la classe, pas l'instance
 * (Pitfall 4).
 */
describe('signOut — goulot unique de purge (OFFR-04, D-05)', () => {
  beforeEach(() => {
    purgeUserCacheSpy.mockReset();
    stopPersistingSpy.mockReset();
    // Défaut : délégation à l'implémentation réelle (fake-indexeddb actif).
    purgeUserCacheSpy.mockImplementation(
      async (userId: string | null) => {
        const actual = await vi.importActual<typeof import('@/lib/offline/query-persistence')>(
          '@/lib/offline/query-persistence',
        );
        return actual.purgeUserCache(userId);
      },
    );
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  });

  it('purge les clés de l\'utilisateur AVANT d\'effacer son état, puis remet le foyer', async () => {
    const { persistNow, cacheKey } = await import('@/lib/offline/query-persistence');
    const client = (await import('@/lib/query-policy')).buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h1', {}, null], [{ id: 't1', name: 'de-u1' }]);
    await persistNow(client, 'u1', 'h1', { throttleTime: 0 });

    useSessionStore.setState({
      status: 'authenticated',
      householdLoaded: true,
      user: { id: 'u1', email: 'alice@example.fr', displayName: 'Alice', avatarUrl: null, provider: 'email' },
    });
    useHouseholdStore.setState({ householdId: 'h1' });

    await useSessionStore.getState().signOut();

    // Lecture brute du stockage (bornée au store de cache, §2.7 D) : les clés
    // de u1 ont disparu, et l'état session est effacé.
    const probeStore = createStore('eo-offline-cache', 'query');
    await expect(get(cacheKey('u1', 'h1'), probeStore)).resolves.toBeUndefined();
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).toBe('guest');
    expect(useHouseholdStore.getState().householdId).toBeNull();
  });

  it('une purge qui rejette BLOQUE la déconnexion : l\'état utilisateur reste posé', async () => {
    purgeUserCacheSpy.mockRejectedValue(new Error('IndexedDB indisponible'));
    useSessionStore.setState({
      status: 'authenticated',
      householdLoaded: true,
      user: { id: 'u1', email: 'alice@example.fr', displayName: 'Alice', avatarUrl: null, provider: 'email' },
    });

    await expect(useSessionStore.getState().signOut()).rejects.toThrow('Impossible de vider les données locales');

    // D-05 : l'utilisateur n'est PAS déconnecté — jamais de déconnexion
    // « réussie » qui laisserait ses données derrière elle.
    expect(useSessionStore.getState().user?.id).toBe('u1');
  });

  it('désabonne la sauvegarde AVANT de purger (Pitfall 6 — ordre prouvé)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/offline/query-persistence')>(
      '@/lib/offline/query-persistence',
    );
    const ordre: string[] = [];
    stopPersistingSpy.mockImplementation(() => {
      ordre.push('stop');
      actual.stopPersisting();
    });
    purgeUserCacheSpy.mockImplementation(async () => {
      ordre.push('purge');
    });

    useSessionStore.setState({
      status: 'authenticated',
      user: { id: 'u1', email: 'alice@example.fr', displayName: 'Alice', avatarUrl: null, provider: 'email' },
    });
    await useSessionStore.getState().signOut();

    expect(ordre).toEqual(['stop', 'purge']);
  });

  /**
   * CR-01 (revue 33, D-03/T-33-01) : la frontière mémoire. La purge IndexedDB
   * ne suffit pas — les queries Tier 1 de l'utilisateur restent dans le client
   * mémoire PARTAGÉ (`router.tsx`), et la prochaine sauvegarde du client les
   * ré-sérialise dans la clé du couple suivant. Le goulot `signOut` doit donc
   * vider aussi le client mémoire, et la sérialisation doit refuser toute clé
   * portant un householdId étranger (défense en profondeur).
   */
  it('vide le client mémoire, et la clé persistée de B ne contient rien du foyer de A (CR-01)', async () => {
    const { queryClient } = await import('@/app/router');
    const { persistNow, cacheKey } = await import('@/lib/offline/query-persistence');
    const probeStore = createStore('eo-offline-cache', 'query');
    queryClient.clear(); // isoler le client partagé de l'application

    // 1. A consulte ses tâches → `['tasks', 'hA', …]` en mémoire sur le
    //    client partagé, puis A se déconnecte par le goulot.
    queryClient.setQueryData(['tasks', 'hA', {}, null], [{ id: 't1', name: 'marque-A' }]);
    useSessionStore.setState({
      status: 'authenticated',
      householdLoaded: true,
      user: { id: 'uA', email: 'a@example.fr', displayName: 'A', avatarUrl: null, provider: 'email' },
    });
    await useSessionStore.getState().signOut();

    // 2. La mémoire est vidée : aucune query de A ne survit côté client.
    expect(queryClient.getQueryData(['tasks', 'hA', {}, null])).toBeUndefined();

    // 3. B se connecte et persiste SUR LE MÊME client.
    queryClient.setQueryData(['tasks', 'hB', {}, null], [{ id: 't2', name: 'de-B' }]);
    await persistNow(queryClient, 'uB', 'hB', { throttleTime: 0 });

    // 4. La clé persistée de B ne contient aucune donnée du foyer de A.
    const raw = await get<string>(cacheKey('uB', 'hB'), probeStore);
    expect(raw).toBeTruthy();
    expect(raw).toContain('"tasks"');
    expect(raw).not.toContain('marque-A');
    expect(raw).not.toContain('"hA"');

    queryClient.clear(); // laisser le client partagé propre pour les autres suites
  });
});

/**
 * D-17 (plan 34-04, T-34-08) : scan-avertir-purger. Des écritures pendantes
 * dans la file outbox BLOQUENT la déconnexion tant que l'appelant n'a pas
 * passé `{ acknowledgePendingWrites: true }` — jamais de purge silencieuse
 * d'écritures non parties. La file est lue dans le client mémoire PARTAGÉ de
 * `@/app/router` : le même canal que le goulot au runtime.
 */
describe('signOut — file outbox pendante (D-17, scan-avertir-purger)', () => {
  const OUTBOX_PENDING = {
    key: 'tasks:t1',
    table: 'tasks',
    operation: 'update' as const,
    enqueuedAt: 1,
    status: 'pending' as const,
  };

  const poserSession = () =>
    useSessionStore.setState({
      status: 'authenticated',
      householdLoaded: true,
      user: { id: 'u1', email: 'alice@example.fr', displayName: 'Alice', avatarUrl: null, provider: 'email' },
    });

  beforeEach(async () => {
    purgeUserCacheSpy.mockReset();
    stopPersistingSpy.mockReset();
    purgeUserCacheSpy.mockImplementation(
      async (userId: string | null) => {
        const actual = await vi.importActual<typeof import('@/lib/offline/query-persistence')>(
          '@/lib/offline/query-persistence',
        );
        return actual.purgeUserCache(userId);
      },
    );
    stopPersistingSpy.mockImplementation(async () => {
      const actual = await vi.importActual<typeof import('@/lib/offline/query-persistence')>(
        '@/lib/offline/query-persistence',
      );
      actual.stopPersisting();
    });
    const { queryClient } = await import('@/app/router');
    queryClient.clear();
    const { useHouseholdStore } = await import('./household-store');
    useHouseholdStore.getState().reset();
    useHouseholdStore.setState({ householdId: 'h1' });
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  });

  it('des écritures pendantes rejettent OutboxPendingError et NE purgent PAS', async () => {
    const { queryClient } = await import('@/app/router');
    const { outboxKeyFor } = await import('@/lib/offline/outbox');
    queryClient.setQueryData(outboxKeyFor('u1', 'h1'), [OUTBOX_PENDING]);
    poserSession();

    await expect(useSessionStore.getState().signOut()).rejects.toThrow('écriture en attente');

    // T-34-08 : RIEN n'a été purgé — ni le stockage (espion), ni l'état.
    expect(purgeUserCacheSpy).not.toHaveBeenCalled();
    expect(stopPersistingSpy).not.toHaveBeenCalled();
    expect(useSessionStore.getState().user?.id).toBe('u1');
    // La file elle-même est intacte : l'utilisateur n'a rien perdu.
    expect(queryClient.getQueryData(outboxKeyFor('u1', 'h1'))).toEqual([OUTBOX_PENDING]);
    queryClient.clear();
  });

  it('avec acknowledgePendingWrites, la déconnexion purge tout y compris la file', async () => {
    const { queryClient } = await import('@/app/router');
    const { outboxKeyFor } = await import('@/lib/offline/outbox');
    queryClient.setQueryData(outboxKeyFor('u1', 'h1'), [OUTBOX_PENDING]);
    poserSession();

    await expect(useSessionStore.getState().signOut({ acknowledgePendingWrites: true })).resolves.toBeUndefined();

    expect(purgeUserCacheSpy).toHaveBeenCalledWith('u1');
    expect(useSessionStore.getState().user).toBeNull();
    // La frontière mémoire (CR-01) emporte aussi la file : aucune entrée ne
    // peut ressusciter au prochain sign-in via le client partagé.
    expect(queryClient.getQueryData(outboxKeyFor('u1', 'h1'))).toBeUndefined();
  });

  it('file vide → déconnexion directe sans erreur ni question', async () => {
    poserSession();
    await expect(useSessionStore.getState().signOut()).resolves.toBeUndefined();
    expect(purgeUserCacheSpy).toHaveBeenCalledWith('u1');
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('des écritures ÉCHOUÉES seules ne bloquent pas (le scan ne compte que pending)', async () => {
    const { queryClient } = await import('@/app/router');
    const { outboxKeyFor } = await import('@/lib/offline/outbox');
    queryClient.setQueryData(outboxKeyFor('u1', 'h1'), [
      { ...OUTBOX_PENDING, status: 'failed' as const, failure: { kind: 'terminal' as const, code: '42501', message: 'refus RLS' } },
    ]);
    poserSession();

    // Une écriture terminale a déjà été refusée par le serveur : elle n'est
    // pas « en attente de départ », elle attend une décision humaine. Le
    // scan D-17 ne compte que le pending — même sémantique que la gate
    // 32-D10 (`isEmpty = pendingCount === 0`, contrat préservé).
    await expect(useSessionStore.getState().signOut()).resolves.toBeUndefined();
    expect(useSessionStore.getState().user).toBeNull();
  });
});
