import { useId, useState } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { catalogueModules, modulePath } from '@/lib/modules';
import { Icon } from './icon';
import { ModuleTile } from './module-tile';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Traitement d'un lien de navigation de la barre latérale. Partagé par les
 * accès rapides et par le catalogue pour que l'état actif soit identique.
 */
export const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-muted transition-colors duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:bg-accent-faint hover:text-fg max-[920px]:justify-center max-[920px]:px-0',
    isActive && 'bg-accent-soft font-[750] text-accent-strong',
  );

/**
 * Section « Tous les espaces » de la barre latérale : un bouton par catégorie.
 *
 * Elle est ouverte par défaut. La refermer resterait possible, mais un foyer
 * dont la moitié des catégories n'a aucun bouton est exactement le problème que
 * cette section corrige — le repli par défaut doit donc les exposer.
 */
export function ModuleCatalogueNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  return (
    <div className={cn('mt-6', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-muted transition-colors duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:bg-accent-faint hover:text-fg max-[920px]:justify-center max-[920px]:px-0"
      >
        <Icon name="grid" size="sm" />
        <span className="section-kicker flex-1 max-[920px]:sr-only">Tous les espaces</span>
        <span className="text-[11px] font-[760] text-muted max-[920px]:hidden">{catalogueModules.length}</span>
        <Icon
          name="chevronDown"
          size="sm"
          className={cn('transition-transform duration-[var(--duration-quick)] max-[920px]:hidden', open && 'rotate-180')}
        />
      </button>

      {/* La liste est retirée du rendu, pas masquée par une classe : elle sort
          alors de l'ordre de tabulation comme de l'arbre d'accessibilité sans
          dépendre de la feuille de style. `aria-expanded` porte l'état pour
          ceux qui n'ont pas la liste sous les yeux. */}
      {open ? (
        <ul id={panelId} aria-label="Espaces du foyer" className="mt-1 grid list-none gap-0.5 p-0">
          {catalogueModules.map((entry) => (
            <li key={entry.key}>
              <NavLink to={modulePath(entry.key)} className={navItemClass}>
                <Icon name={entry.icon} size="sm" />
                <span className="truncate text-[13px] max-[920px]:sr-only">{entry.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Le même catalogue en tuiles, dans un dialogue.
 *
 * Sous 650 px la barre latérale est masquée : sans ce dialogue, la navigation
 * basse — quatre entrées — resterait le seul moyen d'atteindre les catégories.
 */
export function ModuleCatalogueDialog({
  open,
  onOpenChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-[720px]', className)}>
        <DialogHeader>
          <p className="eyebrow mb-2">Navigation</p>
          <DialogTitle>Tous les espaces</DialogTitle>
          <DialogDescription>
            Les {catalogueModules.length} espaces du foyer, chacun avec son bouton.
          </DialogDescription>
        </DialogHeader>
        {/* Libellé distinct de celui de la barre latérale : sous 650 px celle-ci
            reste dans le DOM, et deux listes homonymes seraient ambiguës. */}
        <ul aria-label="Tous les espaces" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-[650px]:grid-cols-2">
          {catalogueModules.map((entry) => (
            <li key={entry.key} className="min-w-0">
              <ModuleTile entry={entry} onNavigate={() => onOpenChange(false)} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
