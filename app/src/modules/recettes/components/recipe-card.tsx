import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { formatTotalTime, type Recipe } from '../types';

export interface RecipeCardProps {
  recipe: Recipe;
  /** URL affichable de la couverture (`null` = pas d'image, echec ferme). */
  coverUrl: string | null;
  /** Faux pour le rôle `enfant` : le coeur favori est desactive. */
  readOnly?: boolean;
  onToggleFavorite: (recipe: Recipe) => void;
}

/**
 * Carte recette esprit voyages (D-01) : photo plein fond, nom en haut,
 * temps total + categorie lisibles, tags en bas a droite, coeur favori en
 * haut a droite. Toute la carte navigue vers la fiche.
 */
export function RecipeCard({ recipe, coverUrl, readOnly = false, onToggleFavorite }: RecipeCardProps) {
  const totalTime = formatTotalTime(recipe.prepMinutes, recipe.cookMinutes);

  return (
    <article className="relative min-h-[148px] overflow-hidden rounded-[14px] border border-border bg-accent-faint">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/55" />

      <div className="relative flex min-h-[148px] flex-col justify-between gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/recettes/${recipe.id}`}
            className="min-w-0 flex-1 rounded-[6px] text-[15px] font-[800] leading-snug text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.55)] hover:underline"
          >
            {recipe.title}
          </Link>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onToggleFavorite(recipe)}
            aria-pressed={recipe.isFavorite}
            aria-label={recipe.isFavorite ? `Retirer ${recipe.title} des favoris` : `Ajouter ${recipe.title} aux favoris`}
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-full bg-black/35 text-white backdrop-blur-[2px] transition-colors relative z-10',
              recipe.isFavorite ? 'text-amber-300' : 'hover:bg-black/55',
              readOnly && 'cursor-default opacity-60',
            )}
          >
            <Icon name="heart" size="sm" className={recipe.isFavorite ? 'fill-current' : undefined} />
          </button>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-[700] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 backdrop-blur-[2px]">
              {recipe.categoryName}
            </span>
            {totalTime ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 backdrop-blur-[2px]">
                <Icon name="clock" size="sm" />
                {totalTime}
              </span>
            ) : null}
          </div>
          {recipe.tags.length > 0 ? (
            <p className="m-0 max-w-[55%] shrink-0 truncate text-right text-[11px] font-[700] text-white/95 [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
              {recipe.tags.map((tag) => `#${tag}`).join(' ')}
            </p>
          ) : null}
        </div>
      </div>

      <Link
        to={`/recettes/${recipe.id}`}
        aria-label={`Ouvrir la fiche ${recipe.title}`}
        className="absolute inset-0 rounded-[14px]"
      >
        <span className="sr-only">Ouvrir la fiche {recipe.title}</span>
      </Link>
    </article>
  );
}
