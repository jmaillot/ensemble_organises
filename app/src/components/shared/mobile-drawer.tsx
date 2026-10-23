import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { cn, initials } from '@/lib/utils';
import { isChildHiddenModule, isModuleDisabled, moduleMap, modulePath, type ModuleKey } from '@/lib/modules';
import { useIsMobileLayout } from '@/hooks/use-mobile-layout';
import { signOut } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Icon, type IconName } from './icon';
import { memberTagClass } from './member-avatar';
import { Input } from '@/components/ui/input';
import { AppTile } from './app-tile';
import { useCurrentMember, useDisabledModules, useHouseholdStore } from '@/stores/household-store';

type DrawerKey = ModuleKey | 'accueil';

export interface DrawerEntry {
  key: DrawerKey;
  label: string;
  icon: IconName;
  to: string;
}

function entryFor(key: DrawerKey): DrawerEntry {
  if (key === 'accueil') return { key, label: 'Maison', icon: 'home', to: '/accueil' };
  const entry = moduleMap[key];
  return { key, label: entry.short, icon: entry.icon, to: modulePath(key) };
}

/**
 * Regroupement historique des espaces (OD `df6d3917`). Le tiroir affiche une
 * liste plate — aucun regroupement imposé — mais l'invariant de couverture
 * (chaque espace du catalogue + la maison) reste branché dessus.
 */
export const MOBILE_DRAWER_GROUPS: Array<{ title: string; keys: DrawerKey[] }> = [
  { title: 'Au quotidien', keys: ['accueil', 'taches', 'calendrier', 'courses', 'routines', 'notes', 'frigo', 'menu'] },
  { title: 'Le foyer', keys: ['ardoise', 'cadeaux', 'anniversaires', 'contacts', 'cercle', 'messages', 'documents'] },
  { title: 'Pratique', keys: ['prestataires', 'fidelite', 'adresses', 'voyages', 'animaux', 'recettes'] },
];

/**
 * Entrées visibles pour le rôle courant (phase 14, D-05) et pour le foyer
 * (menu des applications, 0140) : le rôle `enfant` ne voit ni les 5 modules
 * hors périmètre, ni un intitulé de groupe vidé de son contenu ; le foyer
 * éteint ses propres espaces, pour tous ses membres. Le tiroir rend
 * aujourd'hui une liste plate (aucun intitulé affiché), mais le filtrage se
 * fait au niveau des groupes pour qu'un regroupement futur n'y réexpose
 * jamais un espace masqué.
 */
export function useVisibleDrawerEntries(): DrawerEntry[] {
  const isChild = useCurrentMember()?.role === 'enfant';
  const disabledModules = useDisabledModules();
  return useMemo(
    () =>
      MOBILE_DRAWER_GROUPS.flatMap((group) =>
        group.keys
          .filter((key) => {
            if (key === 'accueil') return true;
            if (isChild && isChildHiddenModule(key)) return false;
            return !isModuleDisabled(key, disabledModules);
          })
          .map(entryFor),
      ),
    [isChild, disabledModules],
  );
}

/** `id` stable du tiroir, visé par `aria-controls` du hamburger. */
export const MOBILE_DRAWER_ID = 'tiroir-mobile';

/** Normalisation insensible aux accents pour la recherche (« taches » → « Tâches »). */
function normalizeQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdName: string;
  memberCount: number;
  isAdmin: boolean;
}

/**
 * Tiroir latéral mobile (≤650px) : l'unique menu des espaces du foyer.
 * Radix fournit l'overlay, Échap, le piège de focus et `aria-modal` ; le
 * balayage vers la gauche et le verrou de scroll sont gérés ici.
 */
