import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde de classe de D-01 (IN-01) : aucune source de `app/src` ne porte de
 * directive de linter inerte.
 *
 * Aucun ESLint, Biome ou Prettier n'est configuré dans ce dépôt (AGENTS.md
 * §2.7) : la chaîne prescrite est `typecheck && test && build`, et elle ne
 * change pas. Une directive de linter n'y est donc lue par personne — elle ne
 * protège de rien et remplace l'explication d'un choix par une formule creuse.
 * D-01 la proscrit.
 *
 * Le contrôle est TEXTUEL (AGENTS.md §2.7D.6 : préférer un motif ancré et
 * précis à une analyse syntaxique fragile) et porte sur toute la racine
 * `app/src`, **fichiers de test compris** : la porte de D-01 (un `grep -rn` sur
 * `app/src`, cf. plan 20-01) les couvre aussi, donc un garde qui exclurait les
 * tests serait plus laxiste que la règle qu'il sert.
 *
 * L'aiguille est construite par `join` : le fichier ne doit contenir nulle part
 * la suite de caractères recherchée sous forme littérale, sinon le garde se
 * dénoncerait lui-même et ne pourrait jamais être vert (T-20-02).
 */

/**
 * Racine des sources (`app/src`), cherchée en remontant depuis le répertoire
 * courant du runner — Vitest ne garantit pas ce répertoire. On reconnaît la
 * racine à `lib/data/useResource.ts`. Rend `null` si rien n'est trouvé, pour
 * que l'assertion échoue bruyamment plutôt que de conclure sur un dossier vide
 * (AGENTS.md §2.7B : « un contrôle qui ne regarde rien est vert et muet »).
 */
function findSourceRoot(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidates = [directory, resolve(directory, 'src'), resolve(directory, 'app/src')];
    for (const candidate of candidates) {
      if (existsSync(resolve(candidate, 'lib/data/useResource.ts'))) return candidate;
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
const DIRECTIVE = ['eslint', 'disable'].join('-');

describe('aucune directive de linter inerte (D-01, IN-01)', () => {
  it('la racine des sources est trouvée, sinon le contrôle ne regarde rien', () => {
    const root = findSourceRoot();
    expect(
      root,
      `lib/data/useResource.ts introuvable en remontant depuis ${process.cwd()} : le scan ne peut rien vérifier`,
    ).not.toBeNull();
    expect(collectSourceFiles(root!).length, 'aucun fichier source collecté').toBeGreaterThan(0);
  });

  it('le parcours couvre bien la racine entière, pas un sous-ensemble', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    const files = collectSourceFiles(root!);
    expect(
      files.length,
      `seulement ${files.length} fichiers parcourus sous ${root} : un contrôle qui ne regarde ` +
        'rien est vert et muet (AGENTS.md §2.7B)',
    ).toBeGreaterThanOrEqual(100);
  });

  it('aucun fichier ne porte de directive de linter', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    const offenders = collectSourceFiles(root!)
      .filter((file) => readFileSync(file, 'utf8').includes(DIRECTIVE))
      .map((file) => file.slice(root!.length + 1));

    expect(
      offenders,
      `directive de linter inerte détectée (aucun linter n'est configuré, AGENTS.md §2.7) : ` +
        `${offenders.join(', ')} — la remplacer par un commentaire qui dit la raison de l'omission`,
    ).toEqual([]);
  });
});
