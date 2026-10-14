import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore } from '@/stores/household-store';
import { DEFAULT_RECIPE_CATEGORY, type Recipe, type RecipeFormValues, type RecipeSearchFilter } from './types';
import { resolveRecipeCoverUrls } from './api';
import { useRecettes } from './hooks/use-recettes';
import { RecipeCard } from './components/recipe-card';
import { RecipeFormDialog } from './components/recipe-form-dialog';
import { RecipeSettings } from './components/recipe-settings';

export default function RecettesPage() {
  const [filter, setFilter] = useState<RecipeSearchFilter>({ query: '', categoryId: null, tag: null, favoritesOnly: false });
  const {
    recipes,
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
    refreshChildren,
  } = useRecettes(filter);
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const [dialog, setDialog] = useState<{ open: boolean; recipe: Recipe | null }>({ open: false, recipe: null });
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const recipeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const recipe of recipes) {
      if (recipe.categoryId) counts[recipe.categoryId] = (counts[recipe.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [recipes]);

  const hasActiveFilter = filter.query.trim() !== '' || filter.categoryId !== null || filter.tag !== null || filter.favoritesOnly;

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
          <>
            <Button variant="secondary" icon="settings" onClick={() => setSettingsOpen(true)}>
              Catégories et étiquettes
            </Button>
            <Button icon="plus" onClick={() => setDialog({ open: true, recipe: null })}>
              Nouvelle recette
            </Button>
          </>
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

      {!isLoading && !isError ? (
        <Panel title="Rechercher" description="Nom, ingrédient, catégorie, étiquette et favoris se combinent.">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <label className="grid gap-1 text-[11px] font-[700] text-muted">
              Recherche
              <span className="relative block">
                <Input
                  value={filter.query}
                  onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
                  placeholder="Gratin, crème, chocolat…"
                  aria-label="Rechercher une recette"
                  autoComplete="off"
                  className="pl-9"
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
                  <Icon name="search" size="sm" />
                </span>
              </span>
            </label>
            <label className="grid gap-1 text-[11px] font-[700] text-muted">
              Catégorie
              <Select
                value={filter.categoryId ?? ''}
                onChange={(event) =>
                  setFilter((current) => ({ ...current, categoryId: event.target.value === '' ? null : event.target.value }))
                }
                aria-label="Filtrer par catégorie"
              >
                <option value="">Toutes</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-[11px] font-[700] text-muted">
              Étiquette
              <Select
                value={filter.tag ?? ''}
                onChange={(event) => setFilter((current) => ({ ...current, tag: event.target.value === '' ? null : event.target.value }))}
                aria-label="Filtrer par étiquette"
              >
                <option value="">Toutes</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    #{tag.name}
                  </option>
                ))}
              </Select>
            </label>
            <button
              type="button"
              onClick={() => setFilter((current) => ({ ...current, favoritesOnly: !current.favoritesOnly }))}
              aria-pressed={filter.favoritesOnly}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 self-end rounded-[10px] border border-border bg-surface px-[11px] text-[12px] font-[760] text-fg aria-pressed:border-accent aria-pressed:bg-accent-faint aria-pressed:text-accent-strong"
            >
              <Icon name="heart" size="sm" className={filter.favoritesOnly ? 'fill-current' : undefined} />
              Favoris
            </button>
          </div>
          {hasActiveFilter && visibleRecipes.length === 0 ? (
            <p className="m-0 pt-2 text-xs text-muted">Aucune recette ne correspond à ces filtres.</p>
          ) : null}
        </Panel>
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

      {canWrite && householdId ? (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <p className="eyebrow mb-2">Recettes</p>
              <DialogTitle>Catégories et étiquettes</DialogTitle>
              <DialogDescription>Gérez l’organisation de vos recettes.</DialogDescription>
            </DialogHeader>
            <RecipeSettings
              householdId={householdId}
              categories={categories}
              tags={tags}
              recipeCounts={recipeCounts}
              isSaving={isMutating}
              onChanged={() => refreshChildren()}
            />
          </DialogContent>
        </Dialog>
      ) : null}

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
