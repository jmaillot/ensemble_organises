import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYLESS_TABLES } from './keys';

/**
 * Rapprochement migrations ↔ `KEYLESS_TABLES` (D-04).
 *
 * WR-03 : `ardoise_members` a une clé composite `(ardoise_id, member_id)` et
 * **aucune** colonne `id` ; absente de la constante, elle recevait un `id`
 * injecté par l'adaptateur, l'insertion échouait, et le repli silencieux de
 * l'appelant masquait l'échec. Corriger l'instance ne suffit pas (§E) : le
 * rapprochement est dérivé des migrations et figé ici, dans les deux sens, pour
 * qu'une table composite oubliée fasse rougir la suite.
 */

/**
 * Déclaration d'exception, justifiée en commentaire : une table créée sans
 * colonne `id` qui n'est **pas** dans `KEYLESS_TABLES` doit avoir une raison
 * explicite d'y être absente.
 */
const KEYLESS_EXCEPTIONS = new Set([
  // `public_holidays` (0047) : référentiel en lecture seule, alimenté par la
  // migration, jamais écrit par le client — donc jamais passé à `create`, et
  // sans besoin d'une clé composite déclarée.
  'public_holidays',
]);

interface TableShape {
  name: string;
  file: string;
  hasIdColumn: boolean;
  hasCompositePrimaryKey: boolean;
}

/** Retrouve le dossier `supabase/migrations` depuis le répertoire du runner. */
function findMigrationsDir(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(directory, 'supabase/migrations');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Corps d'une déclaration `create table public.<name> (…)`, parenthèses appariées. */
function bodyOf(source: string, openParen: number): string {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParen + 1, index);
    }
  }
  return source.slice(openParen + 1);
}

/**
 * Tables du schéma lues dans `supabase/migrations/**\/*.sql`. Les commentaires
 * de ligne sont retirés avant l'analyse : certains portent des parenthèses qui
 * fausseraient l'appariement.
 */
function migrationTables(): TableShape[] {
  const directory = findMigrationsDir();
  expect(directory, 'supabase/migrations est introuvable depuis la racine du test').not.toBeNull();
  const tables: TableShape[] = [];
  for (const file of readdirSync(directory!).filter((name) => name.endsWith('.sql')).sort()) {
    const source = readFileSync(resolve(directory!, file), 'utf8')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi;
    for (const match of source.matchAll(pattern)) {
      const body = bodyOf(source, match.index + match[0].length - 1);
      tables.push({
        name: match[1],
        file,
        // Un `id` de table est `id <type> …` ; `task_id`/`(id)` (référence) ne
        // matchent pas, faute de frontière de mot avant `id`.
        hasIdColumn: /\bid\b\s+(?:text|uuid|integer|bigint|numeric|date|boolean|serial)\b/i.test(body),
        hasCompositePrimaryKey: /primary\s+key\s*\(\s*\w+\s*,\s*\w+/i.test(body),
      });
    }
  }
  return tables;
}

const TABLES = migrationTables();
const byName = new Map(TABLES.map((table) => [table.name, table]));

describe('Rapprochement KEYLESS_TABLES ↔ migrations (WR-03, D-04)', () => {
  it('lit bien les migrations (contrôle non vide — un contrôle qui ne regarde rien est vert)', () => {
    expect(TABLES.length).toBeGreaterThan(50);
  });

  it('chaque table de KEYLESS_TABLES n’a réellement aucune colonne id', () => {
    for (const name of KEYLESS_TABLES) {
      const table = byName.get(name);
      expect(table, `${name} est dans KEYLESS_TABLES mais aucune migration ne la crée`).toBeDefined();
      expect(table!.hasIdColumn, `${name} déclare une colonne id : elle n'a pas à être dans KEYLESS_TABLES`).toBe(false);
    }
  });

  it('chaque table de KEYLESS_TABLES porte une clé primaire composite', () => {
    for (const name of KEYLESS_TABLES) {
      expect(byName.get(name)!.hasCompositePrimaryKey, `${name} n'a pas de primary key (a, b)`).toBe(true);
    }
  });

  it('toute table sans colonne id est déclarée dans KEYLESS_TABLES ou exceptée', () => {
    const derived = TABLES.filter((table) => !table.hasIdColumn).map((table) => table.name);
    const undeclared = derived.filter((name) => !KEYLESS_TABLES.has(name) && !KEYLESS_EXCEPTIONS.has(name));
    expect(undeclared, `tables sans id absentes de KEYLESS_TABLES : ${undeclared.join(', ')}`).toEqual([]);
  });

  it('et réciproquement, aucune exception ne justifie une table qui porte un id', () => {
    for (const name of KEYLESS_EXCEPTIONS) {
      const table = byName.get(name);
      expect(table, `l’exception ${name} ne correspond à aucune table`).toBeDefined();
      expect(table!.hasIdColumn, `l’exception ${name} a en fait une colonne id`).toBe(false);
    }
  });
});
