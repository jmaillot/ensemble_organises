import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { QUERY_POLICY, buildQueryClient } from './query-policy';
import { queryClient as appQueryClient } from '@/app/router';

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
