import { useMemo } from 'react';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useResource } from '@/lib/data/useResource';
import { formatMediumDate } from '@/lib/utils';
import type { RecipeRow } from '@/types';
import { RECIPE_FEATURES, RECIPE_STATUS, toRecipe } from './types';

const NOTIFY_MESSAGE = 'C’est noté, nous vous préviendrons dès l’ouverture des recettes.';

export default function RecettesPage() {
  const toast = useToast();
  const { rows, isLoading, isError, error, refetch } = useResource<RecipeRow>('recipes');

  const recipes = useMemo(
    () => rows.map(toRecipe).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows],
  );

  const notify = () => toast(NOTIFY_MESSAGE, 'success');

  return (
    <ModuleShell
      module="recettes"
      actions={
        <Button icon="bell" onClick={notify}>
          Me tenir informée
        </Button>
      }
    >
      <EmptyState
        icon="utensils"
        title="Les recettes arrivent bientôt."
        description="Vous pourrez bientôt enregistrer vos recettes, les ingrédients et les préférences de chaque membre."
        actionLabel="Me tenir informée"
        onAction={notify}
      />

      <div className="mt-[18px] grid grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-[18px] max-[920px]:grid-cols-1">
        <Panel
          title="Recettes déjà enregistrées"
          description="Le schéma détaillé (ingrédients, étapes, temps) sera défini plus tard."
        >
          {isLoading ? <LoadingRows rows={2} /> : null}
          {!isLoading && isError ? (
            <ErrorState message={error?.message ?? 'Les recettes sont inaccessibles.'} onRetry={refetch} />
          ) : null}
          {!isLoading && !isError && recipes.length === 0 ? (
            <p className="m-0 py-3 text-xs text-muted">
              Aucune recette enregistrée pour l’instant. Le module arrivera avec son formulaire de création.
            </p>
          ) : null}
          {!isLoading && !isError && recipes.length > 0 ? (
            <ul className="m-0 grid list-none gap-0 p-0">
              {recipes.map((recipe) => (
                <li
                  key={recipe.id}
                  className="flex min-h-11 items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-strong">
                    <Icon name="utensils" size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[13px]">{recipe.title}</strong>
                    <small className="text-[10px] text-muted">Enregistrée le {formatMediumDate(recipe.createdAt)}</small>
                  </div>
                  <Badge tone="muted">{RECIPE_STATUS}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Ce que le module apportera" description="Prévu pour la prochaine version.">
          <ul className="m-0 grid list-none gap-0 p-0">
            {RECIPE_FEATURES.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2.5 border-t border-border py-3 first:border-t-0 first:pt-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-accent-faint text-accent-strong">
                  <Icon name={feature.icon} size="sm" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-[12px]">{feature.label}</strong>
                  <small className="text-[11px] text-muted">{feature.detail}</small>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </ModuleShell>
  );
}
