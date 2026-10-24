import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cn, initials } from '@/lib/utils';
import {
  moduleMap,
  modulePath,
  filterModuleKeys,
  isModuleDisabled,
  modules,
  type ModuleKey,
} from '@/lib/modules';
import { useCurrentMember, useDisabledModules, useHouseholdStore } from '@/stores/household-store';
import { memberTagClass } from '@/components/shared/member-avatar';
import { useSessionUser } from '@/hooks/use-auth';
import { Icon, type IconName } from '@/components/shared/icon';
import { MobileDrawer, MOBILE_DRAWER_ID } from '@/components/shared/mobile-drawer';
import { MobileBottomNav } from '@/components/shared/mobile-bottom-nav';
import { AllSpacesSheet } from '@/components/shared/all-spaces-sheet';
import { ModuleDisabled } from '@/components/shared/module-disabled';
import { CommandPalette } from '@/components/shared/command-palette';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useInstallPrompt } from '@/hooks/use-pwa';
import { useIsMobileLayout } from '@/hooks/use-mobile-layout';
import { preloadRouteChunks } from './route-preload';
import { useNotifications, type NotificationItem } from '@/hooks/use-notifications';
import { NotificationsDialog } from '@/components/shared/notifications-dialog';
import { useResource } from '@/lib/data/useResource';
import { useOpenTaskAssignees, selectTasksForMember } from '@/hooks/use-open-task-assignees';
import { syncRotatedPushSubscription } from '@/modules/parametres/lib/push';
import type { TaskRow } from '@/types';

const homeIcon: IconName = 'home';

/**
 * Traitement d'un lien de navigation de la barre latérale : la pilule
 * active pleine, l'inactive bordée — la même forme sur TOUTE la liste,
 * désormais unique.
 */
const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-[13.5px] text-muted transition-colors duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:bg-accent-faint hover:text-fg max-[920px]:justify-center max-[920px]:px-0',
    isActive && 'bg-accent font-[650] text-surface hover:bg-accent-strong hover:text-surface',
  );

/**
 * Libellé du raccourci, selon la plateforme. `platform` n'est pas normalisé
 * (`MacIntel`, `iPad`…), et le test jsdom rend une chaîne vide : il obtient
 * donc « Ctrl K », la forme juste sur la machine qui l'exécute.
 */
const searchShortcutLabel =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

/**
 * Garde « espace éteint » (menu des applications, migration 0140) : un accès
 * direct à l'URL d'un espace désactivé par le foyer rend un avis sobre —
 * jamais une 404 mensongère, jamais une redirection silencieuse (même
 * philosophie que `RequireGrownUp`, phase 14 D-06). Posée ICI, sur la sortie
 * du shell, plutôt qu'autour de chaque route : une seule couture couvre les
 * 17 espaces et leurs sous-routes (`/courses/catalogue`, `/recettes/:id`…),
 * dont le premier segment du chemin nomme toujours le module.
 *
 * `accueil` et `parametres` ne figurent pas dans `moduleMap` : ils ne sont
 * jamais gated — on doit toujours pouvoir rejoindre le tableau de bord et
 * réactiver l'espace depuis les paramètres.
 */
