import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { moduleMap } from '@/lib/modules';
import { Icon, type IconName } from './icon';

interface BottomNavItem {
  to: string;
  label: string;
  icon: IconName;
}

/**
 * Barre de navigation basse, réservée au tactile.
 *
 * Melimelo garde la maison et l'action principale à portée de pouce ; ici,
 * quatre espaces du quotidien plus « Plus » qui ouvre le tiroir complet. Les
 * entrées masquées au rôle `enfant` ne figurent pas dans cette barre : elle ne
 * référence que des espaces que l'enfant peut ouvrir.
 */
const items: BottomNavItem[] = [
  { to: '/accueil', label: 'Maison', icon: 'home' },
  { to: '/courses', label: 'Courses', icon: moduleMap.courses.icon },
  { to: '/calendrier', label: 'Agenda', icon: moduleMap.calendrier.icon },
  { to: '/taches', label: 'Tâches', icon: moduleMap.taches.icon },
];

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      aria-label="Navigation rapide"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur-xl min-[651px]:hidden"
    >
      <ul className="m-0 grid list-none grid-cols-5 gap-0.5 p-0">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[16px] px-1 text-[10.5px] font-[650] text-muted transition-colors',
                  isActive && 'bg-accent-soft text-accent-strong',
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
            className="flex min-h-[54px] w-full flex-col items-center justify-center gap-1 rounded-[16px] px-1 text-[10.5px] font-[650] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
          >
            <Icon name="grid" size="sm" />
            Plus
          </button>
        </li>
      </ul>
    </nav>
  );
}
