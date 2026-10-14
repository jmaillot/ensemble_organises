import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DEFAULT_RECIPE_CATEGORY, type Recipe, type RecipeFormValues } from './types';
import { resolveRecipeCoverUrls } from './api';
import { EMPTY_RECIPE_FILTER, useRecettes } from './hooks/use-recettes';
import { RecipeCard } from './components/recipe-card';
import { RecipeFormDialog } from './components/recipe-form-dialog';

export default function RecettesPage() {
  const {
    visibleRecipes,
    categories,
    tags,
    canWrite,
    isLoading,
    isError,
    error,
    refetch,
    isMutating,
    saveRecipe,
    toggleFavorite,
  } = useRecettes(EMPTY_RECIPE_FILTER);
  const toast = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; recipe: Recipe | null }>({ open: false, recipe: null });

  const coverInputs = useMemo(
    () => visibleRecipes.map((recipe) => ({ id: recipe.id, cover_photo: recipe.coverPhoto })),
    [visibleRecipes],
  );
  const coversQuery = useQuery({
    queryKey: ['recettes', 'covers', coverInputs],
    queryFn: () => resolveRecipeCoverUrls(coverInputs),
  });
  const covers = coversQuery.data ?? {};

  const sections = useMemo(() => {
    const order = new Map(categories.map((category, index) => [category.id, index]));
    const grouped = new Map<string | null, Recipe[]>();
    for (const recipe of visibleRecipes) {
      grouped.set(recipe.categoryId, [...(grouped.get(recipe.categoryId) ?? []), recipe]);
    }
    return [...grouped.entries()]
      .map(([categoryId, items]) => ({
        categoryId,
        name:
          categoryId === null
            ? DEFAULT_RECIPE_CATEGORY
            : (categories.find((category) => category.id === categoryId)?.name ?? DEFAULT_RECIPE_CATEGORY),
        items,
      }))
      .sort((a, b) => {
        const aDefault = a.name === DEFAULT_RECIPE_CATEGORY ? 0 : 1;
        const bDefault = b.name === DEFAULT_RECIPE_CATEGORY ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        return (order.get(a.categoryId ?? '') ?? 0) - (order.get(b.categoryId ?? '') ?? 0);
      });
  }, [visibleRecipes, categories]);

  const closeDialog = () => setDialog((current) => ({ ...current, open: false }));

  const submitRecipe = async (values: RecipeFormValues) => {
    try {
      await saveRecipe(dialog.recipe, values);
      toast(dialog.recipe ? 'Recette mise à jour.' : 'Recette créée.');
      closeDialog();
    } catch (submitError) {
      toast(submitError instanceof Error ? submitError.message : 'La recette n’a pas pu être enregistrée.', 'error');
    }
  };

  return (
    <ModuleShell
      module="recettes"
      actions={
        canWrite ? (
          <Button icon="plus" onClick={() => setDialog({ open: true, recipe: null })}>
            Nouvelle recette
          </Button>
        ) : undefined
      }
    >
      {isLoading ? <LoadingRows rows={3} /> : null}
      {!isLoading && isError ? (
        <ErrorState message={error?.message ?? 'Les recettes sont inaccessibles.'} onRetry={refetch} />
      ) : null}

      {!isLoading && !isError && visibleRecipes.length === 0 ? (
        <EmptyState
          icon="utensils"
          title="Aucune recette pour l’instant."
          description="Créez votre première recette du foyer : nom, ingrédients, étapes, et le tour est joué."
          actionLabel={canWrite ? 'Créer une recette' : undefined}
          onAction={canWrite ? () => setDialog({ open: true, recipe: null }) : undefined}
        />
      ) : null}

      {!isLoading && !isError
        ? sections.map((section) => (
            <Panel key={section.categoryId ?? 'defaut'} title={section.name} description={`${section.items.length} recette${section.items.length > 1 ? 's' : ''}`}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {section.items.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    coverUrl={covers[recipe.id] ?? null}
                    readOnly={!canWrite}
                    onToggleFavorite={(target) => {
                      void toggleFavorite(target).catch((favoriteError: unknown) =>
                        toast(
                          favoriteError instanceof Error ? favoriteError.message : 'Le favori n’a pas pu être mis à jour.',
                          'error',
                        ),
                      );
                    }}
                  />
                ))}
              </div>
            </Panel>
          ))
        : null}

      <RecipeFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        recipe={dialog.recipe}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        allTags={tags.map((tag) => tag.name)}
        isSaving={isMutating}
        onSubmit={submitRecipe}
      />
    </ModuleShell>
  );
}
