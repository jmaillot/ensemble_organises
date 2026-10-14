import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchGuestRecipeView } from './api';
import { formatTotalTime, type RecipeIngredient, type RecipeStep } from './types';
import { IngredientList } from './components/ingredient-list';
import { RecipeSteps } from './components/recipe-steps';
import { CuisineToggle } from './components/cuisine-toggle';
import { RecipeCuisineView } from './components/recipe-cuisine-view';
import { useScreenWakeLock } from './hooks/use-screen-wake-lock';

const noop = () => undefined;

/**
 * Page PUBLIQUE d'invitation recette (D-14, R11) : un lien
 * `/invitation/recette?code=…` suffit — aucun compte requis.
 *
 * Même fiche qu'en foyer (défilement, curseur pair, cases cuisson locales)
 * mais ZÉRO bouton d'édition et ZÉRO appel PostgREST direct (T-16-10) : la
 * seule donnée vient de l'Edge `recipe-invite` (`link-view`, ticket = code),
 * et les composants sont rendus `readOnly` avec des callbacks neutres.
 */
export default function GuestRecipePage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [activeCode, setActiveCode] = useState<string | null>(() => {
    const initial = (params.get('code') ?? '').trim();
    return initial.length >= 22 ? initial : null;
  });
  const [formError, setFormError] = useState<string | null>(null);
  /** Mode cuisine invité : OFF à chaque ouverture de lien (R5, D-16), seule la progression est mémorisée. */
  const [cuisine, setCuisine] = useState(false);
  useEffect(() => {
    // Le composant survit au changement de lien (même route) : on force OFF
    // (même idiome que la fiche membre sur `[id]`, piège Pitfall 3).
    setCuisine(false);
  }, [activeCode]);
  const wakeLockSupported = useScreenWakeLock(cuisine).supported;

  const viewQuery = useQuery({
    queryKey: ['recettes', 'link-view', activeCode ?? ''],
    enabled: activeCode !== null && isSupabaseConfigured,
    retry: false,
    queryFn: () => fetchGuestRecipeView(activeCode as string),
  });

  const openLink = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!isSupabaseConfigured) {
      setFormError('Connexion au serveur indisponible pour le moment.');
      return;
    }
    const trimmed = code.trim();
    if (trimmed.length < 22) {
      setFormError('Ce lien semble incomplet.');
      return;
    }
    setActiveCode(trimmed);
  };

  const view = viewQuery.data ?? null;
  const ingredients: RecipeIngredient[] = (view?.ingredients ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    quantity: entry.quantity,
    unit: entry.unit,
    position: entry.position,
  }));
  const steps: RecipeStep[] = (view?.steps ?? []).map((entry) => ({
    id: entry.id,
    content: entry.content,
    position: entry.position,
  }));
  const totalTime = view ? formatTotalTime(view.prepMinutes, view.cookMinutes) : null;
  // Mémoire sur l'appareil de l'invité, même clé que la fiche membre (D-17).
  // Entrée locale orpheline (recette supprimée côté foyer) : inoffensive —
  // la clé par id n'est jamais relue ailleurs, aucune migration (edge R3).
  const cuisineRecipeId = view?.recipeId ?? activeCode ?? 'invite';

  return (
    <ModuleShell module="recettes">
      <Panel
        id="guest-recipe-panel"
        title={view?.title ?? 'Invitation à une recette'}
        description={view ? 'Accès invité · lecture seule' : 'Un lien suffit, aucun compte n’est requis pour regarder.'}
      >
        {!activeCode ? (
          <form noValidate className="grid gap-3.5" onSubmit={openLink}>
            <Field label="Code d’invitation" error={formError ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  onChange={(change) => setCode(change.target.value)}
                  autoComplete="off"
                  placeholder="Code figurant dans le lien partagé"
                />
              )}
            </Field>
            <div>
              <Button type="submit" icon="arrow" disabled={code.trim().length < 22}>
                Voir la recette
              </Button>
            </div>
          </form>
        ) : !isSupabaseConfigured ? (
          <EmptyState
            icon="utensils"
            title="Mode hors ligne"
            description="L’ouverture du lien exige le serveur : reconnectez-vous pour continuer."
          />
        ) : viewQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : viewQuery.isError || !view?.title ? (
          <ErrorState
            message="Ce lien ne passe plus (lien révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
            onRetry={() => setActiveCode(null)}
          />
        ) : (
          <div className="grid gap-[18px]">
            {view.coverPhotoUrl ? (
              <img
                src={view.coverPhotoUrl}
                alt={`Photo de ${view.title}`}
                className="h-44 w-full rounded-[12px] object-cover"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              <span>
                Pour {view.servings ?? 4} personne{(view.servings ?? 4) > 1 ? 's' : ''}
              </span>
              {totalTime ? <span aria-hidden="true">·</span> : null}
              {totalTime ? <span>{totalTime}</span> : null}
              {view.category ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{view.category}</span>
                </>
              ) : null}
              {view.tags.length > 0 ? <span aria-hidden="true">·</span> : null}
              {view.tags.length > 0 ? <span>{view.tags.map((tag) => `#${tag}`).join(' ')}</span> : null}
            </div>
            <IngredientList
              ingredients={ingredients}
              baseServings={view.servings ?? 4}
              readOnly
              onAdd={noop}
              onUpdate={noop}
              onDelete={noop}
            />
            <Panel
              title="Étapes"
              description={
                cuisine
                  ? 'Cochez au fur et à mesure. Progression mémorisée sur cet appareil.'
                  : 'Glissez la pastille numérotée pour réordonner.'
              }
              action={<CuisineToggle active={cuisine} onToggle={() => setCuisine((current) => !current)} />}
            >
              {cuisine ? (
                <RecipeCuisineView steps={steps} recipeId={cuisineRecipeId} wakeLockSupported={wakeLockSupported} />
              ) : (
                <RecipeSteps steps={steps} readOnly onAdd={noop} onUpdate={noop} onDelete={noop} onReorder={noop} />
              )}
            </Panel>
            <Panel
              id="guest-recipe-join-panel"
              title="Envie de cuisiner ?"
              description="La lecture est libre, mais garder la recette demande un compte."
            >
              <p className="m-0 mb-3 text-[12px] text-muted">
                Créez un compte, puis demandez à votre foyer de vous partager ses recettes.
              </p>
              <Link
                to="/connexion"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
              >
                Créer un compte
              </Link>
            </Panel>
          </div>
        )}
      </Panel>
    </ModuleShell>
  );
}
