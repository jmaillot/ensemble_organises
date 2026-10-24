import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { isModuleDisabled, moduleMap, type ModuleKey } from '@/lib/modules';
import { useDisabledModules } from '@/stores/household-store';
import { Icon, type IconName } from './icon';

interface BottomNavItem {
  to: string;
  key: ModuleKey;
  label: string;
  icon: IconName;
}

/**
 * Barre de navigation basse, réservée au tactile.
 *
 * Melimelo garde la maison et l'action principale à portée de pouce ; ici,
 * quatre espaces du quotidien plus « Plus » qui ouvre le tiroir complet —
 * depuis le 24/10/2026, c'est le SEUL contrôleur du menu mobile : le
 * hamburger du haut a été retiré (doublon) et la feuille « Tous les
 * espaces » avec lui. Les entrées masquées au rôle `enfant` ne
 * figurent pas dans cette barre : elle ne référence que des espaces que
 * l'enfant peut ouvrir.
 */
const items: BottomNavItem[] = [
  { to: '/accueil', key: 'accueil', label: 'Maison', icon: 'home' },
  { to: '/courses', key: 'courses', label: 'Courses', icon: moduleMap.courses.icon },
  { to: '/calendrier', key: 'calendrier', label: 'Agenda', icon: moduleMap.calendrier.icon },
  { to: '/taches', key: 'taches', label: 'Tâches', icon: moduleMap.taches.icon },
];

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const disabledModules = useDisabledModules();
  // Menu des applications (0140) : un espace éteint par le foyer sort de la
  // barre, et la grille recale son nombre de colonnes — une cellule vide
  // serait un emplacement mort sous le pouce. « Maison » n'est jamais dans
  // `disabled_modules` (elle ne porte que des clés du catalogue).
  const visibleItems = items.filter((item) => !isModuleDisabled(item.key, disabledModules));
  return (
    <nav
      aria-label="Navigation rapide"
      className="fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 rounded-[26px] border border-border/60 bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] px-1.5 py-1 shadow-[var(--shadow-lg)] backdrop-blur-xl min-[651px]:hidden"
    >
      <ul
        className="m-0 grid list-none gap-0.5 p-0"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length + 1}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[11px] font-[650] text-muted transition-colors',
                  isActive && 'bg-accent text-surface',
                )
              }
            >
              <Icon name={item.icon} size="sm" />
              {item.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[11px] font-[650] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
          >
            <Icon name="grid" size="sm" />
            Plus
          </button>
        </li>
      </ul>
    </nav>
  );
}
