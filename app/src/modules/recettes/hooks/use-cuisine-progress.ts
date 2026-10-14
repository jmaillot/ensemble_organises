import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecipeStep } from '../types';

/**
 * Progression du mode cuisine mémorisée sur CET appareil
 * (`eo:recette:cuisine:<recipeId>`, SPEC R3, D-17).
 *
 * Même régime que `readRecipeInviteCode` / `writeRecipeInviteCode` /
 * `clearRecipeInviteCode` (`api.ts`) : lecture/écriture gardées en
 * try/catch, stockage illisible ou plein = session seule, silencieuse,
 * sans UI d'erreur (backstop UI-SPEC : cuisiner n'est jamais interrompu).
 * Le MODE (toggle ON) n'est jamais persisté, seules les cases le sont.
 */
export const cuisineProgressStorageKey = (recipeId: string): string => `eo:recette:cuisine:${recipeId}`;

function validIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function readCuisineProgress(recipeId: string, steps: RecipeStep[]): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(cuisineProgressStorageKey(recipeId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    const known = new Set(steps.map((step) => step.id));
    const ids = validIds(parsed);
    const kept = ids.filter((id) => known.has(id));
    if (kept.length !== ids.length) {
      // Purge silencieuse des ids orphelins (étapes supprimées
      // entre-temps, SPEC edge), réécrite pour ne pas les relire.
      writeCuisineProgress(recipeId, kept);
    }
    return new Set(kept);
  } catch {
    // JSON corrompu : on repart de zéro, sans crash (backstop UI-SPEC).
    return new Set();
  }
}

export function writeCuisineProgress(recipeId: string, checked: Set<string> | string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const ids = Array.isArray(checked) ? checked : [...checked];
    localStorage.setItem(cuisineProgressStorageKey(recipeId), JSON.stringify(ids));
  } catch {
    // Stockage plein ou bloqué : les cases restent utilisables en
    // session seule, sans mémoire.
  }
}

export function clearCuisineProgress(recipeId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(cuisineProgressStorageKey(recipeId));
  } catch {
    // Décoratif : une entrée restante ne fait que rouvrir des cases.
  }
}

export interface CuisineProgress {
  checked: Set<string>;
  toggle: (id: string) => void;
  reset: () => void;
}

/**
 * Cases du mode cuisine pour une fiche (`recipeId`, `steps` déjà chargés,
 * zéro appel réseau). Les ids disparus de `steps` sont purgés en place ;
 * un changement de fiche recharge depuis la clé de la nouvelle fiche.
 */
export function useCuisineProgress(recipeId: string, steps: RecipeStep[]): CuisineProgress {
  const [checked, setChecked] = useState<Set<string>>(() => readCuisineProgress(recipeId, steps));
  const recipeRef = useRef(recipeId);
  const knownKey = steps.map((step) => step.id).join(',');

  useEffect(() => {
    if (recipeRef.current !== recipeId) {
      // Nouvelle fiche : on relit sa propre clé (T-17-01).
      recipeRef.current = recipeId;
      setChecked(readCuisineProgress(recipeId, steps));
      return;
    }
    // Même fiche, étapes évoluées (réordre/édition) : on ne purge que les
    // orphelins, sans relire — la session seule reste intacte même si le
    // stockage est bloqué.
    setChecked((current) => {
      const known = new Set(steps.map((step) => step.id));
      let pruned = false;
      const next = new Set<string>();
      for (const id of current) {
        if (known.has(id)) next.add(id);
        else pruned = true;
      }
      if (pruned) writeCuisineProgress(recipeId, next);
      return pruned ? next : current;
    });
    // `steps` n'est lu que via sa clé d'ids stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, knownKey]);

  const toggle = useCallback(
    (id: string) => {
      setChecked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeCuisineProgress(recipeId, next);
        return next;
      });
    },
    [recipeId],
  );

  const reset = useCallback(() => {
    setChecked(new Set());
    clearCuisineProgress(recipeId);
  }, [recipeId]);

  return { checked, toggle, reset };
}
