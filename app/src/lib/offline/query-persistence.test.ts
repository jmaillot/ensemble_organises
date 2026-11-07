import { afterEach, describe, expect, it } from 'vitest';
import { buildQueryClient } from '@/lib/query-policy';
import {
  cacheKey,
  connectOfflineCache,
  getRestoreOutcome,
  inspectPersistedCache,
  OFFLINE_CACHE_BUSTER,
  persistNow,
  pruneExpiredFamilies,
  purgeCache,
  purgeUserCache,
  restoreOfflineCache,
  stopPersisting,
} from './query-persistence';
import { createStore, del, entries, get, set } from 'idb-keyval';

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

  it('pruneExpiredFamilies ne traite pas une query jamais chargée comme périmée (WR-04)', () => {
    const client = buildQueryClient({ queries: { retry: false } });
    // Query montée mais jamais chargée (en attente ou en erreur) :
    // `dataUpdatedAt` vaut 0, ce n'est PAS une donnée périmée.
    client.getQueryCache().build(client, { queryKey: ['tasks', 'h1', {}, null] });
    expect(client.getQueryData(['tasks', 'h1', {}, null])).toBeUndefined();

    const q: any = client.getQueryCache().find({ queryKey: ['tasks', 'h1', {}, null] });
    if (q.state.dataUpdatedAt !== 0) throw new Error('setup: dataUpdatedAt attendu à 0, lu ' + q.state.dataUpdatedAt);
    pruneExpiredFamilies(client);
    const apres = client.getQueryCache().find({ queryKey: ['tasks', 'h1', {}, null] });
    if (apres === null) throw new Error('WR-04 non corrigé : query jamais chargée (dataUpdatedAt=0) supprimée par la prune');
    expect(apres).not.toBeNull();
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

  /**
   * WR-01 (revue 33) : le rebranchement par `persistNow` SEUL (sans
   * `stopPersisting` explicite) doit lui aussi rendre muette la traîne du
   * throttle de l'ANCIEN persister — sinon elle réécrit l'ancienne clé avec
   * l'état courant du client partagé, éventuellement après sa purge.
   */
  it('persistNow rend muette la traîne du throttle de l\'ANCIEN persister (WR-01)', async () => {
    const { del } = await import('idb-keyval');
    const client = buildQueryClient({ queries: { retry: false } });
    client.setQueryData(['tasks', 'h1', {}, null], LINES);
    // throttleTime par défaut (1 s) : l'écriture ci-dessous met une sauvegarde
    // en vol pour l'ANCIEN persister.
    await persistNow(client, 'userA', 'h1');
    client.setQueryData(['tasks', 'h1', {}, null], [...LINES, { id: 't3', name: 'en-vol', position: 2 }]);

    // Simulation d'une purge de l'ancienne clé, puis rebranchement direct par
    // `persistNow` sans passer par `stopPersisting` (ex. reprise du bootstrap).
    await del(cacheKey('userA', 'h1'), probeStore);
    // 35-09 : `persistNow` ne fait PLUS de restore interne (correctif Rule 1 —
    // un second restore ré-hydratait les familles que la prune venait
    // d'écarter). Le client rebranché porte donc ses données h2 explicites :
    // l'assertion ci-dessous prouve la PERSISTANCE du nouveau couple, plus
    // jamais une résurrection du persisté d'un test antérieur.
    client.setQueryData(['tasks', 'h2', {}, null], LINES);
    await persistNow(client, 'userB', 'h2');

    // La traîne de l'ANCIEN persister échoit dans la fenêtre : elle ne doit
    // PAS ressusciter la clé de userA.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await expect(get(cacheKey('userA', 'h1'), probeStore)).resolves.toBeUndefined();
    await expect(get(cacheKey('userB', 'h2'), probeStore)).resolves.toContain('"tasks"');
  });
});

/**
 * 35-09 (gap G-35-5) : introspection du cache persisté et télémétrie du
 * restore. Le diagnostic 35-07 a prouvé que la carte « Failed to fetch »
 * on-device signifiait « entrée de cache persistée absente à l'amorçage à
 * froid » — sans pouvoir dire POURQUOI (jamais persistée ? élaguée > 24 h ?
 * échec IndexedDB avalé par use-auth.ts:263-265 ?). Ces tests prouvent que
 * l'introspection et la télémétrie rendent ces trois causes OBSERVABLES.
 */
