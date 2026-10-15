import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Verrou anti-récidive de D-01 (WR-08) : la valeur de colonne d'un média du
 * foyer est un CHEMIN de bucket, jamais une URL signée éphémère.
 *
 * D-01 laisse le choix entre deux verrous — « la fonction de dépôt ne renvoie
 * plus d'`url` utilisable » ou « son usage est verrouillé par un test ». C'est
 * le second qui est retenu : la forme de `DepositedFile` reste inchangée (huit
 * doubles de test du dépôt en dépendent), et c'est ici que l'on interdit la
 * lecture directe des champs du dépôt hors de `lib/storage.ts`.
 *
 * Le contrôle est volontairement TEXTUEL (§2.7D.6 : préférer un motif ancré et
 * précis à une analyse syntaxique fragile). Il porte sur le récepteur
 * (`deposited.`) pour ne pas confondre une lecture du dépôt avec `photo_url`,
 * `media_url` ou un `.url` sans rapport.
 *
 * Portée : seul `deposited.url` est interdit — l'URL signée est exactement la
 * valeur que D-01 refuse de persister. `deposited.path` reste licite : c'est la
 * valeur durable elle-même, lue par plusieurs modules pour la compensation de
 * nettoyage (`removeHouseholdFile` du dépôt qui vient d'échouer — courses,
 * cadeaux, prestataires). Interdire `deposited.path` ferait rougir des sites
 * hors du périmètre du plan 19-13 sans aucun gain de sûreté.
 */

/** Seules les sources comptent : les doubles de test écrivent `url:` en littéral. */
const TEST_FILE = /\.test\.tsx?$/;

/**
 * Racine des sources (`app/src`), cherchée en remontant depuis le répertoire
 * courant du runner — Vitest ne garantit pas ce répertoire. On reconnaît trois
 * dispositions : `…/src` (cwd dans `src/`), `app` (cwd = `app/`) et la racine
 * du dépôt (cwd contient `app/src`). Rend `null` si rien n'est trouvé, pour que
 * l'assertion échoue bruyamment plutôt que de conclure sur un dossier vide
 * (AGENTS.md §2.7B : « un contrôle qui ne regarde rien est vert et muet »).
 */
function findSourceRoot(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidates = [directory, resolve(directory, 'src'), resolve(directory, 'app/src')];
    for (const candidate of candidates) {
      if (existsSync(resolve(candidate, 'lib/storage.ts'))) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Tous les fichiers `.ts`/`.tsx` sous `dir`, hors fichiers de test. */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Les sites d'écriture alignés par la phase 19 (D-01) : chacun produit sa valeur
 * de colonne par le point unique `storedValueOf`. Deux sites volontairement
 * absents : `modules/cercle/api.ts` passe par son propre dépôt (`depositMedia`,
 * aligné par 19-10) et `modules/messages/api.ts` est HORS périmètre de la phase
 * (remonté à l'orchestrateur : il persiste encore une URL signée, mais aucune
 * tâche de la phase ne le couvre).
 */
const ALIGNED_WRITE_SITES = [
  'modules/notes/api.ts',
  'modules/anniversaires/components/birthday-form-dialog.tsx',
  'modules/contacts/components/contact-form-dialog.tsx',
  'modules/animaux/api.ts',
  'modules/courses/components/product-sheet.tsx',
  'modules/courses/components/product-catalog.tsx',
  'modules/cadeaux/cadeaux-page.tsx',
  'modules/ardoise/ardoise-page.tsx',
  'modules/ardoise/ardoise-detail-page.tsx',
  'modules/voyages/api.ts',
  'modules/recettes/api.ts',
  'modules/prestataires/api.ts',
  'modules/adresses/api.ts',
];

describe('contrat du chemin média (D-01, WR-08)', () => {
  it('la racine des sources est trouvée, sinon le contrôle ne regarde rien', () => {
    const root = findSourceRoot();
    expect(
      root,
      `lib/storage.ts introuvable en remontant depuis ${process.cwd()} : le scan ne peut rien vérifier`,
    ).not.toBeNull();
    expect(collectSourceFiles(root!).length, 'aucun fichier source collecté').toBeGreaterThan(0);
  });

  it('aucun module ne lit deposited.url — la valeur de colonne passe par storedValueOf', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    const storageFile = resolve(root!, 'lib/storage.ts');
    const offenders = collectSourceFiles(root!)
      .filter((file) => resolve(file) !== storageFile)
      .filter((file) => readFileSync(file, 'utf8').includes('deposited.url'))
      .map((file) => file.slice(root!.length + 1));

    expect(
      offenders,
      `lecture directe de deposited.url hors de lib/storage.ts : ${offenders.join(', ')} — ` +
        'la valeur de colonne doit passer par storedValueOf (D-01)',
    ).toEqual([]);
  });

  it('chaque site d’écriture aligné produit sa colonne par storedValueOf', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    for (const site of ALIGNED_WRITE_SITES) {
      const file = resolve(root!, site);
      expect(existsSync(file), `site aligné introuvable : ${site}`).toBe(true);
      expect(
        readFileSync(file, 'utf8'),
        `${site} ne passe pas par storedValueOf (D-01)`,
      ).toContain('storedValueOf(');
    }
  });
});
