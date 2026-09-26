import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cn, initials } from '@/lib/utils';
import {
  mobileNavModules,
  moduleMap,
  modulePath,
  navLabelOf,
  navModules,
  type ModuleKey,
} from '@/lib/modules';
import { useHouseholdStore } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import { Icon, type IconName } from '@/components/shared/icon';
import { ModuleCatalogueDialog, ModuleCatalogueNav, navItemClass } from '@/components/shared/module-catalogue';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useInstallPrompt } from '@/hooks/use-pwa';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useResource } from '@/lib/data/useResource';
import type { TaskRow } from '@/types';

const homeIcon: IconName = 'home';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [unread, setUnread] = useState(2);
  const householdName = useHouseholdStore((state) => state.householdName);
  const members = useHouseholdStore((state) => state.members);
  const user = useSessionUser();
  const { install, canInstall } = useInstallPrompt();
  const { online, pending, syncing, syncNow } = useOfflineSync();
  const [showOffline, setShowOffline] = useState(true);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const { rows: openTasks } = useResource<TaskRow>('tasks', { filter: { status: 'a_faire' } });
  const openTaskCount = openTasks.length;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.scrollLock = 'false';
    return () => {
      document.body.dataset.scrollLock = 'false';
    };
  }, []);

  const currentKey = (location.pathname.replace(/^\//, '') || 'accueil') as ModuleKey;
  // `parametres` n'appartient pas au catalogue des espaces du foyer : il a son
  // propre libellé de navigation.
  const fallbackLabels: Partial<Record<string, string>> = { parametres: 'Paramètres' };
  const currentLabel = fallbackLabels[currentKey]
    ?? (currentKey === 'accueil' ? 'Maison' : moduleMap[currentKey] ? navLabelOf(moduleMap[currentKey]) : 'Maison');
  const isAdmin = useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role === 'admin');

  return (
    <div className="flex min-h-screen">
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-fg focus:px-4 focus:py-2 focus:text-surface"
      >
        Aller au contenu principal
      </a>
      <aside className="sticky top-0 flex h-screen w-[246px] shrink-0 flex-col gap-7 border-r border-border bg-surface px-4 py-6 max-[1180px]:w-[218px] max-[920px]:w-[76px] max-[920px]:items-center max-[920px]:px-2.5 max-[650px]:hidden">
        <div className="flex items-center gap-2.5 px-2.5 max-[920px]:px-0">
          <div className="relative grid size-[38px] place-items-center overflow-hidden rounded-[13px] bg-fg text-surface">
            <Icon name={homeIcon} />
            <span aria-hidden="true" className="absolute right-[5px] bottom-[5px] size-[17px] rounded-full border-2 border-accent" />
          </div>
          <div className="max-[920px]:hidden">
            <div className="font-display text-base font-extrabold tracking-[-0.02em]">Ensemble &amp; Organisés</div>
            <div className="mt-px text-[11px] text-muted">Votre foyer, en mouvement</div>
          </div>
        </div>

        {/* Zone de défilement : seize catégories ne tiennent pas dans la hauteur
            d'un écran. `w-full` parce que la barre latérale centre ses enfants
            sous 920 px, où les libellés disparaissent. */}
        <div className="min-h-0 w-full flex-1 overflow-y-auto pb-1 scrollbar-slim">
          <p className="section-kicker mx-2.5 mb-2.5 max-[920px]:hidden">Navigation</p>
          <nav aria-label="Navigation principale">
            <ul className="grid list-none gap-1 p-0">
              <li>
                <NavLink to="/accueil" className={navItemClass}>
                  <Icon name={homeIcon} />
                  <span className="max-[920px]:sr-only">Maison</span>
                </NavLink>
              </li>
              {navModules.map((key) => {
                const entry = moduleMap[key];
                return (
                  <li key={key}>
                    <NavLink to={modulePath(key)} className={navItemClass}>
                      <Icon name={entry.icon} />
                      <span className="max-[920px]:sr-only">{navLabelOf(entry)}</span>
                      {key === 'taches' && openTaskCount > 0 ? (
                        <span className="ml-auto text-xs text-muted max-[920px]:hidden" aria-label={`${openTaskCount} tâches ouvertes`}>
                          {openTaskCount}
                        </span>
                      ) : null}
                      {key === 'cercle' ? (
                        <span className="ml-auto text-xs text-muted max-[920px]:hidden" aria-label="2 notifications">
                          2
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ModuleCatalogueNav />
        </div>

        <div>
          <p className="section-kicker mx-2.5 mb-2.5 max-[920px]:hidden">Votre espace</p>
          <div className="mx-0.5 mb-3 rounded-[16px] border border-border bg-bg p-3.5 max-[920px]:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid size-[30px] place-items-center rounded-[10px] bg-accent text-[11px] font-extrabold text-surface">
                {initials(householdName)}
              </span>
              <div>
                <strong className="text-[13px]">{householdName}</strong>
                <div className="mt-0.5 text-[10px] text-muted">
                  {members.length} membre{members.length > 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <p className="mt-2.5 mb-0 text-[11px] text-muted">Tout le monde peut contribuer.</p>
          </div>
          {isAdmin ? (
            <NavLink
              to="/parametres"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 text-muted transition-colors duration-[var(--duration-quick)] hover:text-fg max-[920px]:justify-center max-[920px]:px-0',
                  isActive && 'font-[750] text-accent-strong',
                )
              }
            >
              <Icon name="settings" size="sm" />
              <span className="max-[920px]:sr-only">Préférences</span>
            </NavLink>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="topbar-surface sticky top-0 z-10 flex h-[76px] items-center justify-between gap-5 border-b border-border px-[38px] max-[1180px]:px-[26px] max-[920px]:px-5 max-[650px]:h-16 max-[650px]:px-[15px]">
          <nav aria-label="Fil d’Ariane" className="flex items-center gap-2 text-[13px] text-muted max-[650px]:text-xs">
            <span>Ensemble &amp; Organisés</span>
            <span aria-hidden="true">/</span>
            <strong className="font-[750] text-fg">{currentLabel}</strong>
          </nav>
          <div className="flex items-center gap-2.5">
            {canInstall ? (
              <Button variant="secondary" size="sm" icon="download" className="max-[650px]:hidden" onClick={install}>
                Installer l’app
              </Button>
            ) : null}
            <button
              type="button"
              className="relative grid min-h-11 min-w-11 place-items-center rounded-[13px] border border-border bg-surface text-fg transition-[background,border-color,transform] duration-[var(--duration-quick)] hover:-translate-y-px hover:border-accent hover:bg-accent-faint"
              aria-label={unread > 0 ? `Notifications : ${unread} nouvelles` : 'Notifications'}
              onClick={() => {
                setUnread(0);
                toast('2 nouvelles notifications du Cercle.');
              }}
            >
              <Icon name="message" />
              {unread > 0 ? <span className="absolute top-[9px] right-[9px] size-[7px] rounded-full border-2 border-surface bg-coral" /> : null}
            </button>
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-surface py-1 pr-1 pl-2.5 max-[650px]:pl-1">
              <span className="text-xs text-muted max-[650px]:hidden">{user?.displayName ?? 'Profil'}</span>
              <button
                type="button"
                onClick={() => navigate('/parametres')}
                className="grid size-8 place-items-center rounded-full bg-fg text-[11px] font-extrabold text-surface"
                aria-label="Ouvrir les préférences du foyer"
              >
                {initials(user?.displayName ?? 'Profil')}
              </button>
            </div>
          </div>
        </header>

        <main id="contenu-principal" className="mx-auto w-[min(1480px,100%)] px-[38px] pt-9 pb-16 max-[1180px]:px-[26px] max-[920px]:px-5 max-[920px]:pt-7 max-[650px]:px-[15px] max-[650px]:pt-[23px] max-[650px]:pb-[35px]">
          {!online && showOffline ? (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-amber/40 bg-amber-soft px-4 py-3 text-xs"
            >
              <span className="flex items-center gap-2">
                <Icon name="cloud" size="sm" />
                Vous êtes hors ligne. Les données affichées viennent du cache local.
                {pending > 0 ? ` ${pending} modification(s) en attente de synchronisation.` : ''}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={syncing} onClick={() => void syncNow()}>
                  {syncing ? 'Synchronisation…' : 'Réessayer'}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setShowOffline(false)}>
                  Masquer
                </Button>
              </span>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <nav aria-label="Navigation mobile" className="mobile-nav fixed right-[10px] bottom-[10px] left-[10px] z-20 grid-cols-5 gap-1 rounded-[17px] border border-border bg-surface/92 p-[7px] shadow-[var(--shadow-md)] backdrop-blur-[16px]">
        {mobileNavModules.map((key) => {
          const entry = key === 'accueil' ? { label: 'Maison', icon: homeIcon, short: 'Maison' } : moduleMap[key];
          return (
            <NavLink
              key={key}
              to={modulePath(key)}
              className={({ isActive }) =>
                cn(
                  'grid min-h-[46px] place-items-center gap-px rounded-[11px] text-[9px] font-[750] text-muted',
                  isActive && 'bg-accent-soft text-accent-strong',
                )
              }
            >
              <Icon name={entry.icon} size="sm" />
              {entry.short}
            </NavLink>
          );
        })}
        {/* Sous 650 px, la barre latérale est masquée : sans cette entrée, les
            douze catégories sans accès rapide n'auraient aucun bouton. */}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={catalogueOpen}
          onClick={() => setCatalogueOpen(true)}
          className="grid min-h-[46px] place-items-center gap-px rounded-[11px] text-[9px] font-[750] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
        >
          <Icon name="grid" size="sm" />
          Espaces
        </button>
      </nav>

      <ModuleCatalogueDialog open={catalogueOpen} onOpenChange={setCatalogueOpen} />
    </div>
  );
}
