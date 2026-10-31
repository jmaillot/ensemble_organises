import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoRecipes } from './seed';

/**
 * Contrat DET-03 (30-03) : toute recette du semis démo porte une photo
 * locale du bundle (chemin public `/assets/recettes/<slug>.jpg`), jamais
 * d'URL distante ni de chemin de bucket — D-08/D-09/D-10.
 */
describe('Semis démo — couvertures recettes (DET-03)', () => {
  it('chaque recette du semis porte un cover_photo public /assets/recettes/*.jpg', () => {
    expect(demoRecipes.length).toBeGreaterThan(0);
    for (const recipe of demoRecipes) {
      expect(recipe.cover_photo, `recette ${recipe.id} sans couverture`).toMatch(
        /^\/assets\/recettes\/[a-z0-9-]+\.jpg$/,
      );
    }
  });

  it('le fichier référencé existe dans app/public/assets/recettes/ (garde anti-chemin mort)', () => {
    for (const recipe of demoRecipes) {
      const cover = recipe.cover_photo ?? '';
      if (!/^\/assets\/recettes\//.test(cover)) continue;
      // L'URL `/assets/recettes/<slug>.jpg` sert `public/assets/recettes/`
      // (Vite : tout ce qui est sous `public/` est servi à la racine) —
      // `public/` + chemin SANS le préfixe d'URL.
      const filePath = join(__dirname, '..', '..', '..', 'public', cover.slice(1));
      expect(existsSync(filePath), `fichier manquant : ${filePath}`).toBe(true);
    }
  });
});
