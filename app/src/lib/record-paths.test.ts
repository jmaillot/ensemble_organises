import { describe, expect, it } from 'vitest';
import { OPEN_RECORD_PARAM, opensRecord, recordPath } from './record-paths';

/**
 * La table des liens profonds.
 *
 * Elle est la DÉCLARATION de ce que la palette sait faire : un module
 * présent ouvre sa fiche, un module absent ouvre son espace. La table est
 * donc testée comme une table — pour qu'un module ajouté à l'un côté
 * (la palette y trouve une entrée) sans l'autre ne passe pas inaperçu.
 */
describe('la table des liens profonds', () => {
  it('ouvre la fiche d’un module qui sait l’ouvrir', () => {
    expect(recordPath('taches', 'task-1')).toBe(`/taches?${OPEN_RECORD_PARAM}=task-1`);
    expect(recordPath('recettes', 'recette-1')).toBe('/recettes/recette-1');
    expect(opensRecord('taches')).toBe(true);
  });

  it('ouvre l’espace d’un module qui n’a pas de lien profond', () => {
    // Le Cercle : une publication se lit dans le fil, elle n’a pas de fiche.
    expect(recordPath('cercle', 'post-1')).toBe('/cercle');
    expect(opensRecord('cercle')).toBe(false);
  });

  it('ouvre l’espace d’un module qui n’a pas de lien profond', () => {
    expect(recordPath('messages', 'message-1')).toBe('/messages');
    expect(recordPath('ardoise', 'expense-1')).toBe('/ardoise');
    expect(opensRecord('messages')).toBe(false);
    expect(opensRecord('ardoise')).toBe(false);
  });

  it('encode l’identifiant dans l’URL', () => {
    // Un identifiant contient des caractères réservés : sans encodage, l'URL
    // serait malformée et le paramètre ne serait pas lu.
    expect(recordPath('notes', 'note a/b?c')).toContain(encodeURIComponent('note a/b?c'));
  });
});
