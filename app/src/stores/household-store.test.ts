import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';
import * as householdStore from './household-store';
import { DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';

const { useHouseholdStore } = householdStore;

/**
 * OFFR-04 (plan 33-04) : espions d'ordre sur le module de persistance —
 * délégation à l'implémentation réelle (fake-indexeddb actif), avec journal
 * pour prouver l'ordre stop → purge → clear (Pitfall 5/6).
 */
const { purgeCacheSpy, stopPersistingSpy, realQP } = vi.hoisted(() => ({
  purgeCacheSpy: vi.fn(),
  stopPersistingSpy: vi.fn(),
  // Références réelles capturées dans la factory du mock (ci-dessous) : la
  // délégation des espions doit être SYNCHRONE comme le code de production
  // (`stopPersisting` est un void sync). La délégation historique via
  // `vi.importActual` dans chaque `mockImplementation` était un pont
  // ASYNCHRONE : la mise en silence du persister glissait de quelques tâches
  // sous charge, rouvrant la fenêtre que Pitfall 6 avait fermée — flake D-17
  // reproduit 1/30 (protocole W-02, RETROSPECTIVE.md campagne v1.3).
  realQP: { purgeCache: null, stopPersisting: null } as {
    purgeCache: typeof import('@/lib/offline/query-persistence')['purgeCache'] | null;
    stopPersisting: typeof import('@/lib/offline/query-persistence')['stopPersisting'] | null;
  },
}));

vi.mock('@/lib/offline/query-persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offline/query-persistence')>();
  realQP.purgeCache = actual.purgeCache;
  realQP.stopPersisting = actual.stopPersisting;
  return {
    ...actual,
    purgeCache: (...args: Parameters<typeof actual.purgeCache>) => purgeCacheSpy(...args),
    stopPersisting: () => stopPersistingSpy(),
  };
});

/**
 * D-01/D-04 : le store est le point d'ingestion unique des membres. Le hook
 * `useIsAdult` (admin OU membre) y côtoie `useIsAdmin` (inchangé), et le
 * filtre `deleted_at` y est posé une seule fois, dans `setHousehold` et
 * `setMembers` — un enfant archivé disparaît alors de TOUS les consommateurs
 * (panneau des membres, sélecteurs inline, `useCurrentMember`), sans jamais
 * être supprimé de la base.
 */

const baseMember = {
  household_id: 'h-1',
  user_id: null,
  avatar_url: null,
  color_tag: 'accent',
  created_at: '2026-01-01T00:00:00Z',
} as const;

const memberRow = (
  overrides: Partial<HouseholdMemberRow> & Pick<HouseholdMemberRow, 'id' | 'role'>,
): HouseholdMemberRow => ({
  ...baseMember,
  display_name: 'Membre test',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  ...overrides,
});

const householdRow = {
  id: 'h-1',
  name: 'Foyer Test',
  avatar_color: 'accent',
  school_zone: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  disabled_modules: [],
} as HouseholdRow;

const adulte = memberRow({ id: 'm-adulte', role: 'membre', display_name: 'Adulte' });
const admin = memberRow({ id: 'm-admin', role: 'admin', display_name: 'Admin' });
const enfant = memberRow({ id: 'm-enfant', role: 'enfant', display_name: 'Enfant' });
const enfantArchive = memberRow({
  id: 'm-enfant-archive',
  role: 'enfant',
  display_name: 'Enfant archivé',
  deleted_at: '2026-10-26T10:00:00Z',
});

describe('useIsAdult (D-01)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('retourne true pour un membre courant administrateur', () => {
    useHouseholdStore.setState({ members: [admin], currentMemberId: 'm-admin' });
    expect(typeof householdStore.useIsAdult).toBe('function');
    const { result } = renderHook(() => householdStore.useIsAdult());
    expect(result.current).toBe(true);
  });

  it('retourne true pour « membre » et false pour « enfant »', () => {
    useHouseholdStore.setState({ members: [adulte], currentMemberId: 'm-adulte' });
    const adulteCourant = renderHook(() => householdStore.useIsAdult());
    expect(adulteCourant.result.current).toBe(true);

    useHouseholdStore.setState({ members: [enfant], currentMemberId: 'm-enfant' });
    const enfantCourant = renderHook(() => householdStore.useIsAdult());
    expect(enfantCourant.result.current).toBe(false);
  });
});

