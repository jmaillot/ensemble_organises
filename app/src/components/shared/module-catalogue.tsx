import { useId, useState } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { catalogueModules, isChildHiddenModule, modulePath } from '@/lib/modules';
import { useCurrentMember } from '@/stores/household-store';
import { Icon } from './icon';

/**
 * Traitement d'un lien de navigation de la barre latérale. Partagé par les
 * accès rapides et par le catalogue pour que l'état actif soit identique.
 */
export const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-[13.5px] text-muted transition-colors duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:bg-accent-faint hover:text-fg max-[920px]:justify-center max-[920px]:px-0',
    isActive && 'bg-accent font-[650] text-surface hover:bg-accent-strong hover:text-surface',
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
  // Rôle `enfant` (phase 14, D-05) : les 5 modules hors périmètre sortent du
  // catalogue, comme les tuiles et le tiroir — présentation seulement.
  const isChild = useCurrentMember()?.role === 'enfant';
  const visibleModules = isChild ? catalogueModules.filter((entry) => !isChildHiddenModule(entry.key)) : catalogueModules;

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
        <span className="text-[11px] font-[760] text-muted max-[920px]:hidden">{visibleModules.length}</span>
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
          {visibleModules.map((entry) => (
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