function ModuleGate({ disabledModules, isAdmin }: { disabledModules: string[]; isAdmin: boolean }) {
  const location = useLocation();
  const key = (location.pathname.replace(/^\//, '').split('/')[0] || 'accueil') as ModuleKey;
  const entry = moduleMap[key];
  if (!entry || !isModuleDisabled(key, disabledModules)) return <Outlet />;
  return <ModuleDisabled label={entry.label} isAdmin={isAdmin} />;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const householdName = useHouseholdStore((state) => state.householdName);
  const householdColor = useHouseholdStore((state) => state.householdColor);
  const members = useHouseholdStore((state) => state.members);
  const user = useSessionUser();
  const { install, canInstall } = useInstallPrompt();
  const isMobileLayout = useIsMobileLayout();
  // Navigation fiable (D-09) : précharge les morceaux de routes en
  // arrière-plan, à l'idle et en ligne seulement. Monté une fois, échec avalé
  // (T-09-07) : le préchargement ne doit jamais casser le shell.
  useEffect(() => {
    try {
      preloadRouteChunks();
    } catch {
      // Préchargement indisponible : la garde par route couvre l'échec.
    }
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [spacesSheetOpen, setSpacesSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifications = useNotifications();
  const unread = notifications.total;
  const { rows: openTasks } = useResource<TaskRow>('tasks', {
    filter: { status: 'a_faire' },
    // Régime 15-01 : le badge « tâches ouvertes » ne compte que le module
    // Tâches — les lignes de voyage vivent dans leur fiche.
    select: (rows) => rows.filter((row) => (row as unknown as TaskRow).trip_id == null),
    // `selectKey` stable (D-08) : le `select` ci-dessus change le résultat, donc
    // il doit entrer dans la clé de cache — sous une forme stable, jamais la
    // fonction elle-même (une flèche en ligne bouclerait le rechargement).
    selectKey: 'tasks-open',
  });
  // Compteur personnel (comme la page Tâches) : ouvertes sans assigné (foyer)
  // ou assignées à moi — jamais celles des autres membres. La règle et sa
  // lecture vivent dans une seule couture (`use-open-task-assignees`), la même
  // que la cloche : un préfixe de clé maison (`['app-shell', …]`) n'était atteint
  // par aucune invalidation, et le badge restait faux après une réassignation
  // (D-08). La clé de la couture vit sous `['all', 'task_assignees', …]`.
  const currentMember = useCurrentMember();
  const openTaskIds = useMemo(() => openTasks.map((row) => row.id), [openTasks]);
  const openTaskAssignees = useOpenTaskAssignees(openTaskIds);
  // `null` = « on ne sait pas » : lecture jamais aboutie, ou membre courant
  // inconnu. Un chiffre inconnu ne s'affiche pas — il ne s'affiche pas faux.
  const openTaskCount =
    selectTasksForMember(openTasks, openTaskAssignees, currentMember?.id ?? null)?.length ?? null;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.scrollLock = 'false';
    return () => {
      document.body.dataset.scrollLock = 'false';
    };
  }, []);

  // Ctrl/Cmd + K ouvre la palette partout dans l'application. L'écouteur est
  // posé une fois sur `window` : la palette n'est pas un composant de route, et
  // un raccourci qui ne marcherait que sur l'accueil ne serait pas un raccourci.
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setSearchOpen((value) => !value);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    // App ouverte : le service worker relaie les push en `postMessage` pour
    // afficher une popup in-app (toast) plutôt que de ne compter que sur la
    // notification système. Format émis par `sw.ts`.
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Référence capturée : le démontage ne doit pas relire `navigator`.
    const container = navigator.serviceWorker;
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; title?: unknown; body?: unknown } | null;
      if (!data) return;
      // Deux messages distincts, deux comportements distincts (D-04) : les
      // fusionner ferait d'une rotation un rappel, ou l'inverse.
      if (data.type === 'EO_PUSH') {
        const title = typeof data.title === 'string' ? data.title : '';
        const body = typeof data.body === 'string' ? data.body : '';
        toast([title, body].filter(Boolean).join(' — ') || 'Nouveau rappel du foyer.');
        return;
      }
      if (data.type === 'EO_PUSH_ROTATED') {
        // Le worker a laissé un reçu durable ; c'est ici que l'abonnement est
        // réellement enregistré auprès du serveur. Un échec est signalé à
        // l'écran pendant que l'onglet est ouvert — le reçu, lui, survit à sa
        // fermeture.
        void syncRotatedPushSubscription().then((result) => {
          if (result === 'failed') {
            toast('Abonnement aux notifications expiré : réactivez-les dans les préférences.');
          }
        });
      }
    };
    container.addEventListener('message', onServiceWorkerMessage);
    return () => container.removeEventListener('message', onServiceWorkerMessage);
  }, [toast]);

  // Le fil d'Ariane nomme l'ESPACE, pas la page : une sous-route
  // (`/courses/aide`, `/courses/catalogue`, `/recettes/:id`) reste dans son
  // module. Le chemin ENTIER était cherché dans le catalogue, et une
  // sous-route retombait sur « Maison » — le lecteur perdait le module
  // sous ses yeux.
  const currentKey = (location.pathname.replace(/^\//, '').split('/')[0] || 'accueil') as ModuleKey;
  // `parametres` n'appartient pas au catalogue des espaces du foyer : il a son
  // propre libellé de navigation.
  const fallbackLabels: Partial<Record<string, string>> = { parametres: 'Paramètres' };
  const currentLabel = fallbackLabels[currentKey]
    ?? (currentKey === 'accueil' ? 'Maison' : moduleMap[currentKey] ? moduleMap[currentKey].label : 'Maison');
  const isAdmin = useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role === 'admin');
  // Rôle `enfant` (phase 14, D-05) : les accès rapides épinglés suivent le
  // même masquage que le catalogue (aucun des 5 n'y figure aujourd'hui, mais
  // un ajout futur ne doit pas les réexposer par mégarde). Menu des
  // applications (0140) : les espaces éteints par le foyer sortent aussi de
  // la navigation — présentation seulement, la RLS reste la frontière.
  const isChild = useHouseholdStore((state) => state.members.find((member) => member.id === state.currentMemberId)?.role === 'enfant');
  const disabledModules = useDisabledModules();
  // Une seule liste (retour du 23 octobre : « le menu de navigation sur pc
  // soit unique ») : Maison puis TOUS les espaces du catalogue, dans l'ordre
  // du catalogue, sans second groupe « Tous les espaces » qui répétait
  // Calendrier, Tâches et Cercle et doublait les états actifs.
  const visibleNavModules = filterModuleKeys(modules.map((entry) => entry.key), { isChild, disabledModules });

  return (
    <div className="flex min-h-screen">
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-fg focus:px-4 focus:py-2 focus:text-surface"
      >
        Aller au contenu principal
      </a>
      <aside className="sticky top-0 flex h-screen w-[246px] shrink-0 flex-col gap-7 border-r border-border/70 bg-bg px-4 py-6 max-[1180px]:w-[218px] max-[920px]:w-[76px] max-[920px]:items-center max-[920px]:px-2.5 max-[650px]:hidden">
        <div className="flex items-center gap-2.5 px-2.5 max-[920px]:px-0">
          <div className="relative grid size-[40px] place-items-center overflow-hidden rounded-full bg-accent text-surface">
            <Icon name={homeIcon} />
            <span aria-hidden="true" className="absolute right-[4px] bottom-[4px] size-[16px] rounded-full border-2 border-bg bg-transparent" />
          </div>
          <div className="max-[920px]:hidden">
            <div className="font-display text-[15px] font-semibold tracking-[-0.02em]">Ensemble &amp; Organisés</div>
            <div className="mt-px text-[11px] text-muted">Votre foyer, en mouvement</div>
          </div>
        </div>

        {/* Zone de défilement : vingt catégories ne tiennent pas dans la
            hauteur d'un écran. `w-full` parce que la barre latérale centre
            ses enfants sous 920 px, où les libellés disparaissent. */}
        <div className="min-h-0 w-full flex-1 overflow-y-auto pb-1 scrollbar-slim">
          <nav aria-label="Navigation principale">
            <ul className="grid list-none gap-1 p-0">
              <li>
                <NavLink to="/accueil" className={navItemClass} title="Maison">
                  <Icon name={homeIcon} />
                  <span className="max-[920px]:sr-only">Maison</span>
                </NavLink>
              </li>
              {visibleNavModules.map((key) => {
                const entry = moduleMap[key];
                return (
                  <li key={key}>
                    <NavLink to={modulePath(key)} className={navItemClass} title={entry.label}>
                      <Icon name={entry.icon} />
                      <span className="max-[920px]:sr-only">{entry.label}</span>
                      {key === 'taches' && openTaskCount !== null && openTaskCount > 0 ? (
                        <span className="ml-auto text-xs text-muted max-[920px]:hidden" aria-label={`${openTaskCount} tâches ouvertes`}>
                          {openTaskCount}
                        </span>
                      ) : null}
                      {key === 'cercle' && notifications.cercleUnread > 0 ? (
                        <span className="ml-auto text-xs text-muted max-[920px]:hidden" aria-label={`${notifications.cercleUnread} notifications`}>
                          {notifications.cercleUnread}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* `w-full` : la barre centre ses enfants sous 920 px, et un conteneur
            qui se réduit à son contenu ne donne aucune largeur au lien
            « Préférences » en dessous de la sienne. */}
        <div className="w-full">
          <p className="section-kicker mx-2.5 mb-2.5 max-[920px]:hidden">Votre espace</p>
          <div className="mx-0.5 mb-3 rounded-[22px] border border-border/60 bg-surface p-3.5 shadow-[var(--shadow-sm)] max-[920px]:hidden">
            <div className="flex items-center gap-2.5">
              <span className={`grid size-[34px] place-items-center rounded-full ${memberTagClass(householdColor)} text-[11px] font-extrabold text-surface`}>
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
              title="Préférences"
              className={({ isActive }) =>
                cn(
                  // `min-h-11 w-full` comme tous les autres liens de la barre :
                  // sous 920 px le libellé passe en `sr-only`, et sans ces deux
                  // règles ce lien se réduisait à son icône — 15×15 px, sous les
                  // 44 px qu'AGENTS.md §6 exige. C'était le seul lien du pied à
                  // ne pas les porter, et le seul dont le conteneur ne prenait
                  // pas toute la largeur : il était donc invisible au balayage
                  // « surface nulle » et introuvable à la revue.
                  'flex min-h-11 w-full items-center gap-2.5 px-2.5 text-muted transition-colors duration-[var(--duration-quick)] hover:text-fg max-[920px]:justify-center max-[920px]:px-0',
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
        <header className="topbar-surface sticky top-0 z-10 flex h-[76px] items-center justify-between gap-5 border-b border-border px-[38px] max-[1180px]:px-[26px] max-[920px]:px-5 max-[650px]:h-14 max-[650px]:gap-2.5 max-[650px]:px-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            aria-controls={MOBILE_DRAWER_ID}
            aria-label="Ouvrir le menu"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-border/70 bg-surface text-fg transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint min-[651px]:hidden"
          >
            <Icon name="menu" />
          </button>
          {/* Un seul contrôleur ouvre le tiroir : le hamburger. La pastille-foyer
              était un second bouton vers le même MobileDrawer (critique du
              24/10/2026 : deux affordances jumelles, l'une pilule et l'autre
              icône, pour une même action) ; elle navigue maintenant vers le
              point du jour — son nom porte le foyer, sa fonction est d'y
              ramener, pas de rouvrir le catalogue. */}
          <Link
            to="/accueil"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-border/70 bg-surface py-1 pr-3.5 pl-1.5 text-[13px] font-[650] transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint min-[651px]:hidden"
          >
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${memberTagClass(householdColor)} text-[11px] font-extrabold text-surface`}>
              {initials(householdName)}
            </span>
            <span className="truncate">{householdName}</span>
          </Link>
          <nav aria-label="Fil d’Ariane" className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted max-[650px]:hidden">
            <Link to="/accueil" className="transition-colors hover:text-fg">
              Ensemble &amp; Organisés
            </Link>
            <span aria-hidden="true">/</span>
            <strong className="font-[750] text-fg">{currentLabel}</strong>
          </nav>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={`Rechercher (${searchShortcutLabel})`}
              aria-keyshortcuts="Control+K Meta+K"
              className="flex min-h-11 items-center gap-2 rounded-full border border-border/70 bg-surface px-3 text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg max-[650px]:w-11 max-[650px]:justify-center max-[650px]:px-0"
            >
              <Icon name="search" size="sm" />
              <span className="text-[12.5px] font-[650] max-[650px]:sr-only">Rechercher</span>
              <kbd className="hidden rounded-[5px] border border-border bg-surface-2 px-1 py-px text-[10px] font-[650] min-[1180px]:inline">
                {searchShortcutLabel}
              </kbd>
            </button>
            {canInstall ? (
              <Button variant="secondary" size="sm" icon="download" className="max-[650px]:hidden" onClick={install}>
                Installer l’app
              </Button>
            ) : null}
            <button
              type="button"
              className="relative grid min-h-11 min-w-11 place-items-center rounded-full border border-border/70 bg-surface text-fg transition-[background,border-color,transform] duration-[var(--duration-quick)] hover:-translate-y-px hover:border-accent hover:bg-accent-faint"
              aria-label={unread > 0 ? `Notifications : ${unread} nouvelles` : 'Notifications'}
              onClick={() => setNotificationsOpen(true)}
            >
              <Icon name="message" />
              {unread > 0 ? <span className="absolute top-[9px] right-[9px] size-[7px] rounded-full border-2 border-surface bg-coral" /> : null}
            </button>
            <NotificationsDialog
              open={notificationsOpen}
              onOpenChange={setNotificationsOpen}
              items={notifications.items}
              recentRead={notifications.recentRead}
              total={notifications.total}
              hasMarkable={notifications.items.some((item) => item.markable)}
              onMarkAllRead={notifications.markAllRead}
              onOpenItem={(item: NotificationItem) => {
                notifications.markItem(item);
                setNotificationsOpen(false);
                navigate(item.href);
              }}
              onDismissItem={(item: NotificationItem) => notifications.dismissItem(item)}
              onClearAll={notifications.clearAll}
            />
            <button
              type="button"
              onClick={() => navigate('/parametres')}
              className="flex items-center gap-2.5 rounded-full border border-border bg-surface py-1 pr-1 pl-2.5 max-[650px]:pl-1"
              aria-label="Ouvrir les préférences du foyer"
            >
              <span className="text-xs text-muted max-[650px]:hidden">{user?.displayName?.trim() ? user.displayName : 'Profil'}</span>
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-fg text-[11px] font-extrabold text-surface"
              >
                {initials(user?.displayName?.trim() ? user.displayName : 'Profil')}
              </span>
            </button>
          </div>
        </header>

        <main id="contenu-principal" className="mx-auto w-[min(1480px,100%)] px-[38px] pt-9 pb-16 max-[1180px]:px-[26px] max-[920px]:px-5 max-[920px]:pt-7 max-[650px]:px-3 max-[650px]:pt-[14px] max-[650px]:pb-[calc(92px+env(safe-area-inset-bottom))]">
          <ModuleGate disabledModules={disabledModules} isAdmin={isAdmin} />
        </main>
      </div>

      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        householdName={householdName}
        memberCount={members.length}
        isAdmin={isAdmin}
      />

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      {isMobileLayout ? <MobileBottomNav onMore={() => setSpacesSheetOpen(true)} /> : null}
      <AllSpacesSheet open={spacesSheetOpen} onOpenChange={setSpacesSheetOpen} />
    </div>
  );
}