export function MobileDrawer({ open, onOpenChange, householdName, memberCount, isAdmin }: MobileDrawerProps) {
  const householdColor = useHouseholdStore((state) => state.householdColor);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Le tiroir n'existe que sous 651px : un redimensionnement au-delà le
  // referme, sinon le piège de focus et le verrou de scroll survivent
  // invisibles.
  const isMobileLayout = useIsMobileLayout();

  // Une navigation referme le tiroir (filet de sécurité en plus du onClick).
  useEffect(() => {
    onOpenChange(false);
    // `onOpenChange` est omis volontairement : le parent recrée ce rappel à
    // chaque rendu, donc l'inclure rejouerait la fermeture à chaque rendu au
    // lieu de ne la déclencher qu'au changement de route.
  }, [pathname]);

  useEffect(() => {
    if (!isMobileLayout) onOpenChange(false);
    // `onOpenChange` est omis pour la même raison que l'effet précédent : son
    // identité change à chaque rendu du parent, l'inclure rejouerait la
    // fermeture à chaque rendu plutôt qu'au seul passage en vue étroite.
  }, [isMobileLayout]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSigningOut(false);
    if (typeof document !== 'undefined') document.body.dataset.scrollLock = 'true';
    return () => {
      if (typeof document !== 'undefined') document.body.dataset.scrollLock = 'false';
    };
  }, [open]);

  const normalized = normalizeQuery(query);
  const visibleEntries = useVisibleDrawerEntries();
  const filtered = normalized
    ? visibleEntries.filter((entry) => normalizeQuery(entry.label).includes(normalized))
    : null;

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onOpenChange(false);
      navigate('/connexion', { replace: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Déconnexion impossible.', 'error');
      setSigningOut(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(20%_0.02_240/0.42)] backdrop-blur-[6px] min-[651px]:hidden max-[650px]:z-[80]" />
        <DialogPrimitive.Content
          id={MOBILE_DRAWER_ID}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const touch = event.changedTouches[0];
            touchStart.current = null;
            if (!start || !touch) return;
            const dx = start.x - touch.clientX;
            const dy = start.y - touch.clientY;
            // Balayage franc vers la gauche : un défilement vertical avec
            // dérive horizontale ne doit pas fermer le tiroir.
            if (dx > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onOpenChange(false);
          }}
          className="fixed top-0 bottom-0 left-0 z-50 flex w-[min(320px,84vw)] flex-col gap-4 overflow-hidden border-r border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)] min-[651px]:hidden max-[650px]:z-[80]"
        >
          <DialogPrimitive.Title className="sr-only">Menu des espaces du foyer</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Choisissez un espace pour y naviguer, ou refermez le menu.
          </DialogPrimitive.Description>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <span className="relative grid size-[34px] place-items-center overflow-hidden rounded-[12px] bg-fg text-surface">
                <Icon name="home" size="sm" />
                <span
                  aria-hidden="true"
                  className="absolute right-[5px] bottom-[5px] size-[15px] rounded-full border-2 border-accent"
                />
              </span>
              <strong className="min-w-0 flex-1 truncate font-display text-[15px] tracking-[-0.02em]">
                Ensemble &amp; Organisés
              </strong>
            </span>
            <DialogPrimitive.Close
              className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
              aria-label="Fermer le menu"
            >
              <Icon name="close" size="sm" />
            </DialogPrimitive.Close>
          </div>

          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un espace"
            aria-label="Rechercher un espace"
          />

          {/* Le hamburger affiche les tuiles directement (demande du
              23 octobre 2026) : la grille pastel de melimelo remplace la
              liste textuelle. Seule la grille défile ; le pied (foyer,
              préférences, déconnexion) reste épinglé en bas. Deux colonnes :
              le tiroir fait 320 px, la grille « 3 colonnes » du benchmark
              vaut pour la feuille pleine largeur. */}
          <nav aria-label="Espaces du foyer" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 pb-1">
              {(filtered ?? visibleEntries).map((entry) => (
                <li key={entry.key} className="min-w-0">
                  <AppTile
                    label={entry.label}
                    tint={entry.key === 'accueil' ? 'sage' : moduleMap[entry.key].tint}
                    emoji={entry.key === 'accueil' ? '🏡' : moduleMap[entry.key].emoji}
                    to={entry.to}
                    onClick={() => onOpenChange(false)}
                    active={pathname === entry.to}
                    className="min-h-[96px]"
                  />
                </li>
              ))}
            </ul>
            {filtered && filtered.length === 0 ? (
              <p className="m-0 px-1 py-3 text-xs text-muted">Aucun espace pour « {query.trim()} ».</p>
            ) : null}
          </nav>

          <div className="border-t border-border pt-3">
            <div className="mb-2.5 flex items-center gap-2.5 px-1">
              <span className={`grid size-[30px] shrink-0 place-items-center rounded-[10px] ${memberTagClass(householdColor)} text-[11px] font-extrabold text-surface`}>
                {initials(householdName)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[13px]">{householdName}</strong>
                <span className="block text-[10px] text-muted">
                  {memberCount} membre{memberCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="grid gap-1">
              {isAdmin ? (
                <NavLink
                  to="/parametres"
                  onClick={() => onOpenChange(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-accent-faint hover:text-fg',
                      isActive && 'bg-accent-soft text-accent-strong',
                    )
                  }
                >
                  <Icon name="settings" size="sm" />
                  Préférences
                </NavLink>
              ) : null}
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={signingOut}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-accent-faint hover:text-fg disabled:opacity-55"
              >
                <Icon name="logout" size="sm" />
                {signingOut ? 'Déconnexion…' : 'Déconnexion'}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

