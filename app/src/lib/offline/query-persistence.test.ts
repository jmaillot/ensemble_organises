import { describe, expect, it } from 'vitest';
import { buildQueryClient } from '@/lib/query-policy';
import {
  cacheKey,
  connectOfflineCache,
  persistNow,
  pruneExpiredFamilies,
  purgeCache,
  purgeUserCache,
  restoreOfflineCache,
  stopPersisting,
} from './query-persistence';
import { createStore, entries, get } from 'idb-keyval';

// La base de test est isolée par fichier : ce module écrit dans la même base
// `eo-offline-cache` que le code de prod, mais fake-indexeddb reçoit un nom
// unique par suite via src/test/setup.ts. Pour lire la clé persistée dans les
// assertions, on ouvre un store du même nom que le module.
const probeStore = createStore('eo-offline-cache', 'query');

const LINES = [
  { id: 't1', name: "Sortir les poubelles", position: 0 },
  { id: 't2', name: "Passer l'aspirateur", position: 1 },
];

describe('query-persistence (tracer OFFR-01)', () => {
  it('seed → persist → restore → lecture sur un client neuf', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);

    await persistNow(source, "user-a", "h1", { throttleTime: 0 });

    // La clé composée est bien écrite dans la base IndexedDB (D-03).
    await expect(get(cacheKey('user-a', 'h1'), probeStore)).resolves.toContain('"tasks"');

    const restored = buildQueryClient({ queries: { retry: false } });
    await restoreOfflineCache(restored, 'user-a', 'h1');
    expect(restored.getQueryData(['tasks', 'h1', {}, null])).toEqual(LINES);
  });

  it('le restore est idempotent : rejoué, il produit le même état sans duplication', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(source, "user-a", "h1", { throttleTime: 0 });

    const restored = buildQueryClient({ queries: { retry: false } });
    await restoreOfflineCache(restored, 'user-a', 'h1');
    const afterFirst = restored.getQueryData(['tasks', 'h1', {}, null]);
    await restoreOfflineCache(restored, 'user-a', 'h1');
    const afterSecond = restored.getQueryData(['tasks', 'h1', {}, null]);

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toEqual(LINES);
    // Une seule entrée de cache pour la clé : aucune duplication.
    expect(restored.getQueryCache().getAll().filter((q) => q.queryKey[0] === 'tasks')).toHaveLength(1);
  });

  it("le restore de l'utilisateur B ne lit jamais la clé de l'utilisateur A (T-33-01)", async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(source, "user-a", "h1", { throttleTime: 0 });

    const clientB = buildQueryClient({ queries: { retry: false } });
    await restoreOfflineCache(clientB, 'user-b', 'h1');
    expect(clientB.getQueryData(['tasks', 'h1', {}, null])).toBeUndefined();
  });

  it('purgeCache supprime la clé composée du couple (utilisateur, foyer)', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(source, "user-a", "h1", { throttleTime: 0 });

    await purgeCache('user-a', 'h1');
    await expect(get(cacheKey('user-a', 'h1'), probeStore)).resolves.toBeUndefined();
  });

  it('hors allowlist, une famille n\'est PAS sérialisée : filtrage à l\'écriture (D-01, T-33-06)', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);
    // Famille Tier 2 (notes) : ne doit JAMAIS toucher le disque.
    source.setQueryData(['notes', 'h1', {}, null], [{ id: 'n1', content: 'privé' }]);

    await persistNow(source, 'user-a', 'h1', { throttleTime: 0 });

    const raw = await get<string>(cacheKey('user-a', 'h1'), probeStore);
    expect(raw).toBeTruthy();
    expect(raw).toContain('"tasks"');
    expect(raw).not.toContain('"notes"');
  });

  it('pruneExpiredFamilies écarte une famille vivante de plus de 24 h et garde la fraîche (D-09, T-33-07)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h1', {}, null], LINES);
    client.setQueryData(['shopping_lists', 'h1', {}, null], [{ id: 'l1', name: 'Courses' }]);
    // Le maxAge s'évalue sur dataUpdatedAt : on vieillit artificiellement la
    // famille tasks de 25 h, shopping_lists reste à maintenant.
    const day = 24 * 60 * 60 * 1000;
    const aged = client.getQueryCache().find({ queryKey: ['tasks', 'h1', {}, null] });
    expect(aged).not.toBeNull();
    aged!.setState({ dataUpdatedAt: Date.now() - day - 60 * 60 * 1000 });

    pruneExpiredFamilies(client);

    expect(client.getQueryData(['tasks', 'h1', {}, null])).toBeUndefined();
    expect(client.getQueryData(['shopping_lists', 'h1', {}, null])).toEqual([{ id: 'l1', name: 'Courses' }]);
  });

  it('pruneExpiredFamilies garde une annexe à 6 jours, l\'écarte à 8 jours (D-10)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['profiles', 'h1', {}, null], [{ id: 'p1', display_name: 'Marie' }]);
    const day = 24 * 60 * 60 * 1000;
    const sixDays = client.getQueryCache().find({ queryKey: ['profiles', 'h1', {}, null] })!;
    sixDays.setState({ dataUpdatedAt: Date.now() - 6 * day });
    pruneExpiredFamilies(client);
    expect(client.getQueryData(['profiles', 'h1', {}, null])).toBeDefined();

    const eightDays = client.getQueryCache().find({ queryKey: ['profiles', 'h1', {}, null] })!;
    eightDays.setState({ dataUpdatedAt: Date.now() - 8 * day });
    pruneExpiredFamilies(client);
    expect(client.getQueryData(['profiles', 'h1', {}, null])).toBeUndefined();
  });

  it('pruneExpiredFamilies ne touche pas aux familles hors allowlist', () => {
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['notes', 'h1', {}, null], [{ id: 'n1' }]);
    const notes = client.getQueryCache().find({ queryKey: ['notes', 'h1', {}, null] })!;
    notes.setState({ dataUpdatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 });

    pruneExpiredFamilies(client);

    // Hors allowlist : jamais hydratée de toute façon — la prune ne dit rien.
    expect(client.getQueryData(['notes', 'h1', {}, null])).toEqual([{ id: 'n1' }]);
  });

  it('connectOfflineCache restaure, élagué, puis souscrit le persist (OFFR-01)', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(source, 'user-a', 'h1', { throttleTime: 0 });

    const fresh = buildQueryClient({ queries: { retry: false } });
    await connectOfflineCache(fresh, 'user-a', 'h1', { throttleTime: 0 });
    // Restore a eu lieu (OFFR-01) et la souscription est prise : la donnée
    // est là, et un évènement de cache postérieur repart en écriture.
    expect(fresh.getQueryData(['tasks', 'h1', {}, null])).toEqual(LINES);
    fresh.setQueryData(['tasks', 'h1', {}, null], [...LINES, { id: 't3', name: 'Nouvelle', position: 2 }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const raw = await get<string>(cacheKey('user-a', 'h1'), probeStore);
    expect(raw).toContain('Nouvelle');
  });
});

