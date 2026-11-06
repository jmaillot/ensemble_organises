import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { SupabaseAdapter } from './supabase-adapter';
import { DataError } from './adapter';
import { OFFLINE_WRITE_REFUSED_MESSAGE } from './write-policy';

/**
 * Preuve du filet de sécurité posé dans l'adaptateur (T-34-05, §2.7 E).
 *
 * La garde vit en Trois endroits : hooks Tier 1 (useResource), MutationCache
 * central (query-policy.ts) et l'adaptateur LUI-MÊME. Ce dernier est le seul
 * que tout chemin d'écriture traverse tôt ou tard : le test prouve qu'une
 * écriture hors liste hors ligne y est refusée AVANT tout appel réseau —
 * le faux client ci-dessous compte ses appels `from()` : zéro appel, c'est
 * zéro requête partie vers PostgREST.
 *
 * Plan 35-06 (couche 2, gap G-35-3) : les cas X1-X2 prouvent qu'une LECTURE
 * `list` dont le fetch ne répond JAMAIS rejette au délai d'abandon injecté
 * (mécanisme manuel AbortController + setTimeout — PAS AbortSignal.timeout,
 * dont les minuteries internes échappent à vi.useFakeTimers et rendraient X1
 * jamais verte), converti en DataError nommant le délai. C'est ce rejet
 * rapide qui réactive le repli foyer persisté de loadHousehold LORSQUE
 * onLine=false (X3 dans load-household-offline.test.ts) ; sous H1
 * (onLine=true en mode avion), le repli de loadHousehold relance
 * volontairement et le gardien de bootstrap (Task 1) reste le seul
 * rétablissement. Les ÉCRITURES ne sont pas signalées : une écriture avortée
 * à mi-course serait ré-enfilée par l'outbox, le contrat de rejeu n'est pas
 * altéré par un abandon.
 */

type FromCall = { table: string; method: string };

let fromCalls: FromCall[] = [];
/**
 * Bascule du client factice en « fetch qui hang » : la promesse du builder ne
 * se résout jamais toute seule — exactement le fetch Android cold-start — et
 * rejette avec la raison du signal si `abortSignal` est appelé (le contrat
 * PostgrestBuilder observé dans node_modules).
 */
let lecturePendante = false;

/** Constructeur de requête factice : chaînable, résout une ligne. */
function fakeBuilder(method: string) {
  const builder: Record<string, unknown> = {
    insert: () => fakeBuilder('insert'),
    update: () => fakeBuilder('update'),
    delete: () => fakeBuilder('delete'),
    upsert: () => fakeBuilder('upsert'),
    select: () => fakeBuilder('select'),
    eq: () => fakeBuilder('eq'),
    is: () => fakeBuilder('is'),
    in: () => fakeBuilder('in'),
    abortSignal: () => fakeBuilder(method),
    single: () => Promise.resolve({ data: { id: 'row-1' }, error: null }),
    then: undefined,
  };
  return Object.assign(Promise.resolve({ data: [{ id: 'row-1' }], error: null }), builder, { __method: method });
}

/** Constructeur dont la promesse ne se termine jamais, sauf abandon du signal. */
function builderPendant() {
  let rejeter!: (cause: unknown) => void;
  const promesse = new Promise((_resoudre, rej) => {
    rejeter = rej;
  });
  // `retour` est la promesse HYBRIDE (thenable + chaînable) : chaque méthode
  // renvoie le même objet, comme PostgrestBuilder — renvoyer le simple objet
  // `builder` casserait le thenable et l'await résoudrait à vide.
  const builder: Record<string, unknown> = {
    select: () => retour,
    eq: () => retour,
    is: () => retour,
    in: () => retour,
    abortSignal: (signal: AbortSignal) => {
      signal.addEventListener('abort', () => rejeter(signal.reason ?? new Error('Abandonné')));
      return retour;
    },
  };
  const retour = Object.assign(promesse, builder);
  return retour;
}

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push({ table, method: 'from' });
      return lecturePendante ? builderPendant() : fakeBuilder(table);
    },
  },
}));

beforeEach(() => {
  fromCalls = [];
  lecturePendante = false;
});

afterEach(() => {
  onlineManager.setOnline(true);
  SupabaseAdapter.reinitialiserDelaiLecture();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SupabaseAdapter — garde d’écriture upfront (filet de classe, T-34-05)', () => {
  it('A. create hors liste hors ligne : DataError ET zéro appel réseau', async () => {
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('notes', { title: 'x' })).rejects.toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
    expect(fromCalls, 'aucune requête ne doit partir vers PostgREST').toEqual([]);
  });

  it('B. update, remove et removeWhere hors liste hors ligne : même refus, zéro appel réseau', async () => {
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.update('notes', 'n1', { title: 'x' })).rejects.toThrow(DataError);
    await expect(adapter.remove('notes', 'n1')).rejects.toThrow(DataError);
    await expect(adapter.removeWhere('post_comments', { post_id: 'p1' })).rejects.toThrow(DataError);
    expect(fromCalls).toEqual([]);
  });

  it('C. une écriture allowlistée hors ligne TRAVERSE la garde (l’adaptateur n’enfile jamais)', async () => {
    // `tasks` est dans la liste : le filet la laisse passer — c'est le
    // MutationCache qui décidera de l'enfilage, pas l'adaptateur. Ici, avec un
    // réseau déclaré coupé, la requête part quand même vers le (faux) client.
    onlineManager.setOnline(false);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('tasks', { name: 'x' })).resolves.toEqual({ id: 'row-1' });
    expect(fromCalls).toEqual([{ table: 'tasks', method: 'from' }]);
  });

  it('D. la même écriture hors liste passe en ligne — la liste blanche borne le hors-ligne', async () => {
    onlineManager.setOnline(true);
    const adapter = new SupabaseAdapter();
    await expect(adapter.create('notes', { title: 'x' })).resolves.toEqual({ id: 'row-1' });
    expect(fromCalls).toEqual([{ table: 'notes', method: 'from' }]);
  });
});

describe('SupabaseAdapter — délai d’abandon des lectures list (35-06, couche 2)', () => {
  it('X1. un fetch qui hang rejette en DataError au délai injecté (piloté par les fake timers)', async () => {
    lecturePendante = true;
    SupabaseAdapter.setDelaiLecturePourTest(50);
    vi.useFakeTimers();
    const adapter = new SupabaseAdapter();
    const promesse = adapter.list('tasks', { household_id: 'h1' });
    const attente = expect(promesse).rejects.toThrow(/Délai de lecture dépassé/);
    await vi.advanceTimersByTimeAsync(50);
    await attente;
    await expect(promesse).rejects.toBeInstanceOf(DataError);
  });

  it('X2. une lecture qui résout sous le délai n’est pas avortée', async () => {
    SupabaseAdapter.setDelaiLecturePourTest(50);
    vi.useFakeTimers();
    const adapter = new SupabaseAdapter();
    const promesse = adapter.list('tasks', { household_id: 'h1' });
    await vi.advanceTimersByTimeAsync(200);
    // La requête légitime (résolue immédiatement par le faux client) rend ses
    // lignes, sans DataError ni avortement.
    await expect(promesse).resolves.toEqual([{ id: 'row-1' }]);
  });
});
