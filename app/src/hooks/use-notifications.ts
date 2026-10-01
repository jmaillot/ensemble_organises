import { useMemo } from 'react';
import { useResource } from '@/lib/data/useResource';
import { useHouseholdStore } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import { fromProfileColumns } from '@/modules/parametres/lib/push';
import { useMessagesFeed } from '@/modules/messages/hooks/use-messages';
import { useCercleFeed } from '@/modules/cercle/hooks/use-cercle';
import { useRoutines } from '@/modules/routines/hooks/use-routines';
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
}

export interface NotificationsSummary {
  items: NotificationItem[];
  /** Badge de la cloche : non lus + restes à faire. */
  total: number;
  messagesUnread: number;
  cercleUnread: number;
  isLoading: boolean;
  markAllRead: () => void;
  markItem: (item: NotificationItem) => void;
}

const KIND_META: Record<NotificationKind, { label: string; icon: IconName; href: string }> = {
  message: { label: 'Message', icon: 'message', href: '/messages' },
  cercle: { label: 'Cercle', icon: 'people', href: '/cercle' },
  tache: { label: 'Tâche', icon: 'checkCircle', href: '/taches' },
  evenement: { label: 'Événement', icon: 'calendar', href: '/calendrier' },
  routine: { label: 'Routine', icon: 'refresh', href: '/routines' },
};

export { KIND_META };

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
  const feed = useMessagesFeed();
  const cercle = useCercleFeed();
  const routinesFeed = useRoutines();
  const tasksResource = useResource<TaskRow>('tasks');
  const eventsResource = useResource<EventRow>('events');
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
        });
      }
    }

    for (const post of cercle.feed) {
      if (post.unreadComments === 0) continue;
      const latest = [...post.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      list.push({
        id: `cercle:${post.id}`,
        ref: post.id,
        kind: 'cercle',
        title: post.author?.display_name ?? 'Cercle',
        detail: latest ? latest.content : null,
        at: latest?.createdAt ?? post.createdAt,
        href: KIND_META.cercle.href,
        markable: true,
      });
    }

    if (showTasks) {
      const open = tasksResource.rows
        .map((row) => toTask(row))
        .filter((task) => task.status !== 'fait' && task.dueDate !== null)
        .sort((a, b) => Number(b.isLate) - Number(a.isLate) || (a.dueDate as string).localeCompare(b.dueDate as string));
      for (const task of open.slice(0, 5)) {
        list.push({
          id: `tache:${task.id}`,
          ref: task.id,
          kind: 'tache',
          title: task.name,
          detail: task.isLate ? `En retard de ${task.lateDays} j` : task.dueLabel,
          at: task.dueDate as string,
          href: KIND_META.tache.href,
          markable: false,
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
        list.push({
          id: `evenement:${event.id}`,
          ref: event.id,
          kind: 'evenement',
          title: event.title,
          detail: event.location,
          at: event.start_at,
          href: KIND_META.evenement.href,
          markable: false,
        });
      }
    }

    if (showRoutines) {
      const pending = routinesFeed.dueToday.filter((routine) => !routine.isDoneToday).slice(0, 5);
      for (const routine of pending) {
        list.push({
          id: `routine:${routine.id}`,
          ref: routine.id,
          kind: 'routine',
          title: routine.name,
          detail: routine.isLate ? 'En retard' : routine.frequencyLabel,
          at: new Date().toISOString(),
          href: KIND_META.routine.href,
          markable: false,
        });
      }
    }

    return list;
  }, [
    cercle.feed,
    eventsResource.rows,
    feed.conversations,
    householdId,
    routinesFeed.dueToday,
    showEvents,
    showMessages,
    showRoutines,
    showTasks,
    tasksResource.rows,
  ]);

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
      if (post.unreadComments > 0) cercle.markPostRead(post.id);
    }
  };

  const messagesUnread = feed.unreadTotal;
  const cercleUnread = cercle.unreadTotal;

  return {
    items,
    total: items.length,
    messagesUnread,
    cercleUnread,
    isLoading:
      feed.isLoading || cercle.isLoading || routinesFeed.isLoading || tasksResource.isLoading || eventsResource.isLoading,
    markAllRead,
    markItem,
  };
}