/**
 * OFFR-04 (plan 33-04) : purge utilisateur et preuve appareil partagé (D-06).
 * Les assertions lisent le stockage BRUT (entries du store de cache), bornées
 * à ce store (§2.7 D) — c'est la lecture brute qui distingue une purge réelle
 * d'une purge supposée.
 */
describe('purgeUserCache (OFFR-04, D-03/D-06)', () => {
  it('aucune donnée de A ne survit à la déconnexion attendue (appareil partagé simulé, D-06)', async () => {
    // 1. User A consulte : seed + sauvegarde immédiate.
    const clientA = buildQueryClient({ queries: { retry: false } });
    clientA.setQueryData(['tasks', 'h1', {}, null], [{ id: 't1', name: 'marque-A' }]);
    await persistNow(clientA, 'userA', 'h1', { throttleTime: 0 });
    await expect(get(cacheKey('userA', 'h1'), probeStore)).resolves.toContain('marque-A');

    // 2. Déconnexion ATTENDUE (await) — le contrat D-05.
    await purgeUserCache('userA');

    // 3. Lecture BRUTE du store : aucune clé de A ne survit (tous foyers, D-03).
    const restantes = (await entries<string>(probeStore)).filter(([key]) => key.startsWith(cacheKey('userA', '')));
    expect(restantes).toEqual([]);

    // 4. Et le restore de B ne voit rien de A (assertion bornée au cache).
    const clientB = buildQueryClient({ queries: { retry: false } });
    await restoreOfflineCache(clientB, 'userB', 'h1');
    expect(clientB.getQueryData(['tasks', 'h1', {}, null])).toBeUndefined();
  });

  it('la purge de A ne supprime AUCUNE clé de B (deux utilisateurs coexistants)', async () => {
    const clientA = buildQueryClient({ queries: { retry: false } });
    clientA.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(clientA, 'userA', 'h1', { throttleTime: 0 });

    const clientB = buildQueryClient({ queries: { retry: false } });
    clientB.setQueryData(['tasks', 'h2', {}, null], LINES);
    await persistNow(clientB, 'userB', 'h2', { throttleTime: 0 });

    await purgeUserCache('userA');

    await expect(get(cacheKey('userA', 'h1'), probeStore)).resolves.toBeUndefined();
    await expect(get(cacheKey('userB', 'h2'), probeStore)).resolves.toContain('"tasks"');
  });

  it('purgeUserCache(null) est un no-op toléré (mode démo, Pitfall 7)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(client, 'userA', 'h1', { throttleTime: 0 });

    await expect(purgeUserCache(null)).resolves.toBeUndefined();

    // Rien n'a bougé : en démo, il n'y a ni utilisateur ni cache à purger.
    await expect(get(cacheKey('userA', 'h1'), probeStore)).resolves.toContain('"tasks"');
  });

  it('après stopPersisting, une sauvegarde throttlée en vol ne recrée pas la clé purgée (Pitfall 6)', async () => {
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h1', {}, null], LINES);
    await persistNow(client, 'userA', 'h1', { throttleTime: 0 });

    // Écriture post-souscription : la sauvegarde throttlée (1 s par défaut)
    // est maintenant EN VOL.
    client.setQueryData(['tasks', 'h1', {}, null], [...LINES, { id: 't3', name: 'en-vol', position: 2 }]);

    // Ordre imposé (Pitfall 6) : unsubscribe AVANT la purge.
    stopPersisting();
    await purgeUserCache('userA');

    // La sauvegarde en vol devait partir ~1 s après l'évènement : elle ne
    // doit PAS recréer la clé. La fenêtre d'observation couvre son échéance.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await expect(get(cacheKey('userA', 'h1'), probeStore)).resolves.toBeUndefined();
  });
});
