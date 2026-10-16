import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import { fromProfileColumns } from '@/modules/parametres/lib/push';
import { useMessagesFeed, useMessagesRealtime } from '@/modules/messages/hooks/use-messages';
import { useCercleFeed } from '@/modules/cercle/hooks/use-cercle';
import { useRoutines } from '@/modules/routines/hooks/use-routines';
import { listTaskAssignees } from '@/modules/taches/api';
import { toTask } from '@/modules/taches/types';
import type { EventRow, ProfileRow, TaskRow } from '@/types';
import type { IconName } from '@/components/shared/icon';

/** Familles d'éléments du centre (l'Ardoise en est exclue par décision produit). */
export type NotificationKind = 'message' | 'cercle' | 'tache' | 'evenement' | 'routine';

export interface NotificationItem {
  /** Stable par objet source : `message:<conversationId>`, `cercle:<postId>`, … */
  id: string;
  kind: NotificationKind;
  /** Identifiant de l'objet source (conversation, publication, …). */
  ref: string;
  title: string;
  detail: string | null;
  /** ISO de tri et d'affichage relatif. */
  at: string;
  href: string;
  /** Faux pour les éléments calculés (tâche, événement, routine) : ils se
   * résorbent d'eux-mêmes une fois traités, sans état de lecture. */
  markable: boolean;
  /** Faux pour les lus récents (onglet « Toutes ») : ni pastille, ni filtre
   * « Non lues ». Les rappels calculés non masqués restent `true`. */
  unread: boolean;
}

export interface NotificationsSummary {
  items: NotificationItem[];
  /** Lus récents (messages, Cercle), sans pastille : visibles dans l'onglet
   * « Toutes » uniquement. */
  recentRead: NotificationItem[];
  /** Badge de la cloche : non lus + restes à faire. */
  total: number;
  messagesUnread: number;
  cercleUnread: number;
  isLoading: boolean;
  markAllRead: () => void;
  markItem: (item: NotificationItem) => void;
  /** Retire un élément du centre : marquage lu (marquable) ou masquage
   * jusqu'à demain (rappel calculé). Ne supprime jamais la donnée source. */
  dismissItem: (item: NotificationItem) => void;
  /** Vide le centre : lus partout + rappels masqués jusqu'à demain. */
  clearAll: () => void;
}

const KIND_META: Record<NotificationKind, { label: string; icon: IconName; href: string }> = {
  message: { label: 'Message', icon: 'message', href: '/messages' },
  cercle: { label: 'Cercle', icon: 'people', href: '/cercle' },
  tache: { label: 'Tâche', icon: 'checkCircle', href: '/taches' },
  evenement: { label: 'Événement', icon: 'calendar', href: '/calendrier' },
  routine: { label: 'Routine', icon: 'refresh', href: '/routines' },
};

export { KIND_META };

/** Masquage des rappels calculés (« effacer ») : ni table, ni serveur, un
 * simple sursis local `{ id: échéance ISO }`. Expiré = réaffiché. */
const MASKED_STORAGE_KEY = 'eo-notifications-masquees-v1';
/** Lus récents affichés dans l'onglet « Toutes » (au-delà, c'est l'historique des modules). */
export const RECENT_READ_LIMIT = 5;

function cleanMasked(entries: Record<string, string>, now = new Date().toISOString()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] > now),
  );
}

function loadMasked(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MASKED_STORAGE_KEY);
    if (!raw) return {};
    return cleanMasked(JSON.parse(raw) as Record<string, string>);
  } catch {
    return {};
  }
}

