import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogueModules, mobileNavModules, modules, navModules } from './modules';

/**
 * Vitest ne garantit pas le répertoire courant du runner : on remonte depuis
 * celui-ci jusqu'à trouver le dossier `public/assets` de l'application.
 */
function findAssetsDir(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(directory, 'public/assets');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/**
 * Le catalogue est la seule garantie qu'aucune catégorie n'est inatteignable.
 * Ces invariants ont tous été vrais en même temps qu'un module se retrouvait
 * sans bouton de navigation : ils servent de garde-fou à chaque ajout.
 */
describe('Catalogue des espaces', () => {
  it('donne une clé unique à chaque espace', () => {
    const keys = modules.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('nomme chaque espace et le rend présent dans la grille de l’accueil', () => {
    for (const entry of catalogueModules) {
      expect(entry.label, `${entry.key} n'a pas de libellé`).not.toBe('');
      expect(entry.detail, `${entry.key} n'a pas d'accroche`).not.toBe('');
      expect(entry.short, `${entry.key} n'a pas de libellé court`).not.toBe('');
      expect(entry.tile, `${entry.key} a été retiré de l'accueil`).toBe(true);
    }
  });

  it('associe à chaque espace une photo présente dans les assets', () => {
    const assetsDir = findAssetsDir();
    expect(assetsDir, 'public/assets est introuvable depuis la racine du test').not.toBeNull();
    for (const entry of catalogueModules) {
      expect(existsSync(resolve(assetsDir!, entry.image)), `${entry.key} pointe vers une photo absente : ${entry.image}`).toBe(
        true,
      );
    }
  });

  it('ne laisse aucun accès rapide hors du catalogue', () => {
    for (const key of navModules) {
      expect(catalogueModules.some((entry) => entry.key === key)).toBe(true);
    }
    for (const key of mobileNavModules) {
      // `accueil` est le tableau de bord, pas un espace du foyer.
      if (key === 'accueil') continue;
      expect(catalogueModules.some((entry) => entry.key === key)).toBe(true);
    }
  });
});
