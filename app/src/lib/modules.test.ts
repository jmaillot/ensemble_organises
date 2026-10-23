import { describe, expect, it } from 'vitest';
import { catalogueModules, filterModuleEntries, filterModuleKeys, isModuleDisabled, modules, navModules } from './modules';


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

  it('associe à chaque espace un pastel et un emoji de tuile valides', () => {
    // Les tuiles sont passées au pastel Melimelo le 23 octobre 2026 (demande
    // explicite : « les tuiles du site melimelo à la place des miennes ») —
    // le garde vérifie le contrat qui remplace la photo : un aplat de la
    // liste fermée des six pastels, et un emoji non vide par espace.
    const TINTS = new Set(['sage', 'blush', 'butter', 'sky', 'lilac', 'sand']);
    for (const entry of catalogueModules) {
      expect(TINTS.has(entry.tint), `${entry.key} porte un pastel inconnu : ${entry.tint}`).toBe(true);
      expect(entry.emoji.trim().length, `${entry.key} n'a pas d'objet (emoji) sur sa tuile`).toBeGreaterThan(0);
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