function saveMasked(entries: Record<string, string>) {
  try {
    localStorage.setItem(MASKED_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Stockage indisponible : le masquage ne survit pas au rechargement.
  }
}

/** Fin de demain (heure locale) : le rappel masqué revient au plus tard après-demain. */
export function maskExpiryIso(from = new Date()): string {
  const end = new Date(from);
  end.setDate(end.getDate() + 1);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

/**
 * Centre de notifications : unread synchronisés (messages, Cercle) puis
 * restes à faire calculés (tâches en retard/du jour, événements < 24 h,
 * routines du jour). L'ordre est fixe et expliqué : d'abord ce qui déborde
 * ou vient d'arriver, ensuite ce qui attend aujourd'hui.
 *
 * Les interrupteurs du panneau de préférences filtrent les sources ; sans
 * profil chargé, tout est affiché (défauts).
 */
export function useNotifications(): NotificationsSummary {
  const user = useSessionUser();
  const householdId = useHouseholdStore((state) => state.householdId);
  // La cloche vit dans le shell, montée une fois pour toute la session : sans
  // cet abonnement, un message posté depuis un autre appareil n'invalidait
  // jamais ses requêtes — pastille et lignes restaient gelées tant que
  // l'utilisateur n'ouvrait pas la page Messages (seul montage précédent).
  useMessagesRealtime();
  const feed = useMessagesFeed();
  const cercle = useCercleFeed();
  const routinesFeed = useRoutines();
  const tasksResource = useResource<TaskRow>('tasks');
  const eventsResource = useResource<EventRow>('events');
  // Assignés des tâches ouvertes : le centre ne rappelle que les tâches sans
  // assigné (foyer) ou assignées à moi — même règle que le compteur À faire.
  const currentMember = useCurrentMember();
  const openTaskIds = useMemo(
    () => tasksResource.rows.filter((row) => row.trip_id == null && row.status !== 'fait').map((row) => row.id),
    [tasksResource.rows],
  );
  const taskAssigneesQuery = useQuery({
    queryKey: [...queryKeys.tableAll('task_assignees'), openTaskIds],
    enabled: openTaskIds.length > 0,
    queryFn: () => listTaskAssignees(openTaskIds),
  });
  const assigneesByTask = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const entry of taskAssigneesQuery.data ?? []) {
      const list = grouped.get(entry.task_id) ?? [];
      list.push(entry.member_id);
      grouped.set(entry.task_id, list);
    }
    return grouped;
  }, [taskAssigneesQuery.data]);

  const profilesResource = useResource<ProfileRow>('profiles', {
    scoped: false,
    filter: user?.id ? { id: user.id } : { id: '__aucun__' },
    enabled: Boolean(user?.id),
  });

  const preferences = useMemo(() => {
    const [row] = profilesResource.rows;
    if (!row) return null;
    return fromProfileColumns(row);
  }, [profilesResource.rows]);

  const showMessages = preferences?.messageNotifications ?? true;
  const showTasks = preferences?.taskReminders ?? true;
  const showEvents = preferences?.eventReminders ?? true;
  const showRoutines = preferences?.routineReminders ?? true;

  const [masked, setMasked] = useState<Record<string, string>>(loadMasked);
  const nowIso = new Date().toISOString();
  const maskIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const expiry = maskExpiryIso();
    setMasked((previous) => {
      const next = cleanMasked(previous);
      for (const id of ids) next[id] = expiry;
      saveMasked(next);
      return next;
    });
  }, []);
  const unmaskIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setMasked((previous) => {
      if (!ids.some((id) => previous[id] !== undefined)) return previous;
      const next = cleanMasked(previous);
      let changed = false;
      for (const id of ids) {
        if (next[id] !== undefined) {
          delete next[id];
          changed = true;
        }
      }
      if (!changed) return previous;
      saveMasked(next);
      return next;
    });
  }, []);
  const isMasked = (id: string) => masked[id] !== undefined && masked[id] > nowIso;

  /** Identifiants marquables non lus (`message:<conv>`, `cercle:<post>`) :
   * les rappels calculés (tâches, événements, routines) n'y figurent jamais —
   * ils se résorbent d'eux-mêmes et ne sont masqués que par la croix. */
  const unreadKey = useMemo(() => {
    const ids: string[] = [];
    for (const conversation of feed.conversations) {
      if (conversation.unread > 0) ids.push(`message:${conversation.id}`);
    }
    for (const post of cercle.feed) {
      if (post.unreadComments > 0 || post.isNew) ids.push(`cercle:${post.id}`);
    }
    return ids.sort().join('\n');
  }, [cercle.feed, feed.conversations]);

  /** Masquage dérivé des transitions lu/non-lu, pas des appels de marquage :
   * un fil soldé quitte le centre (onglets « Non lues » ET « Toutes ») quel
   * que soit le chemin qui l'a soldé — clic sur la cloche (`markItem`),
   * ouverture du fil (marquage direct au niveau du feed, sans `markItem`),
   * ou « tout marquer comme lu ». Une activité fraîche sur un fil masqué
   * (retour à non-lu) le démasque aussitôt : un masque périmé n'avale jamais
   * du non-lu. Même magasin et même horizon « jusqu'à demain » que la croix —
   * aucun second mécanisme, aucune date supplémentaire. */
  const previousUnreadKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousUnreadKey.current === null) {
      previousUnreadKey.current = unreadKey;
      return;
    }
    const previous = new Set(previousUnreadKey.current === '' ? [] : previousUnreadKey.current.split('\n'));
    const current = new Set(unreadKey === '' ? [] : unreadKey.split('\n'));
    previousUnreadKey.current = unreadKey;
    const newlyRead = [...previous].filter((id) => !current.has(id));
    const newlyUnread = [...current].filter((id) => !previous.has(id));
    // Dissocier les deux directions : un même rendu peut solder un fil et en
    // réveiller un autre (tout marquer + message entrant entre deux rendus).
    if (newlyRead.length > 0) maskIds(newlyRead);
    if (newlyUnread.length > 0) unmaskIds(newlyUnread);
  }, [maskIds, unmaskIds, unreadKey]);

  const items = useMemo<NotificationItem[]>(() => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const list: NotificationItem[] = [];

    if (showMessages) {
      for (const conversation of feed.conversations) {
        if (conversation.unread === 0 || !conversation.lastMessageAt) continue;
        list.push({
          id: `message:${conversation.id}`,
          ref: conversation.id,
          kind: 'message',
          title: conversation.title,
          detail: conversation.lastMessage,
          at: conversation.lastMessageAt,
          href: KIND_META.message.href,
          markable: true,
          unread: true,
        });
      }
    }

    // Fils inédits compris (UAT phase 9) : un nouveau fil sans commentaire
    // a 0 commentaire non lu mais doit surface comme les autres non-lus.
    // `markPostRead` à l'ouverture éteint `isNew` comme les commentaires.
    for (const post of cercle.feed) {
      if (post.unreadComments === 0 && !post.isNew) continue;
      const latest = [...post.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      list.push({
        id: `cercle:${post.id}`,
        ref: post.id,
        kind: 'cercle',
        title: post.author?.display_name ?? 'Cercle',
        detail: latest ? latest.content : post.text,
        at: latest?.createdAt ?? post.createdAt,
        href: KIND_META.cercle.href,
        markable: true,
        unread: true,
      });
    }

    if (showTasks) {
      // Régime 15-01 (comme le module Tâches et le tableau de bord) : les
      // tâches propres à un voyage vivent dans sa fiche, pas dans les restes.
      // Personnel (comme À faire) : sans assigné, ou assignées à moi.
      const open = tasksResource.rows
        .filter((row) => row.trip_id == null)
        .filter((row) => {
          const assignees = assigneesByTask.get(row.id) ?? [];
          if (assignees.length === 0) return true;
          return currentMember !== null && assignees.includes(currentMember.id);
        })
        .map((row) => toTask(row))
        .filter((task) => task.status !== 'fait' && task.dueDate !== null)
        .sort((a, b) => Number(b.isLate) - Number(a.isLate) || (a.dueDate as string).localeCompare(b.dueDate as string));
      for (const task of open.slice(0, 5)) {
        if (isMasked(`tache:${task.id}`)) continue;
        list.push({
          id: `tache:${task.id}`,
          ref: task.id,
          kind: 'tache',
          title: task.name,
          detail: task.isLate ? `En retard de ${task.lateDays} j` : task.dueLabel,
          at: task.dueDate as string,
          href: KIND_META.tache.href,
          markable: false,
          unread: true,
        });
      }
    }

    if (showEvents && householdId) {
      const upcoming = eventsResource.rows
        .filter((row) => {
          const start = new Date(row.start_at).getTime();
          const end = row.end_at ? new Date(row.end_at).getTime() : start;
          return Number.isFinite(start) && start <= in24h.getTime() && end >= now.getTime();
        })
        .sort((a, b) => a.start_at.localeCompare(b.start_at));
      for (const event of upcoming.slice(0, 5)) {
        if (isMasked(`evenement:${event.id}`)) continue;
        list.push({
          id: `evenement:${event.id}`,
          ref: event.id,
          kind: 'evenement',
          title: event.title,
          detail: event.location,
          at: event.start_at,
          href: KIND_META.evenement.href,
          markable: false,
          unread: true,
        });
      }
    }

    if (showRoutines) {
      const pending = routinesFeed.dueToday.filter((routine) => !routine.isDoneToday).slice(0, 5);
      for (const routine of pending) {
        if (isMasked(`routine:${routine.id}`)) continue;
        list.push({
          id: `routine:${routine.id}`,
          ref: routine.id,
          kind: 'routine',
          title: routine.name,
          detail: routine.isLate ? 'En retard' : routine.frequencyLabel,
          at: new Date().toISOString(),
          href: KIND_META.routine.href,
          markable: false,
          unread: true,
        });
      }
    }

    return list;
  }, [
    // WR-19 : toutes les valeurs que le corps lit. `task_assignees` change sans
    // que `tasks.rows` bouge — sans `assigneesByTask`, la cloche gardait la
    // tâche réassignée alors que le compteur du module Tâches suivait déjà.
    // `currentMember` décide du même filtre (« sans assigné, ou assignées à
    // moi ») : une bascule de membre change aussi la liste.
    assigneesByTask,
    cercle.feed,
    currentMember,
    eventsResource.rows,
    feed.conversations,
    householdId,
    masked,
    routinesFeed.dueToday,
    showEvents,
    showMessages,
    showRoutines,
    showTasks,
    tasksResource.rows,
  ]);

  /** Lus récents : dernières conversations et publications soldées, pour
   * l'onglet « Toutes ». Sans pastille, sans marquage. Les éléments écartés
   * (croix, tout effacer) en sont exclus : écarté = caché jusqu'à demain. */
  const recentRead = useMemo<NotificationItem[]>(() => {
    const read: NotificationItem[] = [];
    if (showMessages) {
      for (const conversation of feed.conversations) {
        if (conversation.unread !== 0 || !conversation.lastMessageAt) continue;
        if (isMasked(`message:${conversation.id}`)) continue;
        read.push({
          id: `message:${conversation.id}`,
          ref: conversation.id,
          kind: 'message',
          title: conversation.title,
          detail: conversation.lastMessage,
          at: conversation.lastMessageAt,
          href: KIND_META.message.href,
          markable: false,
          unread: false,
        });
      }
    }
    for (const post of cercle.feed) {
      if (post.unreadComments !== 0 || post.comments.length === 0) continue;
      if (isMasked(`cercle:${post.id}`)) continue;
      const latest = [...post.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      read.push({
        id: `cercle:${post.id}`,
        ref: post.id,
        kind: 'cercle',
        title: post.author?.display_name ?? 'Cercle',
        detail: latest ? latest.content : null,
        at: latest?.createdAt ?? post.createdAt,
        href: KIND_META.cercle.href,
        markable: false,
        unread: false,
      });
    }
    return read.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_READ_LIMIT);
  }, [cercle.feed, feed.conversations, masked, showMessages]);

  const markItem = (item: NotificationItem) => {
    if (!item.markable) return;
    if (item.kind === 'message') feed.markRead(item.ref);
    else if (item.kind === 'cercle') cercle.markPostRead(item.ref);
  };

  const markAllRead = () => {
    for (const conversation of feed.conversations) {
      if (conversation.unread > 0) feed.markRead(conversation.id);
    }
    for (const post of cercle.feed) {
      if (post.unreadComments > 0 || post.isNew) cercle.markPostRead(post.id);
    }
  };

  const dismissItem = (item: NotificationItem) => {
    // Marquer lu ne suffit pas : sans masquage, l'élément resterait visible
    // dans « Toutes » via les lus récents. Écarté = caché jusqu'à demain.
    if (item.markable) markItem(item);
    maskIds([item.id]);
  };

  const clearAll = () => {
    markAllRead();
    maskIds(items.map((item) => item.id));
  };

  const messagesUnread = feed.unreadTotal;
  const cercleUnread = cercle.unreadTotal;

  return {
    items,
    recentRead,
    total: items.length,
    messagesUnread,
    cercleUnread,
    isLoading:
      feed.isLoading ||
      cercle.isLoading ||
      routinesFeed.isLoading ||
      tasksResource.isLoading ||
      taskAssigneesQuery.isLoading ||
      eventsResource.isLoading,
    markAllRead,
    markItem,
    dismissItem,
    clearAll,
  };
}
