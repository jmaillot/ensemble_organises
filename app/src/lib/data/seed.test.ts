import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoMealEntries, demoRecipes } from './seed';
import { debutSemaineIso, jourSemaine } from '@/lib/datetime';
import { todayIso } from '@/lib/utils';

/**
 * Garde anti-récidive de **classe** sur les repas du semis de démonstration.
 *
 * Le défaut corrigé ici (phase 38, S-01) n'était pas un cas isolé : les trois
 * `entry_date` de `demoMealEntries` étaient posées avec `day(0..2)` (relatif
 * au jour) alors que la page menu les relit sur une grille **lundi →
 * dimanche**. Du lundi au samedi les repas restaient visibles ; le dimanche,
 * ils tombaient sur la semaine suivante et le menu démo se vidait. La borne
 * choisie (AGENTS.md §2.7B) : les `entry_date` de `demoMealEntries`
 * uniquement — les autres relatifs au jour du semis (frigo, événements,
 * tâches, dépenses…) n'ont pas de grille semaine et restent légitimement
 * relatifs.
 */
describe('Semis démo — repas ancrés sur la semaine lundi → dimanche courante', () => {
  /** Prédicat du contrôle : l'entrée appartient à la semaine de l'ancrage. */
  const dansLaSemaineDe = (entryDate: string, ancreIso: string): boolean =>
    debutSemaineIso(entryDate) === debutSemaineIso(ancreIso);

  it('chaque entry_date de demoMealEntries tombe dans la semaine courante (lundi → dimanche)', () => {
    let checked = 0;
    const horsSemaine: string[] = [];

    for (const entry of demoMealEntries) {
      checked += 1;
      if (!dansLaSemaineDe(entry.entry_date, todayIso())) {
        horsSemaine.push(`${entry.id} = ${entry.entry_date}`);
      }
    }

    // Un contrôle qui ne regarde rien est vert sans rien voir : si le
    // parcours ne trouve aucune meal entry, le test doit ÉCHOUER en le
    // disant, pas passer (AGENTS.md §2.7F).
    expect(checked, 'aucune meal entry trouvée — le contrôle ne regarde rien').toBeGreaterThan(0);
    expect(horsSemaine, `repas hors de la semaine courante : ${horsSemaine.join(', ')}`).toEqual([]);
  });

  it('cas qui doit échouer : un repas ancré sur la semaine suivante d’un dimanche est rejeté (§2.7B)', () => {
    // La forme exacte du défaut d'origine : un semis exécuté le dimanche
    // 2026-11-08 posait `day(1)` = 2026-11-09, mardi de la semaine SUIVANTE.
    // Jugé depuis l'ancrage du jour de semis (2026-11-08, dates figées : le
    // cas ne dépend pas du jour où le test tourne), le prédicat doit le
    // refuser — c'est la preuve qu'il sait voir le défaut (§2.7B).
    const repasDuDefaut = {
      id: 'meal-synthetique',
      entry_date: jourSemaine('2026-11-08', 1), // 2026-11-09 : `day(1)` d'un dimanche
    };
    expect(dansLaSemaineDe(repasDuDefaut.entry_date, '2026-11-08'), 'le prédicat laisse passer le défaut du dimanche').toBe(false);
  });
});

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
