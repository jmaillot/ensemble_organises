import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogueModules, filterModuleEntries, filterModuleKeys, isModuleDisabled, modules, navModules } from './modules';

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
  });
});

/**
 * Menu des applications (migration 0140) : le masquage est une décision de
 * présentation, portée par `households.disabled_modules`. Ces invariants
 * garantissent qu'aucune surface de navigation ne recompose sa propre règle :
 * une seule définition de « éteint » et de « hors périmètre enfant », composée
 * partout pareil.
 */
describe('Gating des espaces (0140)', () => {
  it('dit « éteint » seulement pour une clé présente dans la liste du foyer', () => {
    expect(isModuleDisabled('ardoise', ['ardoise', 'voyages'])).toBe(true);
    expect(isModuleDisabled('courses', ['ardoise', 'voyages'])).toBe(false);
    // La liste vide dit « tout activé » : aucun foyer existant ne change de
    // comportement sans l'avoir choisi.
    for (const entry of modules) {
      expect(isModuleDisabled(entry.key, [])).toBe(false);
    }
  });

  it('compose masquage enfant et espaces éteints dans un seul filtre', () => {
    const CHILD_HIDDEN = ['ardoise', 'cadeaux', 'fidelite', 'prestataires', 'animaux'] as const;
    const disabled = ['recettes'];
    const isChild = true;

    const keys = filterModuleKeys(modules.map((entry) => entry.key), { isChild, disabledModules: disabled });
    for (const key of keys) {
      expect(CHILD_HIDDEN, `${key} réexpose un module masqué à l'enfant`).not.toContain(key);
      expect(disabled, `${key} réexpose un espace éteint par le foyer`).not.toContain(key);
    }
    // `accueil` et `parametres` ne sont jamais gated : on doit toujours
    // pouvoir rejoindre le tableau de bord et réactiver un espace.
    expect(keys).toContain('calendrier');
    expect(keys).not.toContain('parametres');

    const entries = filterModuleEntries(modules, { disabledModules: disabled });
    expect(entries.some((entry) => entry.key === 'recettes')).toBe(false);
    expect(entries.length).toBe(modules.length - disabled.length);
  });
});
