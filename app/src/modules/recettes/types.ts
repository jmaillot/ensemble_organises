import type { RecipeRow } from '@/types';
import type { IconName } from '@/components/shared/icon';

/**
 * Le schéma `recipes` reste volontairement minimal (cf. AGENTS.md §5) : seules
 * les recettes déjà enregistrées sont affichées, sans ingrédients ni étapes,
 * tant que le modèle complet n'est pas défini.
 */
export interface Recipe {
  id: string;
  householdId: string;
  title: string;
  createdAt: string;
}

export const toRecipe = (row: RecipeRow): Recipe => ({
  id: row.id,
  householdId: row.household_id,
  title: row.title,
  createdAt: row.created_at,
});

/** Libellé d'état affiché sur chaque recette déjà enregistrée. */
export const RECIPE_STATUS = 'Déjà enregistrée' as const;

/** Ce que la future version du module apportera, listé explicitement à l'écran. */
export interface RecipeFeature {
  icon: IconName;
  label: string;
  detail: string;
}

export const RECIPE_FEATURES: RecipeFeature[] = [
  {
    icon: 'receipt',
    label: 'Ingrédients',
    detail: 'Quantités et unités de chaque ingrédient, ajustables recette par recette.',
  },
  {
    icon: 'checkCircle',
    label: 'Étapes',
    detail: 'Un déroulé numéroté que chacun peut suivre depuis son téléphone.',
  },
  {
    icon: 'clock',
    label: 'Temps de préparation',
    detail: 'Préparation et cuisson affichées d’emblée pour organiser la semaine.',
  },
  {
    icon: 'link',
    label: 'Liaison avec Courses',
    detail: 'Envoyer les ingrédients manquants vers une liste de courses en un geste.',
  },
];
