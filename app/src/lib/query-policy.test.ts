import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { QUERY_POLICY, WRITE_ALLOWLIST, assertWriteAllowed, buildQueryClient, isWriteAllowed, OFFLINE_WRITE_REFUSED_MESSAGE } from './query-policy';
import { OFFLINE_FAMILIES } from './query-policy';
import { queryClient as appQueryClient } from '@/app/router';
import { SHOPPING_LISTS_TABLE, SHOPPING_ITEMS_TABLE } from '@/modules/courses/api';
import { PRODUCTS_TABLE } from '@/modules/courses/products-api';
import { TASKS_TABLE, TASK_LISTS_TABLE, TASK_ASSIGNEES_TABLE } from '@/modules/taches/api';
import { ROUTINES_TABLE, ROUTINE_FOLDERS_TABLE, ROUTINE_COMPLETIONS_TABLE } from '@/modules/routines/api';

/**
 * Garde de classe : l'invariant de politique réseau, et la preuve que le client
 * de l'application en dérive vraiment.
 *
 * POURQUOI CET INVARIANT, ET PAS UN AUTRE. Le constat #15 (`docs/TODO.md`) est
 * qu'hors ligne, l'application affichait « aucune liste pour ce foyer » là où
 * elle n'avait jamais pu lire. La cause n'est pas la page : TanStack Query a
 * `networkMode: 'online'` par défaut, et dans ce mode une requête hors ligne ne
 * part pas — elle reste en `fetchStatus: 'paused'`. Comme
 * `isLoading = isPending && isFetching`, elle vaut `false` **et** `isError`
 * aussi : la garde `!isLoading && !isError && rows.length === 0` s'ouvre et
 * rend un état vide ordinaire. Ce défaut avait dix occurrences dans cinq
 * modules. Le corriger endroit par endroit l'aurait laissé revenir par le
 * onzième : c'est la **classe** qu'on corrige, en posant une politique unique
 * dont tout client dérive (AGENTS.md §2.7 E).
 *
 * POURQUOI UNE GARDE, ET POURQUOI CES QUATRE TESTS.
 * - Test A lit la constante : la politique déclare bien le mode qu'on croit.
 * - Test B prouve le COMPORTEMENT (et non le texte) : avec le réseau déclaré
 *   coupé, une lecture qui échoue atteint l'état erreur au lieu de rester en
 *   pause. C'est le défaut lui-même, montré du côté de l'observateur.
 * - Test D lit les valeurs RÉSOLUES du `queryClient` exporté par
 *   `app/src/app/router.tsx` — le client que `main.tsx` monte. La constante
 *   peut rester juste pendant que `router.tsx` revient à un client à lui : ce
 *   test est le seul qui vérifie la couture `router.tsx → query-policy.ts`
 *   plutôt que de l'affirmer (AGENTS.md §2.7 I, « une absence affirmée est une
 *   affirmation »).
 * - Test E refuse un client construit en ligne **hors** de
 *   `query-policy.ts` : sans lui, une copie en ligne portant les mêmes valeurs
 *   passerait, et la prochaine valeur ajoutée à la politique ne serait plus
 *   lue par l'application. Sa limite est dite et non dissimulée : une aiguille
 *   textuelle se contourne (`new (QueryClient)(…)`, un alias d'import) — elle
 *   garde la forme de régression observée, pas contre un auteur décidé,
 *   exactement comme le garde de directive de linter de D-01. C'est acceptable
 *   ici parce que la forme positive ne sait pas exprimer la propriété (« aucun
 *   client ailleurs ») et parce que le Test D la double : les valeurs résolues
 *   sont la propriété, le refus du client en ligne est la ceinture.
 */

