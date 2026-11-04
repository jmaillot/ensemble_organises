import { describe, expect, it } from 'vitest';
import { buildQueryClient } from '@/lib/query-policy';
import {
  cacheKey,
  persistNow,
  purgeCache,
  restoreOfflineCache,
} from './query-persistence';
import { createStore, get } from 'idb-keyval';

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
});
