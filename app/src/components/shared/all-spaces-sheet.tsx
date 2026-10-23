import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { Icon } from './icon';
import { useVisibleDrawerEntries } from './mobile-drawer';

/**
 * Feuille « Tous les espaces » (≤650px) : le « Plus » de la barre basse
 * ouvre ici la liste complète, en feuille de bas de page — le tiroir
 * hamburger reste réservé aux réglages (benchmark §9.2, décision 2).
 * Radix fournit l'overlay, Échap et le piège de focus ; la visibilité des
 * espaces suit exactement les mêmes règles que le tiroir (rôle enfant,
 * menu des applications 0140) — une seule liste, jamais deux vérités.
 */
export function AllSpacesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const entries = useVisibleDrawerEntries();

  // Une navigation referme la feuille (filet de sécurité en plus du onClick).
  useEffect(() => {
    onOpenChange(false);
    // `onOpenChange` est omis volontairement : le parent recrée ce rappel à
    // chaque rendu, donc l'inclure rejouerait la fermeture à chaque rendu
    // au lieu de ne la déclencher qu'au changement de route.
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    if (typeof document !== 'undefined') document.body.dataset.scrollLock = 'true';
    return () => {
      if (typeof document !== 'undefined') document.body.dataset.scrollLock = 'false';
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-[oklch(20%_0.02_240/0.42)] backdrop-blur-[6px] min-[651px]:hidden" />
        <DialogPrimitive.Content className="fixed right-0 bottom-0 left-0 z-[80] flex max-h-[calc(100dvh-56px)] flex-col overflow-hidden rounded-t-[32px] border-t border-border bg-surface pb-[max(16px,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)] min-[651px]:hidden">
          {/* Poignée décorative : la feuille se referme aussi par l'overlay,
              le bouton et Échap — la poignée ne porte aucune action. */}
          <span aria-hidden="true" className="mx-auto mt-3 mb-1 block h-[5px] w-[38px] rounded-full bg-border" />
          <DialogPrimitive.Title className="mb-3 px-5 font-display text-lg tracking-[-0.02em]">
            Tous les espaces
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Choisissez un espace pour y naviguer, ou refermez la feuille.
          </DialogPrimitive.Description>
          <nav aria-label="Espaces du foyer" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-3">
            <ul className="m-0 grid list-none gap-1 p-0 pb-2">
              {entries.map((entry) => (
                <li key={entry.key}>
                  <NavLink
                    to={entry.to}
                    onClick={() => onOpenChange(false)}
                    aria-label={`Ouvrir ${entry.label}`}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] font-semibold text-fg transition-colors hover:bg-accent-faint',
                        isActive && 'bg-accent-soft text-accent-strong',
                      )
                    }
                  >
                    <Icon name={entry.icon} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <Icon name="chevronRight" size="sm" className="text-muted" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
