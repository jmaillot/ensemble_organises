import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { ModuleTint } from '@/lib/modules';

/**
 * Tuile pastel — le composant signature « Mes applications » de melimelo
 * (benchmark §2.4-3) : chaque espace a une couleur de fond et un objet, au
 * lieu d'une photo sombre uniforme (demande explicite du 23 octobre 2026 :
 * « les tuiles du site melimelo à la place des miennes »). L'emoji tient
 * lieu d'illustration — aucun asset 3D n'est copié, c'est le langage visuel
 * qui est repris, pas les images.
 *
 * Avec `to`, la tuile rend un vrai lien : naviguer entre deux pages est une
 * navigation, pas une action. L'encre sapin (`--color-fg`) sur chacun des
 * six pastels mesure ≥ 7:1.
 */
const TINT_CLASS: Record<ModuleTint, string> = {
  sage: 'bg-sage',
  blush: 'bg-blush',
  butter: 'bg-butter',
  sky: 'bg-sky',
  lilac: 'bg-lilac',
  sand: 'bg-sand',
};

export interface AppTileProps {
  label: string;
  tint: ModuleTint;
  emoji: string;
  /** Destination du clic (omis quand le parent pilote la navigation). */
  to?: string;
  onClick?: () => void;
  /** « Vous êtes ici » : anneau sapin, le pendant de la pilule active du rail. */
  active?: boolean;
  className?: string;
}

const TILE_CLASS = cn(
  'relative flex w-full min-h-[104px] flex-col items-start justify-between overflow-hidden rounded-[20px] p-3.5 text-left shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] active:translate-y-[-1px] focus-visible:outline focus-visible:outline-3 focus-visible:outline-[var(--color-accent-strong)]',
);

function TileContent({ label, emoji }: { label: string; emoji: string }) {
  return (
    <>
      {/* `hyphens-auto` : en trois colonnes (feuille « Plus », 390 px),
          « Anniversaires » ne tient pas sur une ligne — le nom passe sur
          deux avec sa césure française (`lang="fr"` posé sur <html>) au
          lieu d'être rogné par l'overflow de la tuile. */}
      <strong className="relative z-1 font-display text-[17px] leading-tight tracking-[-0.02em] text-fg hyphens-auto">
        {label}
      </strong>
      {/* L'objet de la tuile, posé en bas à droite comme chez melimelo.
          `select-none` : un double-tac ne doit jamais sélectionner l'emoji. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-1.5 -bottom-2 select-none text-[54px] leading-none">
        {emoji}
      </span>
    </>
  );
}

export function AppTile({ label, tint, emoji, to, onClick, active = false, className }: AppTileProps) {
  const classes = cn(TILE_CLASS, TINT_CLASS[tint], active && 'ring-2 ring-accent ring-offset-2 ring-offset-surface', className);
  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        // Le nom accessible est l'action, jamais la concaténation du contenu
        // visuel : l'emoji est décoratif (`aria-hidden`), la tuile parle.
        aria-label={`Ouvrir ${label}`}
        aria-current={active ? 'page' : undefined}
        className={classes}
      >
        <TileContent label={label} emoji={emoji} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ouvrir ${label}`}
      aria-current={active ? 'page' : undefined}
      className={classes}
    >
      <TileContent label={label} emoji={emoji} />
    </button>
  );
}
