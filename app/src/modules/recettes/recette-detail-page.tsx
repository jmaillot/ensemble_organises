import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useResource } from '@/lib/data/useResource';
import type { ShoppingListRow } from '@/types';
import { closestServingsStep, formatTotalTime, toRecipePrintModel, type Recipe, type RecipeFormValues } from './types';
import { Icon } from '@/components/shared/icon';
import {
  createRecipeIngredient,
  createRecipeStep,
  deleteRecipeIngredient,
  deleteRecipeStep,
  resolveRecipeCoverUrl,
  sendRecipeIngredientsToCourses,
  updateRecipeIngredient,
  updateRecipeStep,
} from './api';
import { EMPTY_RECIPE_FILTER, useRecettes } from './hooks/use-recettes';
import { IngredientList } from './components/ingredient-list';
import { RecipeSteps } from './components/recipe-steps';
import { RecipeFormDialog } from './components/recipe-form-dialog';
import { RecipeShareDialog } from './components/recipe-share-dialog';
import './components/recipe-export.css';

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
    currentMemberId,
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
  const shoppingLists = useResource<ShoppingListRow>('shopping_lists');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [coursesListId, setCoursesListId] = useState('');
  const [coursesBusy, setCoursesBusy] = useState(false);
  const [coursesResult, setCoursesResult] = useState<string | null>(null);
  /** Échelle courante du curseur, partagée entre fiche, print et Courses. */
  const [targetServings, setTargetServings] = useState<number | null>(null);

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

  const effectiveTarget = targetServings ?? closestServingsStep(recipe?.servings ?? 4);
  /** Listes du foyer seul (phase 15 : les fourches voyage `trip_id` sont exclues, comme Courses). */
  const householdShoppingLists = useMemo(
    () => shoppingLists.rows.filter((list) => list.trip_id == null),
    [shoppingLists.rows],
  );
  const validCoursesListId =
    coursesListId !== '' && householdShoppingLists.some((list) => list.id === coursesListId) ? coursesListId : '';
  const selectedCoursesListId = validCoursesListId !== '' ? validCoursesListId : (householdShoppingLists[0]?.id ?? '');
  const printModel = recipe
    ? toRecipePrintModel({
        title: recipe.title,
        servings: recipe.servings,
        targetServings: effectiveTarget,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        ingredients,
        steps,
      })
    : null;

  const sendToCourses = async () => {
    if (!recipe) return;
    try {
      guard();
      if (selectedCoursesListId === '') {
        toast('Choisissez une liste de courses.', 'error');
        return;
      }
      if (ingredients.length === 0) {
        toast('Aucun ingrédient à envoyer.', 'error');
        return;
      }
      setCoursesBusy(true);
      const sent = await sendRecipeIngredientsToCourses({
        householdId: recipe.householdId,
        listId: selectedCoursesListId,
        addedBy: currentMemberId === '' ? null : currentMemberId,
        ingredients: ingredients.map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit })),
        baseServings: recipe.servings,
        targetServings: effectiveTarget,
      });
      const listName = householdShoppingLists.find((list) => list.id === selectedCoursesListId)?.name ?? 'la liste';
      const lines = sent.rows
        .map((row) => `${row.name} (${row.quantity === null ? (row.unit ?? 'au goût') : `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`})`)
        .join(', ');
      const parts: string[] = [];
      if (sent.createdCount > 0) parts.push(`${sent.createdCount} ajoutée${sent.createdCount > 1 ? 's' : ''}`);
      if (sent.mergedCount > 0)
        parts.push(`${sent.mergedCount} quantité${sent.mergedCount > 1 ? 's' : ''} cumulée${sent.mergedCount > 1 ? 's' : ''}`);
      setCoursesResult(`${parts.join(', ')} dans « ${listName} » : ${lines}.`);
      toast('Ingrédients envoyés vers Courses.');
    } catch (sendError) {
      toast(sendError instanceof Error ? sendError.message : 'L’envoi vers Courses a échoué.', 'error');
    } finally {
      setCoursesBusy(false);
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
    <>
    <div className="recipe-screen">
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
          key={recipe.id}
          ingredients={ingredients}
          baseServings={recipe.servings}
          readOnly={!canWrite}
          isSaving={isMutating}
          servings={effectiveTarget}
          onServingsChange={setTargetServings}
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
        <Panel title="Actions" description="Partage, export, Courses, zone sensible.">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>
                Partager
              </Button>
              <Button variant="secondary" icon="download" onClick={() => window.print()}>
                Exporter
              </Button>
              <Button variant="secondary" icon="plus" onClick={() => setCoursesOpen((current) => !current)} aria-expanded={coursesOpen}>
                Ajouter à une liste
              </Button>
            </div>
            {coursesOpen ? (
              <div className="grid gap-2.5 rounded-[11px] border border-border bg-bg p-3">
                <label className="grid gap-1.5 text-[11px] font-extrabold text-muted" htmlFor="recette-courses-liste">
                  Liste de courses (quantités pour {effectiveTarget} personnes)
                  <Select
                    id="recette-courses-liste"
                    value={selectedCoursesListId}
                    onChange={(event) => setCoursesListId(event.target.value)}
                    disabled={coursesBusy || householdShoppingLists.length === 0}
                  >
                    {householdShoppingLists.length === 0 ? <option value="">Aucune liste dans ce foyer</option> : null}
                    {householdShoppingLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {coursesResult ? (
                  <p className="m-0 text-[12px] font-semibold text-accent-strong" role="status">
                    {coursesResult}
                  </p>
                ) : null}
                <div>
                  <Button disabled={coursesBusy || selectedCoursesListId === ''} onClick={() => void sendToCourses()}>
                    {coursesBusy ? 'Envoi…' : 'Envoyer les ingrédients'}
                  </Button>
                </div>
              </div>
            ) : null}
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
          </div>
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
    </div>
    {printModel ? (
      <div className="recipe-print" aria-hidden="true">
        <h2>{printModel.title}</h2>
        <p>{printModel.meta}</p>
        <h3>Ingrédients</h3>
        <ul>
          {printModel.ingredientLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3>Étapes</h3>
        <ol>
          {printModel.stepLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>
    ) : null}
    {canWrite ? <RecipeShareDialog open={shareOpen} onOpenChange={setShareOpen} recipe={recipe} /> : null}
    </>
  );
}
