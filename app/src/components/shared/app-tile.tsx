import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { ModuleTint } from '@/lib/modules';

/**
 * Tuile « Mes applications » — reprise FIDÈLE du vrai site melimelo.co
 * (captures de leur mockup d'application, 23 octobre 2026) :
 *
 * - le nom est en gras SANS-serif, en haut à gauche — pas en Fraunces :
 *   chez melimelo, le serif reste réservé aux chiffres et au héro, la
 *   tuile parle en encre droite ;
 * - l'objet (ici l'emoji, faute d'illustration 3D — aucun asset copié)
 *   déborde en bas à droite ;
 * - le compteur est une pastille ronde translucide en BAS À GAUCHE,
 *   posée sur l'illustration ;
 * - le format est presque carré (≈ 6:5 dans leur mockup).
 *
 * Aplats pastel : les six jetons existants, encre sapin dessus ≥ 7:1.
 * Aucun compteur à 0 : la pastille ne paraît qu'informée (règle du mur
 * de zéros, critique UI 2026-10-23).
 */
const TINT_CLASS: Record<ModuleTint, string> = {
  sage: 'bg-sage',
  blush: 'bg-blush',
  butter: 'bg-butter',
  sky: 'bg-sky',
  lilac: 'bg-lilac',
  sand: 'bg-sand',
};

export interface TileCounter {
  value: number;
  /** Libellé pour le nom accessible (« articles à acheter »). */
  label: string;
}

export interface AppTileProps {
  label: string;
  tint: ModuleTint;
  emoji: string;
  /** Destination du clic (omis quand le parent pilote la navigation). */
  to?: string;
  onClick?: () => void;
  /** « Vous êtes ici » : anneau sapin, le pendant de la pilule active du rail. */
  active?: boolean;
  counter?: TileCounter;
  className?: string;
}

const TILE_CLASS = cn(
  'relative flex aspect-[6/5] w-full flex-col items-start justify-between overflow-hidden rounded-[20px] p-3.5 text-left shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] active:translate-y-[-1px] focus-visible:outline focus-visible:outline-3 focus-visible:outline-[var(--color-accent-strong)]',
);

function TileContent({ label, emoji, counter }: { label: string; emoji: string; counter?: TileCounter }) {
  return (
    <>
      {/* `hyphens-auto` : en trois colonnes (feuille « Plus », 390 px),
          « Anniversaires » ne tient pas sur une ligne — le nom passe sur
          deux avec sa césure française (`lang="fr"` posé sur <html>) au
          lieu d'être rogné par l'overflow de la tuile. */}
      <strong className="relative z-1 text-[16px] font-bold leading-tight tracking-[-0.01em] text-fg hyphens-auto">
        {label}
      </strong>
      {/* L'objet de la tuile, calé en bas à droite mais ENTIER : rogné à
          moitié dans l'angle, il ne se lisait plus (retour du 23 octobre
          2026) ; recentré au plein centre, il perdait son ancrage. Le
          compromis : posé sur le coin, à peine effleuré par le bord. Sur
          PC la tuile de l'accueil approche 280 px de large : l'objet y
          suit la surface (112 px), il restait un timbre-poste à 58 px
          (retour du 23 octobre : « sur PC le dessin est trop petit »).
          La pastille-compteur le chevauche en bas à gauche, comme le
          « 21 » de melimelo pose sur son caddie, et grandit avec lui.
          `select-none` : un double-tac ne doit jamais sélectionner
          l'emoji. */}
      <span aria-hidden="true" className="pointer-events-none absolute right-0 bottom-0 select-none pr-1.5 pb-0.5 text-[58px] leading-none min-[651px]:text-[112px]">
        {emoji}
      </span>
      {/* Jamais un zéro décoratif : la pastille ne paraît que si la valeur
          est informative. */}
      {counter ? (
        <span
          aria-hidden="true"
          className="absolute bottom-2.5 left-3 z-1 grid size-[26px] place-items-center rounded-full bg-[oklch(100%_0_0/0.78)] text-[12px] font-bold text-fg min-[651px]:bottom-3 min-[651px]:left-3.5 min-[651px]:size-[30px] min-[651px]:text-[13px]"
        >
          {counter.value > 99 ? '99+' : counter.value}
        </span>
      ) : null}
    </>
  );
}

export function AppTile({ label, tint, emoji, to, onClick, active = false, counter, className }: AppTileProps) {
  // Le nom accessible porte le compteur : un lecteur d'écran entend
  // « Ouvrir Courses, 21 articles à acheter » et pas « Ouvrir Courses 21 ».
  const accessibleName = counter ? `Ouvrir ${label}, ${counter.value} ${counter.label}` : `Ouvrir ${label}`;
  const classes = cn(TILE_CLASS, TINT_CLASS[tint], active && 'ring-2 ring-accent ring-offset-2 ring-offset-surface', className);
  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        aria-label={accessibleName}
        aria-current={active ? 'page' : undefined}
        className={classes}
      >
        <TileContent label={label} emoji={emoji} counter={counter} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleName}
      aria-current={active ? 'page' : undefined}
      className={classes}
    >
      <TileContent label={label} emoji={emoji} counter={counter} />
    </button>
  );
}
