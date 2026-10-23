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
    <article className="relative min-h-[180px] overflow-hidden rounded-[20px] border border-border bg-accent-faint transition-shadow duration-[var(--duration-slow)] hover:shadow-md">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {/* Voile de lisibilité : le titre en haut et les métadonnées en bas
          gardent un contraste suffisant sur une photo claire. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,32,30,0.55)_0%,rgba(14,32,30,0.1)_38%,rgba(14,32,30,0.72)_100%)]"
      />

      <div className="relative flex min-h-[180px] flex-col justify-between gap-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/recettes/${recipe.id}`}
            className="min-w-0 flex-1 rounded-[6px] font-display text-[17px] leading-snug font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] hover:underline"
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
              'relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-black/30 text-white backdrop-blur-[2px] transition-colors duration-[var(--duration-quick)]',
              // `coral-strong` et non `coral` : la carte est une photo, le coeur
              // doit tenir sur un fond clair. La fiche, sur `bg-surface`, garde
              // `text-coral` (recette-detail-page.tsx).
              recipe.isFavorite ? 'text-coral-strong' : 'hover:bg-black/55',
              readOnly && 'cursor-default opacity-60',
            )}
          >
            <Icon name="heart" size="sm" className={recipe.isFavorite ? 'fill-current' : undefined} />
          </button>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
            <span className="inline-flex min-h-[22px] items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 backdrop-blur-sm">
              {recipe.categoryName}
            </span>
            {totalTime ? (
              <span className="inline-flex min-h-[22px] items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 backdrop-blur-sm">
                <Icon name="clock" size="sm" />
                {totalTime}
              </span>
            ) : null}
          </div>
          {recipe.tags.length > 0 ? (
            <p className="m-0 max-w-[55%] shrink-0 truncate text-right text-[11px] font-bold text-white/95 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
              {recipe.tags.map((tag) => `#${tag}`).join(' ')}
            </p>
          ) : null}
        </div>
      </div>

      <Link
        to={`/recettes/${recipe.id}`}
        aria-label={`Ouvrir la fiche ${recipe.title}`}
        className="absolute inset-0 rounded-[20px]"
      >
        <span className="sr-only">Ouvrir la fiche {recipe.title}</span>
      </Link>
    </article>
  );
}
