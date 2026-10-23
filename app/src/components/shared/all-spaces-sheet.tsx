import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useLocation } from 'react-router';
import { AppTile } from './app-tile';
import { moduleMap, type ModuleKey } from '@/lib/modules';
import { useVisibleDrawerEntries, type DrawerEntry } from './mobile-drawer';

/**
 * Les espaces que la barre basse sert déjà d'un tap (benchmark §2.6 :
 * « “Plus” ouvre une feuille avec les 13 autres espaces »). La feuille ne
 * les répète pas : ses entrées sont les espaces du tiroir MINUS ces quatre-là.
 */
export const BOTTOM_NAV_KEYS = ['accueil', 'courses', 'calendrier', 'taches'] as const;

/**
 * Feuille « Tous les espaces » (≤650px) : le « Plus » de la barre basse
 * ouvre ici la grille de tuiles pastel des espaces hors barre basse — la
 * grille « Mes applications » de melimelo, 3 colonnes sur mobile (benchmark
 * §2.4-3), à la place de la liste textuelle (demande du 23 octobre 2026).
 * Radix fournit l'overlay, Échap et le piège de focus ; la visibilité des
 * espaces suit exactement les mêmes règles que le tiroir (rôle enfant, menu
 * des applications 0140) — une seule liste, jamais deux vérités.
 */
export function AllSpacesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const entries = useVisibleDrawerEntries();
  const extraEntries: DrawerEntry[] = entries.filter(
    (entry) => !(BOTTOM_NAV_KEYS as readonly string[]).includes(entry.key),
  );

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
          <nav aria-label="Espaces du foyer" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4">
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 pb-2">
              {extraEntries.map((entry) => (
                <li key={entry.key} className="min-w-0">
                  <AppTile
                    label={entry.label}
                    // Le filtre au-dessus a déjà retiré « accueil » : la clé
                    // restante nomme toujours un module du catalogue.
                    tint={moduleMap[entry.key as ModuleKey].tint}
                    emoji={moduleMap[entry.key as ModuleKey].emoji}
                    to={entry.to}
                    onClick={() => onOpenChange(false)}
                    active={pathname === entry.to}
                    className="min-h-[92px] p-3"
                  />
                </li>
              ))}
            </ul>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