describe('inspectPersistedCache (35-09, G-35-5)', () => {
  const USER = 'u-inspect';
  const HH = 'h-inspect';
  const day = 24 * 60 * 60 * 1000;

  afterEach(async () => {
    stopPersisting();
    await purgeCache(USER, HH);
  });

  it('cache vide → { exists: false, families: [] } — l\'absence EST le fait demandé', async () => {
    // Couple jamais persisté : la réponse porte l'absence, elle ne lève pas.
    await expect(inspectPersistedCache('u-jamais', 'h-jamais')).resolves.toEqual({
      exists: false,
      buster: null,
      persistedAt: null,
      families: [],
    });
  });

  it('entrée persistée avec famille fraîche → exists, dataUpdatedAt, âge, maxAge lu d\'OFFLINE_FAMILIES, pruneEligible: false', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], LINES);
    await persistNow(source, USER, HH, { throttleTime: 0 });

    const now = Date.now() + 1000;
    const rapport = await inspectPersistedCache(USER, HH, now);

    expect(rapport.exists).toBe(true);
    // Le buster persisté et l'horodatage de la dernière écriture (champ
    // `timestamp` de l'entrée `PersistedClient` de TanStack) sont portés.
    expect(rapport.buster).toBe(OFFLINE_CACHE_BUSTER);
    expect(typeof rapport.persistedAt).toBe('number');
    expect(rapport.families).toHaveLength(1);
    const tasks = rapport.families[0]!;
    expect(tasks.prefix).toBe('tasks');
    expect(tasks.dataUpdatedAt).toBeGreaterThan(0);
    // L'âge est calculé contre l'horloge fournie, pas deviné.
    expect(tasks.ageMs).toBe(now - tasks.dataUpdatedAt);
    // Le maxAge est LU de la politique (24 h), jamais recopié.
    expect(tasks.maxAgeMs).toBe(day);
    expect(tasks.pruneEligible).toBe(false);
  });

  it('famille dont dataUpdatedAt dépasse maxAgeMs → pruneEligible: true (même prédicat que la prune)', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], LINES);
    const aged = source.getQueryCache().find({ queryKey: ['tasks', HH, {}, null] })!;
    aged.setState({ dataUpdatedAt: Date.now() - day - 60 * 60 * 1000 }); // 25 h
    await persistNow(source, USER, HH, { throttleTime: 0 });

    const rapport = await inspectPersistedCache(USER, HH);

    expect(rapport.families[0]!.pruneEligible).toBe(true);
    expect(rapport.families[0]!.ageMs).toBeGreaterThan(day);
  });

  it('AUCUN contenu de ligne dans le résultat : noms de familles et horodatages seulement (T-35-18)', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], [{ id: 't1', name: 'SECRET-INTROSPECTION' }]);
    await persistNow(source, USER, HH, { throttleTime: 0 });

    const rapport = await inspectPersistedCache(USER, HH);

    // T-35-18 : le rapport ne franchit l'écran QUE par le panneau — sa forme
    // entière est inspectée, aucune valeur de ligne ne doit y figurer.
    expect(JSON.stringify(rapport)).not.toContain('SECRET-INTROSPECTION');
  });

  it('inspectPersistedCache n\'écrit RIEN : l\'entrée persistée garde son identité de contenu', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], LINES);
    await persistNow(source, USER, HH, { throttleTime: 0 });
    const avant = await get<string>(cacheKey(USER, HH), probeStore);

    await inspectPersistedCache(USER, HH);

    const apres = await get<string>(cacheKey(USER, HH), probeStore);
    expect(apres).toBe(avant);
  });
});

/**
 * 35-09 : l'issue du restore — jusque-là avalée par le catch de
 * use-auth.ts:263-265 — est un fait enregistré par `connectOfflineCache`
 * AVANT que le catch du hook ne l'avale. Quatre cas : succès sans prune,
 * succès avec prune, rien-de-persisté (fait distinct d'un échec), échec.
 */
