import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatTotalTime, type Recipe, type RecipeFormValues } from './types';
import { Icon } from '@/components/shared/icon';
import {
  createRecipeIngredient,
  createRecipeStep,
  deleteRecipeIngredient,
  deleteRecipeStep,
  resolveRecipeCoverUrl,
  updateRecipeIngredient,
  updateRecipeStep,
} from './api';
import { EMPTY_RECIPE_FILTER, useRecettes } from './hooks/use-recettes';
import { IngredientList } from './components/ingredient-list';
import { RecipeSteps } from './components/recipe-steps';
import { RecipeFormDialog } from './components/recipe-form-dialog';

/**
 * Fiche recette en defilement unique (D-03) : header photo/nom/meta,
 * curseur au-dessus des ingredients (D-04), ingredients, etapes, actions.
 */
export default function RecetteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const {
    recipes,
    categories,
    tags,
    ingredientsByRecipe,
    stepsByRecipe,
    canWrite,
    isLoading,
    isError,
    error,
    refetch,
    isMutating,
    saveRecipe,
    removeRecipe,
    toggleFavorite,
    reorderSteps,
    refreshChildren,
  } = useRecettes(EMPTY_RECIPE_FILTER);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recipe: Recipe | null = useMemo(() => recipes.find((entry) => entry.id === id) ?? null, [recipes, id]);
  const ingredients = recipe ? (ingredientsByRecipe[recipe.id] ?? []) : [];
  const steps = recipe ? (stepsByRecipe[recipe.id] ?? []) : [];

  const coverQuery = useQuery({
    queryKey: ['recettes', 'cover', recipe?.id, recipe?.coverPhoto],
    enabled: Boolean(recipe),
    queryFn: () => resolveRecipeCoverUrl(recipe?.coverPhoto ?? null),
  });
  const coverUrl = coverQuery.data ?? null;
  const totalTime = recipe ? formatTotalTime(recipe.prepMinutes, recipe.cookMinutes) : null;

  const guard = () => {
    if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
  };

  const submitRecipe = async (values: RecipeFormValues) => {
    if (!recipe) return;
    try {
      await saveRecipe(recipe, values);
      toast('Recette mise à jour.');
      setDialogOpen(false);
    } catch (submitError) {
      toast(submitError instanceof Error ? submitError.message : 'La recette n’a pas pu être enregistrée.', 'error');
    }
  };

  if (isLoading) {
    return (
      <ModuleShell module="recettes">
        <LoadingRows rows={4} />
      </ModuleShell>
    );
  }

  if (isError) {
    return (
      <ModuleShell module="recettes">
        <ErrorState message={error?.message ?? 'La recette est inaccessible.'} onRetry={refetch} />
      </ModuleShell>
    );
  }

  if (!recipe) {
    return (
      <ModuleShell module="recettes">
        <EmptyState
          icon="utensils"
          title="Recette introuvable."
          description="Elle a peut-être été supprimée."
          actionLabel="Retour aux recettes"
          onAction={() => navigate('/recettes')}
        />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      module="recettes"
      actions={
        <>
          <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/recettes')}>
            Recettes
          </Button>
          {canWrite ? (
            <Button icon="edit" onClick={() => setDialogOpen(true)}>
              Modifier
            </Button>
          ) : undefined}
        </>
      }
    >
      <Panel title={recipe.title} description={recipe.categoryName}>
        {coverUrl ? (
          <img src={coverUrl} alt={`Photo de ${recipe.title}`} className="mb-3 h-48 w-full rounded-[12px] object-cover" />
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span>
            Pour {recipe.servings} personne{recipe.servings > 1 ? 's' : ''}
          </span>
          {totalTime ? <span aria-hidden="true">·</span> : null}
          {totalTime ? <span>{totalTime}</span> : null}
          {recipe.tags.length > 0 ? <span aria-hidden="true">·</span> : null}
          {recipe.tags.length > 0 ? <span>{recipe.tags.map((tag) => `#${tag}`).join(' ')}</span> : null}
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => {
              void toggleFavorite(recipe).catch((favoriteError: unknown) =>
                toast(
                  favoriteError instanceof Error ? favoriteError.message : 'Le favori n’a pas pu être mis à jour.',
                  'error',
                ),
              );
            }}
            aria-pressed={recipe.isFavorite}
            aria-label={recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            title={canWrite ? undefined : 'Lecture seule'}
            className="ml-auto grid size-11 place-items-center rounded-full border border-border text-muted hover:text-fg disabled:opacity-50"
          >
            <Icon name="heart" size="sm" className={recipe.isFavorite ? 'fill-current text-coral' : undefined} />
          </button>
        </div>
      </Panel>

      <Panel title="Ingrédients" description="Quantités recalculées au nombre de personnes.">
        <IngredientList
          ingredients={ingredients}
          baseServings={recipe.servings}
          readOnly={!canWrite}
          isSaving={isMutating}
          onAdd={async (input) => {
            try {
              guard();
              await createRecipeIngredient({
                recipeId: recipe.id,
                householdId: recipe.householdId,
                name: input.name,
                quantity: input.quantity,
                unit: input.unit,
                position: ingredients.length,
              });
              await refreshChildren();
            } catch (addError) {
              toast(addError instanceof Error ? addError.message : 'L’ingrédient n’a pas pu être ajouté.', 'error');
            }
          }}
          onUpdate={async (ingredient, input) => {
            try {
              guard();
              await updateRecipeIngredient(ingredient.id, input);
              await refreshChildren();
            } catch (updateError) {
              toast(updateError instanceof Error ? updateError.message : 'L’ingrédient n’a pas pu être modifié.', 'error');
            }
          }}
          onDelete={async (ingredient) => {
            try {
              guard();
              await deleteRecipeIngredient(ingredient.id);
              await refreshChildren();
            } catch (deleteError) {
              toast(deleteError instanceof Error ? deleteError.message : 'L’ingrédient n’a pas pu être supprimé.', 'error');
            }
          }}
        />
      </Panel>

      <Panel title="Étapes" description="Glissez la pastille numérotée pour réordonner.">
        <RecipeSteps
          steps={steps}
          readOnly={!canWrite}
          isSaving={isMutating}
          onAdd={async (content) => {
            try {
              guard();
              await createRecipeStep({ recipeId: recipe.id, householdId: recipe.householdId, content, position: steps.length });
              await refreshChildren();
            } catch (addError) {
              toast(addError instanceof Error ? addError.message : 'L’étape n’a pas pu être ajoutée.', 'error');
            }
          }}
          onUpdate={async (step, content) => {
            try {
              guard();
              await updateRecipeStep(step.id, content);
              await refreshChildren();
            } catch (updateError) {
              toast(updateError instanceof Error ? updateError.message : 'L’étape n’a pas pu être modifiée.', 'error');
            }
          }}
          onDelete={async (step) => {
            try {
              guard();
              await deleteRecipeStep(step.id);
              await refreshChildren();
            } catch (deleteError) {
              toast(deleteError instanceof Error ? deleteError.message : 'L’étape n’a pas pu être supprimée.', 'error');
            }
          }}
          onReorder={async (orderedIds) => {
            try {
              await reorderSteps(recipe.id, orderedIds);
              toast('Ordre des étapes mis à jour.');
            } catch (reorderError) {
              toast(reorderError instanceof Error ? reorderError.message : 'L’ordre n’a pas pu être enregistré.', 'error');
            }
          }}
        />
      </Panel>

      {canWrite ? (
        <Panel title="Actions" description="Zone sensible.">
          {confirmDelete ? (
            <div role="alertdialog" aria-modal="true" aria-label={`Supprimer ${recipe.title} ?`}>
              <p className="m-0 text-[13px]">
                Supprimer <strong>{recipe.title}</strong> et tout son contenu (ingrédients, étapes, photo) ?
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  disabled={isMutating}
                  onClick={() => {
                    setConfirmDelete(false);
                    void removeRecipe(recipe)
                      .then(() => {
                        toast('Recette supprimée.');
                        navigate('/recettes');
                      })
                      .catch((deleteError: unknown) =>
                        toast(deleteError instanceof Error ? deleteError.message : 'La suppression a échoué.', 'error'),
                      );
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
              Supprimer la recette
            </Button>
          )}
        </Panel>
      ) : null}

      <p className="m-0 text-xs text-muted">
        <Link to="/recettes">← Retour aux recettes</Link>
      </p>

      <RecipeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        recipe={recipe}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        allTags={tags.map((tag) => tag.name)}
        isSaving={isMutating}
        onSubmit={submitRecipe}
      />
    </ModuleShell>
  );
}