function findSourceRoot(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidates = [directory, resolve(directory, 'src'), resolve(directory, 'app/src')];
    for (const candidate of candidates) {
      if (existsSync(resolve(candidate, 'lib/query-policy.ts'))) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Tous les fichiers `.ts`/`.tsx` sous `dir`, fichiers de test compris. */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Aiguille construite dynamiquement : le garde ne se dénonce pas lui-même. */
const HANDMADE_CLIENT = ['new QueryClient', '('].join('');

afterEach(() => {
  // `onlineManager` est un singleton partagé : ne jamais laisser la suite
  // déclarée hors ligne après ce fichier.
  onlineManager.setOnline(true);
});

describe('politique réseau — garde de classe (constat #15)', () => {
  it('A. la politique déclare networkMode always et refetchOnReconnect explicite', () => {
    expect(QUERY_POLICY.queries?.networkMode).toBe('always');
    expect(QUERY_POLICY.queries?.refetchOnReconnect).toBe(true);
    expect(QUERY_POLICY.mutations?.networkMode).toBe('always');
  });

  it('B. hors ligne, une lecture en échec atteint l’erreur au lieu de rester en pause', async () => {
    onlineManager.setOnline(false);
    const client = buildQueryClient({ queries: { retry: false } });
    const outcome = await Promise.race([
      client
        .fetchQuery({
          queryKey: ['dw6-politique-reseau'],
          queryFn: () => Promise.reject(new Error('réseau coupé')),
        })
        .then(
          () => 'resolved' as const,
          () => 'rejected' as const,
        ),
      // Course contre un minuteur court : « toujours en attente » EST le défaut.
      new Promise<'pending'>((settle) => setTimeout(() => settle('pending'), 200)),
    ]);
    expect(outcome).toBe('rejected');
  });

  it('D. le queryClient de l’application résout la politique partagée', () => {
    const options = appQueryClient.getDefaultOptions();
    expect(options.queries?.networkMode).toBe('always');
    expect(options.queries?.refetchOnReconnect).toBe(true);
    expect(options.mutations?.networkMode).toBe('always');
  });
});

describe('aucun QueryClient écrit à la main hors de la politique (garde de dérivation)', () => {
  it('la racine des sources est trouvée, sinon le contrôle ne regarde rien', () => {
    const root = findSourceRoot();
    expect(
      root,
      `lib/query-policy.ts introuvable en remontant depuis ${process.cwd()} : le scan ne peut rien vérifier`,
    ).not.toBeNull();
    expect(collectSourceFiles(root!).length, 'aucun fichier source collecté').toBeGreaterThan(0);
  });

  it('E. seule query-policy.ts construit un QueryClient', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    const allowed = resolve(root!, 'lib/query-policy.ts');
    // Preuve que l'aiguille sait reconnaître du code réel : le seul fichier
    // autorisé la porte. Sinon le contrôle serait vert sans rien regarder.
    expect(
      readFileSync(allowed, 'utf8').includes(HANDMADE_CLIENT),
      `l’aiguille « ${HANDMADE_CLIENT} » ne reconnaît pas ${allowed} : le garde ne peut rien voir`,
    ).toBe(true);

    const offenders = collectSourceFiles(root!)
      .filter((file) => file !== allowed && readFileSync(file, 'utf8').includes(HANDMADE_CLIENT))
      .map((file) => file.slice(root!.length + 1));

    expect(
      offenders,
      `client écrit à la main hors de la politique partagée : ${offenders.join(', ')} — ` +
        'dériver de `buildQueryClient` (@/lib/query-policy) plutôt que recopier les options',
    ).toEqual([]);
  });
});

describe('liste blanche d’écriture (phase 34, WRQ-03, D-06)', () => {
  it('J. WRITE_ALLOWLIST porte exactement les 5 tables de D-14 — ni plus, ni moins', () => {
    // Résolution A5 (RESEARCH 34) : la lecture allowlistait products et
    // shopping_lists (annexes de rendu), mais SEULES les tables portant
    // client_key (0177) peuvent être enfilées et rejouées de façon
    // idempotente. La liste EST la frontière : le test refuse tout écart.
    expect([...WRITE_ALLOWLIST].sort()).toEqual(
      ['routine_completions', 'routines', 'shopping_list_items', 'task_assignees', 'tasks'],
    );
    expect(isWriteAllowed('products')).toBe(false);
    expect(isWriteAllowed('shopping_lists')).toBe(false);
    expect(isWriteAllowed('household_members')).toBe(false);
    expect(isWriteAllowed('profiles')).toBe(false);
    expect(isWriteAllowed('expenses')).toBe(false);
    expect(isWriteAllowed('notes')).toBe(false);
    expect(isWriteAllowed('task_assignees'), 'la jointure Tier 1 EST inscrite (Pitfall 6)').toBe(true);
  });

  it('K. assertWriteAllowed laisse TOUT passer en ligne — la liste blanche borne le hors-ligne', () => {
    // En ligne, les modules hors liste (ardoise, notes…) fonctionnent
    // normalement : refuser serait casser l'app entière.
    onlineManager.setOnline(true);
    expect(() => assertWriteAllowed('expenses')).not.toThrow();
    expect(() => assertWriteAllowed('messages')).not.toThrow();
    onlineManager.setOnline(false);
    expect(() => assertWriteAllowed('expenses')).toThrow(OFFLINE_WRITE_REFUSED_MESSAGE);
  });
});

describe('aucun MutationCache écrit à la main hors de la politique (garde de classe, D-02)', () => {
  it('L. seule query-policy.ts construit un MutationCache', () => {
    // Même garde que le Test E, pour le second client du constructeur : le
    // MutationCache central ne vit que dans la fabrique, sinon une copie
    // divergerait silencieusement de la politique d'enfilage (§2.7 E).
    const root = findSourceRoot();
    expect(root).not.toBeNull();
    const allowed = resolve(root!, 'lib/query-policy.ts');
    const needle = ['new MutationCache', '('].join('');
    expect(
      readFileSync(allowed, 'utf8').includes(needle),
      `l’aiguille « ${needle} » ne reconnaît pas ${allowed} : le garde ne peut rien voir`,
    ).toBe(true);
    const offenders = collectSourceFiles(root!)
      .filter((file) => file !== allowed && readFileSync(file, 'utf8').includes(needle))
      .map((file) => file.slice(root!.length + 1));
    expect(
      offenders,
      `MutationCache écrit à la main hors de la fabrique : ${offenders.join(', ')} — dériver de buildQueryClient`,
    ).toEqual([]);
  });
});

describe('famille offline — allowlist de persistance (D-07, D-08, D-10)', () => {
  it('F. gcTime couvre l’horizon de persistance (≥ 7 jours)', () => {
    // Pitfall 1 : sans gcTime ≥ maxAge annexe, une query hydratée serait
    // collectée (5 min par défaut) avant la prochaine sauvegarde — le cache
    // persisterait un état déjà vidé.
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(QUERY_POLICY.queries?.gcTime ?? 0).toBeGreaterThanOrEqual(sevenDays);
    const options = appQueryClient.getDefaultOptions();
    expect(options.queries?.gcTime ?? 0).toBeGreaterThanOrEqual(sevenDays);
  });

  it('G. OFFLINE_FAMILIES contient exactement les 9 familles vivantes et les 2 annexes', () => {
    const byAge = (prefix: string) => OFFLINE_FAMILIES.find((family) => family.prefix === prefix)?.maxAgeMs;
    const day = 24 * 60 * 60 * 1000;
    for (const prefix of [
      'shopping_lists',
      'shopping_list_items',
      'products',
      'task_lists',
      'tasks',
      'task_assignees',
      'routine_folders',
      'routines',
      'routine_completions',
    ]) {
      expect(byAge(prefix), `famille vivante ${prefix} absente`).toBe(day);
    }
    for (const prefix of ['household_members', 'profiles']) {
      expect(byAge(prefix), `annexe ${prefix} absente`).toBe(7 * day);
    }
    // Exactement ces onze-là : rien de plus, rien de moins (D-07 — la liste
    // EST la frontière de ce qui quitte la mémoire). `task_assignees` (phase
    // 35, D-04) hydrate les assignés de la vue « Tâches du jour » en
    // cold-start hors-ligne : sans lui, la vue rend « on ne sait pas »
    // (assigneesUnknown) au lieu des avatars.
    expect(OFFLINE_FAMILIES).toHaveLength(11);
  });

  it('H. les préfixes correspondent aux constantes réelles des hooks Tier 1', () => {
    // Test D/E de la politique réseau, transposé : la liste pourrait rester
    // juste pendant qu’un hook Tier 1 renomme sa table. On importe les
    // CONSTANTES exportées des hooks (AGENTS.md §2.7 I : une absence affirmée
    // est une affirmation) et on refuse toute divergence.
    const byAge = (prefix: string) => OFFLINE_FAMILIES.find((family) => family.prefix === prefix);
    for (const table of [
      SHOPPING_LISTS_TABLE,
      SHOPPING_ITEMS_TABLE,
      PRODUCTS_TABLE,
      TASKS_TABLE,
      TASK_LISTS_TABLE,
      TASK_ASSIGNEES_TABLE,
      ROUTINE_FOLDERS_TABLE,
      ROUTINES_TABLE,
      ROUTINE_COMPLETIONS_TABLE,
    ]) {
      expect(byAge(table), `table Tier 1 ${table} absente de l’allowlist`).toBeDefined();
    }
    // Les constantes tier 1 portent bien les valeurs attendues — sinon la
    // correspondance ci-dessus serait vide de sens (les deux côtés auraient
    // pu dériver ensemble).
    expect(TASKS_TABLE).toBe('tasks');
    expect(TASK_ASSIGNEES_TABLE).toBe('task_assignees');
    expect(SHOPPING_LISTS_TABLE).toBe('shopping_lists');
    expect(ROUTINES_TABLE).toBe('routines');
    expect(PRODUCTS_TABLE).toBe('products');
    expect(TASK_LISTS_TABLE).toBe('task_lists');
    expect(ROUTINE_FOLDERS_TABLE).toBe('routine_folders');
    expect(ROUTINE_COMPLETIONS_TABLE).toBe('routine_completions');
    expect(SHOPPING_ITEMS_TABLE).toBe('shopping_list_items');
  });

  it('I. aucune allowlist de famille recopiée hors de query-policy.ts (garde de classe)', () => {
    // Garde de classe §2.7 E : `prefix: '…'` est la marque d’une déclaration
    // d’allowlist. Hors du fichier source unique, elle serait une seconde
    // liste qui divergerait. L’aiguille porte sur la FORME de déclaration
    // (`prefix: 'x'`), pas sur les noms de tables : les api.ts définissent
    // légitimement `*_TABLE = 'tasks'`, et les tests sement des clés de query.
    const root = findSourceRoot();
    expect(root).not.toBeNull();
    const allowed = resolve(root!, 'lib/query-policy.ts');
    // Preuve que l'aiguille sait reconnaître une déclaration réelle : ce
    // fichier de garde en porte une (§2.7 F — un contrôle qui ne voit rien
    // ne dit rien). Sinon le contrôle serait vert sans rien regarder.
    const needle = /prefix:\s*['"]/;
    expect(needle.test(readFileSync(resolve(root!, 'lib/query-policy.test.ts'), 'utf8'))).toBe(true);
    const offenders = collectSourceFiles(root!)
      // Le garde s'exclut lui-même (l'aiguille y vit) comme query-policy.ts,
      // la déclaration autorisée.
      .filter((file) => file !== allowed && file !== resolve(root!, 'lib/query-policy.test.ts'))
      .filter((file) => needle.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root!.length + 1));
    expect(
      offenders,
      `allowlist de famille hors de la source unique : ${offenders.join(', ')} — importer OFFLINE_FAMILIES (@/lib/query-policy) plutôt que recopier`,
    ).toEqual([]);
  });
});