describe('useIsAdmin reste inchangé (non-régression)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('est true uniquement pour « admin », false pour membre et enfant', () => {
    useHouseholdStore.setState({ members: [admin], currentMemberId: 'm-admin' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(true);

    useHouseholdStore.setState({ members: [adulte], currentMemberId: 'm-adulte' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(false);

    useHouseholdStore.setState({ members: [enfant], currentMemberId: 'm-enfant' });
    expect(renderHook(() => householdStore.useIsAdmin()).result.current).toBe(false);
  });
});

describe('useMemberRole sur une ligne étendue (typage HouseholdMemberRow)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('lit le rôle d\'une ligne porteuse de birth_date, managed_modules et deleted_at', () => {
    const enfantEtendu = memberRow({
      id: 'm-enfant-etendu',
      role: 'enfant',
      display_name: 'Enfant étendu',
      birth_date: '2016-09-29',
      managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
      deleted_at: null,
    });
    useHouseholdStore.setState({ members: [enfantEtendu], currentMemberId: 'm-enfant-etendu' });
    expect(renderHook(() => householdStore.useMemberRole()).result.current).toBe('enfant');
    // Le store conserve les colonnes étendues telles quelles : aucune
    // normalisation ne doit les amputer en passant par setMembers.
    useHouseholdStore.getState().setMembers([enfantEtendu]);
    expect(useHouseholdStore.getState().members[0]?.birth_date).toBe('2016-09-29');
    expect(useHouseholdStore.getState().members[0]?.managed_modules).toEqual([
      'taches',
      'routines',
      'anniversaires',
      'menu',
    ]);
  });
});

describe('filtre deleted_at en un point unique (D-04)', () => {
  beforeEach(() => {
    useHouseholdStore.getState().reset();
  });

  it('setMembers écarte la ligne archivée et conserve les lignes vivantes', () => {
    useHouseholdStore.getState().setMembers([adulte, enfant, enfantArchive]);
    const ids = useHouseholdStore.getState().members.map((row) => row.id);
    expect(ids).not.toContain('m-enfant-archive');
    expect(ids).toEqual(['m-adulte', 'm-enfant']);
  });

  it('setHousehold applique le même filtre', () => {
    useHouseholdStore.getState().setHousehold(householdRow, [admin, enfantArchive]);
    const ids = useHouseholdStore.getState().members.map((row) => row.id);
    expect(ids).toEqual(['m-admin']);
  });

  it('un enfant deleted_at null mais role « enfant » reste listé (le filtre porte sur l\'archivage, pas le rôle)', () => {
    useHouseholdStore.getState().setMembers([adulte, enfant]);
    expect(useHouseholdStore.getState().members.map((row) => row.id)).toContain('m-enfant');
  });
});

describe('seed démo (Noé, socle D-06)', () => {
  it('porte birth_date, deleted_at null et le socle managed_modules', () => {
    const noe = demoMembers.find((row) => row.id === DEMO_MEMBERS.noe);
    expect(noe).toBeDefined();
    expect(noe?.deleted_at).toBeNull();
    expect(noe?.managed_modules).toEqual(['taches', 'routines', 'anniversaires', 'menu']);
  });
});

/**
 * OFFR-04, D-04 (plan 33-04, Pitfall 5) : le changement de foyer purge le
 * foyer quitté AVANT toute lecture du nouveau — ordre strict purge (await) →
 * queryClient.clear() → switchHousehold. L'ordre est prouvé par un espion sur
 * `clear` : au moment où il s'exécute, la clé IndexedDB du foyer quitté est
 * DÉJÀ supprimée et le householdId du store est ENCORE l'ancien.
 */
