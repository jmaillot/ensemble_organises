import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/shared/icon';

export interface FabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Libellé accessible : le bouton flottant ne porte jamais de texte visible. */
  label: string;
}

/**
 * Bouton flottant — cercle sapin de 56 px, icône seule, en bas à droite.
 * L'action principale du module, à portée de pouce : libellé accessible
 * obligatoire, cible ≥ 44 px, au-dessus de la barre de navigation basse
 * (environ 76 px + zone sûre) sur mobile, au ras du contenu sur desktop.
 * L'appelant décide de sa visibilité par point de rupture via `className`
 * (p. ex. `min-[651px]:hidden` quand l'en-tête porte déjà l'action).
 */
export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { icon, label, type, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'fixed right-5 z-30 grid size-14 place-items-center rounded-full bg-accent text-surface shadow-[var(--shadow-md)]',
        'transition-[background-color,transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-out)]',
        'hover:-translate-y-px hover:bg-accent-strong hover:shadow-[var(--shadow-lg)] active:translate-y-0',
        'bottom-[calc(88px+env(safe-area-inset-bottom))] min-[651px]:bottom-6',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
});