describe('télémétrie du restore — getRestoreOutcome (35-09)', () => {
  const USER = 'u-telemetry';
  const HH = 'h-telemetry';
  const day = 24 * 60 * 60 * 1000;

  afterEach(async () => {
    stopPersisting();
    await purgeCache(USER, HH);
  });

  it('succès sans prune : restoredFamilies compte AVANT prune, prunedFamilies 0, failure null', async () => {
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], LINES);
    await persistNow(source, USER, HH, { throttleTime: 0 });

    const fresh = buildQueryClient({ queries: { retry: false } });
    await connectOfflineCache(fresh, USER, HH, { throttleTime: 0 });

    const outcome = getRestoreOutcome();
    expect(outcome).not.toBeNull();
    expect(outcome!.restoredFamilies).toBe(1);
    expect(outcome!.prunedFamilies).toBe(0);
    expect(outcome!.failure).toBeNull();
    expect(outcome!.at).toBeGreaterThan(0);
  });

  it('succès avec prune : le delta de prune est un fait AFFICHÉ, jamais déduit', async () => {
    // La famille tasks est persistée vieille de 25 h : au restore, elle est
    // hydratée (comptée) PUIS écartée par pruneExpiredFamilies. Sans le
    // comptage avant/après, cette élagage ne laisserait aucune trace et le
    // panneau ne pourrait pas répondre à « était-elle là, élaguée ? ».
    const source = buildQueryClient({ queries: { retry: false } });
    source.setQueryData(['tasks', HH, {}, null], LINES);
    const aged = source.getQueryCache().find({ queryKey: ['tasks', HH, {}, null] })!;
    aged.setState({ dataUpdatedAt: Date.now() - day - 60 * 60 * 1000 });
    await persistNow(source, USER, HH, { throttleTime: 0 });

    const fresh = buildQueryClient({ queries: { retry: false } });
    await connectOfflineCache(fresh, USER, HH, { throttleTime: 0 });
    // La donnée périmée est bien PARTIE du client (D-09 inchangé).
    expect(fresh.getQueryData(['tasks', HH, {}, null])).toBeUndefined();

    const outcome = getRestoreOutcome();
    expect(outcome!.restoredFamilies).toBe(1);
    expect(outcome!.prunedFamilies).toBe(1);
    expect(outcome!.failure).toBeNull();
  });

  it('rien de persisté : 0 famille, failure null — un fait distinct d\'un échec', async () => {
    // Couple jamais persisté : restoreOfflineCache est un no-op honnête.
    const fresh = buildQueryClient({ queries: { retry: false } });
    await connectOfflineCache(fresh, 'u-rien', 'h-rien', { throttleTime: 0 });

    const outcome = getRestoreOutcome();
    expect(outcome!.restoredFamilies).toBe(0);
    expect(outcome!.prunedFamilies).toBe(0);
    expect(outcome!.failure).toBeNull();
    await purgeCache('u-rien', 'h-rien');
  });

  it('échec du restore : la cause du rejet est enregistrée, le rejet reste propagé', async () => {
    // Le rejet est provoqué par une entrée persistée ILLISIBLE : JSON non
    // valide — la désérialisation de TanStack rejette, exactement comme un
    // IndexedDB corrompu le ferait. `set` brut, pas le persister : la clé
    // doit contenir de la donnée cassée, pas une forme valide.
    await set(cacheKey(USER, HH), 'pas-du-json{', probeStore);

    const fresh = buildQueryClient({ queries: { retry: false } });
    // connectOfflineCache enregistre PUIS relance : le catch du hook
    // (use-auth.ts:263-265) garde sa ceinture de sécurité, inchangé.
    await expect(connectOfflineCache(fresh, USER, HH, { throttleTime: 0 })).rejects.toThrow();

    const outcome = getRestoreOutcome();
    expect(outcome!.failure).toBeTruthy();
    expect(outcome!.restoredFamilies).toBe(0);
    expect(outcome!.prunedFamilies).toBe(0);
    await del(cacheKey(USER, HH), probeStore);
  });
});