describe('switchWithPurge — ordre purge → clear → switch (OFFR-04, D-04)', () => {
  beforeEach(() => {
    purgeCacheSpy.mockReset();
    stopPersistingSpy.mockReset();
    // Délégation SYNCHRONE aux références réelles capturées par la factory du
    // mock : la simulation du harnais colle à la synchronie de production
    // (stopPersisting est un void sync), sans le pont vi.importActual.
    purgeCacheSpy.mockImplementation(
      (...args: Parameters<typeof import('@/lib/offline/query-persistence')['purgeCache']>) =>
        realQP.purgeCache?.(...args),
    );
    stopPersistingSpy.mockImplementation(() => {
      realQP.stopPersisting?.();
    });
  });

  it('purge la clé du foyer quitté, vide le cache mémoire, PUIS pose le nouveau foyer', async () => {
    const { persistNow, cacheKey } = await import('@/lib/offline/query-persistence');
    const { createStore, get } = await import('idb-keyval');
    const { buildQueryClient } = await import('@/lib/query-policy');
    const probeStore = createStore('eo-offline-cache', 'query');

    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h-old', {}, null], [{ id: 't1', name: 'ancien-foyer' }]);
    await persistNow(client, 'u1', 'h-old', { throttleTime: 0 });

    useHouseholdStore.setState({ householdId: 'h-old', householdName: 'Ancien' });

    // Espion d'ordre : le clear doit voir l'ancien foyer ENCORE posé (le
    // switch vient après) ; la purge elle-même est vérifiée par la relecture
    // IndexedDB après coup + l'ordre stop→purge→clear du test suivant.
    const clearRéel = client.clear.bind(client);
    client.clear = () => {
      expect(useHouseholdStore.getState().householdId).toBe('h-old'); // switch APRÈS clear
      clearRéel();
    };

    await useHouseholdStore.getState().switchWithPurge('h-new', 'Nouveau Foyer', client, 'u1');

    expect(client.getQueryCache().getAll()).toEqual([]); // mémoire vidée
    expect(useHouseholdStore.getState().householdId).toBe('h-new');
    expect(useHouseholdStore.getState().householdName).toBe('Nouveau Foyer');
    // Lecture brute : la clé du foyer quitté a disparu du stockage.
    await expect(get(cacheKey('u1', 'h-old'), probeStore)).resolves.toBeUndefined();
  });

  /**
   * D-17 (plan 34-04, T-34-08) : l'outbox PERSISTE dans la clé
   * `cacheKey(userId, householdId)` (phase 34, Pitfall 5 de query-persistence).
   * Le changement de foyer purgera donc la file du foyer quitté SANS
   * confirmation — contrairement à la déconnexion, qui scanne et demande
   * (D-17). Ce test prouve que la purge emporte réellement une file enfile
   * pour le foyer quitté : une écriture jamais partie ne peut pas fuiter
   * vers le foyer suivant ni survivre côté client.
   */
  it('la purge du foyer quitté emporte l\'outbox persistée, sans confirmation (D-17)', async () => {
    const { persistNow, cacheKey } = await import('@/lib/offline/query-persistence');
    const { outboxKeyFor } = await import('@/lib/offline/outbox');
    const { createStore, get } = await import('idb-keyval');
    const { buildQueryClient } = await import('@/lib/query-policy');
    const probeStore = createStore('eo-offline-cache', 'query');

    const client = buildQueryClient({ queries: { retry: false } });
    const fileQuittée = [
      { key: 'tasks:t1', table: 'tasks', operation: 'update' as const, enqueuedAt: 1, status: 'pending' as const },
    ];
    client.setQueryData(outboxKeyFor('u1', 'h-old'), fileQuittée);
    await persistNow(client, 'u1', 'h-old', { throttleTime: 0 });

    useHouseholdStore.setState({ householdId: 'h-old', householdName: 'Ancien' });
    await useHouseholdStore.getState().switchWithPurge('h-new', 'Nouveau Foyer', client, 'u1');

    // La clé persistée du foyer quitté — outbox comprise — a disparu, et le
    // switch n'a JAMAIS demandé confirmation (aucune question posée, aucune
    // erreur levée : `switchWithPurge` s'est résolue normalement).
    const raw = await get<string>(cacheKey('u1', 'h-old'), probeStore);
    expect(raw).toBeUndefined();
    expect(client.getQueryData(outboxKeyFor('u1', 'h-old'))).toBeUndefined();
    expect(useHouseholdStore.getState().householdId).toBe('h-new');
  });

  it('suit strictement l\'ordre stopPersisting → purge → clear (Pitfall 5/6)', async () => {
    const ordre: string[] = [];
    const { persistNow } = await import('@/lib/offline/query-persistence');
    const { buildQueryClient } = await import('@/lib/query-policy');
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h-old', {}, null], [{ id: 't1' }]);
    await persistNow(client, 'u1', 'h-old', { throttleTime: 0 });
    const clearRéel = client.clear.bind(client);
    client.clear = () => {
      ordre.push('clear');
      clearRéel();
    };
    stopPersistingSpy.mockImplementation(() => {
      ordre.push('stop');
    });
    purgeCacheSpy.mockImplementation(async () => {
      ordre.push('purge');
    });

    useHouseholdStore.setState({ householdId: 'h-old' });
    await useHouseholdStore.getState().switchWithPurge('h-new', 'Nouveau Foyer', client, 'u1');

    expect(ordre).toEqual(['stop', 'purge', 'clear']);
  });

  it('sans utilisateur connu (démo), le switch reste un simple changement de foyer', async () => {
    const { buildQueryClient } = await import('@/lib/query-policy');
    const client = buildQueryClient({ queries: { retry: false } });
    useHouseholdStore.setState({ householdId: 'h-old', householdName: 'Ancien' });

    await useHouseholdStore.getState().switchWithPurge('h-new', 'Nouveau Foyer', client, null);

    expect(useHouseholdStore.getState().householdId).toBe('h-new');
    // En démo il n'y a rien à purger, mais le cache mémoire est vidé par
    // prudence : aucune ligne résiduelle ne peut répondre sous le nouveau foyer.
    expect(client.getQueryCache().getAll()).toEqual([]);
  });

  /**
   * WR-03 (revue 33) : après le switch, la persistance est RÉTABLIE sur le
   * nouveau couple (utilisateur, foyer) — sans cela l'app vivrait sans
   * souscription de sauvegarde ni cache restauré jusqu'au prochain bootstrap.
   * Prouvé en lisant le stockage brut : une écriture post-switch part bien
   * vers la clé du NOUVEAU foyer.
   */
  it('rétablit la persistance sur le nouveau couple après le switch (WR-03)', async () => {
    const { cacheKey } = await import('@/lib/offline/query-persistence');
    const { buildQueryClient } = await import('@/lib/query-policy');
    const { createStore, get } = await import('idb-keyval');
    const probeStore = createStore('eo-offline-cache', 'query');
    const client = buildQueryClient({ queries: { retry: false } });

    useHouseholdStore.setState({ householdId: 'h-old', householdName: 'Ancien' });
    await useHouseholdStore.getState().switchWithPurge('h-new', 'Nouveau Foyer', client, 'u1');

    // Écriture post-switch : elle doit partir vers la clé du NOUVEAU foyer —
    // la souscription de sauvegarde a bien repris. WR-03 (revue 33) : le
    // défaut d'origine de CE test était un sommeil fixe de 1 200 ms face au
    // throttle de 1 000 ms du persister (query-persistence.ts, marge 200 ms)
    // — flocon sous charge, reproduit 1/30 par le protocole W-02 (voir
    // RETROSPECTIVE.md, campagne v1.3). L'attente d'état ci-dessous remplace
    // la course assumée : le test attend l'écriture réelle du persister
    // throttlé, quelle que soit l'échéance du throttle.
    client.setQueryData(['tasks', 'h-new', {}, null], [{ id: 't1', name: 'post-switch' }]);
    await vi.waitFor(
      () => expect(get(cacheKey('u1', 'h-new'), probeStore)).resolves.toContain('post-switch'),
      { timeout: 5_000, interval: 50 },
    );
    // Le restore du nouveau foyer a eu lieu avant la souscription : vide ici,
    // mais l'appel est passé (aucune erreur, cache cohérent).
    expect(client.getQueryData(['tasks', 'h-new', {}, null])).toEqual([{ id: 't1', name: 'post-switch' }]);
  });
});
