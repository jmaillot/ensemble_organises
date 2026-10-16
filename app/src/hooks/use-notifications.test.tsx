import { beforeEach, describe, expect, it } from 'vitest';
import { act, configure, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, DEMO_USER_ID } from '@/lib/data/seed';
import { useSessionStore } from '@/stores/session-store';
import { demoUser } from '@/hooks/use-auth';
import { useMessagesFeed } from '@/modules/messages/hooks/use-messages';
import { useCercleFeed } from '@/modules/cercle/hooks/use-cercle';
import { setTaskAssignees } from '@/modules/taches/api';
import { queryKeys } from '@/lib/data/useResource';
import { useNotifications } from './use-notifications';

// Fichier temps réel (émission → invalidation → relecture Dexie) : sur
// machine chargée (suite complète), le délai d'1s des `waitFor` est trop
// court et fait flaker. 8s absorbe les pics sans masquer un vrai blocage.
configure({ asyncUtilTimeout: 8000 });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('centre de notifications', () => {
  // Horloge relative : la graine est déjà datée en instants relatifs, mais ce
  // banc fige explicitement message-4 dans le passé (vieux non-lu soldable) et
  // message-5 dans le futur (postérieur à tout marquage), pour que la
  // répartition soldable / encore-marquable ne dépende pas de l'heure.
  beforeEach(async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter
      .update('messages', 'message-4', { created_at: new Date(Date.now() - 2 * 3600_000).toISOString() } as never)
      .catch(() => undefined);
    await adapter
      .update('messages', 'message-5', { created_at: new Date(Date.now() + 2 * 3600_000).toISOString() } as never)
      .catch(() => undefined);
  });

  it('agrège non lus et restes à faire, puis solde les marquables', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    // Un commentaire posté après l'ouverture du fil devient non lu.
    await data.create('post_comments', {
      post_id: 'post-1',
      household_id: DEMO_HOUSEHOLD_ID,
      author_id: DEMO_MEMBERS.thomas,
      content: 'On y va ?',
      created_at: new Date().toISOString(),
    });
    const stored = (await data.list('post_comments', { post_id: 'post-1' })) as Array<{ content: string }>;
    expect(stored.some((row) => row.content === 'On y va ?')).toBe(true);
    await waitFor(() => expect(new Set(result.current.items.map((item) => item.kind)).has('cercle')).toBe(true));

    const kinds = new Set(result.current.items.map((item) => item.kind));
    expect(kinds.has('message')).toBe(true);
    expect(kinds.has('cercle')).toBe(true);
    expect(kinds.has('tache')).toBe(true);
    // L'Ardoise n'y figure jamais (décision produit).
    expect(kinds.has('ardoise' as never)).toBe(false);

    const before = result.current.total;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      result.current.markAllRead();
    });
    const marks = JSON.parse(localStorage.getItem('ensemble-organises-messages-read') ?? '{}') as Record<string, string>;
    expect(Object.keys(marks).sort()).toEqual(['conversation-1', 'conversation-2', 'conversation-3']);
    // Seule la conversation-3 peut rester marquable : le `beforeEach` recale
    // son dernier message dans le futur, donc « tout marquer » ne le solde pas.
    await waitFor(() => {
      const remaining = result.current.items.filter((item) => item.markable).map((item) => item.id);
      expect(remaining.every((id) => id === 'message:conversation-3')).toBe(true);
    });
    // Les calculés restent (tâches dues), seuls les marquables se soldent.
    expect(result.current.total).toBeLessThan(before);
  });

  it('expose lus récents, masquage et effacement sans suppression', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));

    // Écarter un message non lu le solde ET le cache : il disparaît des deux
    // onglets (ni pastille, ni lu récent). On vise le dernier message le plus
    // ancien (conversation-2) : le `beforeEach` l'a recalé dans le passé, donc
    // il est soldable — là où conversation-3, calée dans le futur, ne l'est pas.
    const unreadMessage = result.current.items
      .filter((item) => item.markable && item.kind === 'message')
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    expect(unreadMessage).toBeDefined();
    await act(async () => {
      result.current.dismissItem(unreadMessage!);
    });
    await waitFor(() => expect(result.current.items.some((item) => item.id === unreadMessage!.id)).toBe(false));
    expect(result.current.recentRead.some((item) => item.id === unreadMessage!.id)).toBe(false);
    const messageMarks = JSON.parse(localStorage.getItem('ensemble-organises-messages-read') ?? '{}');
    expect(messageMarks[unreadMessage!.ref]).toBeDefined();
    expect(Object.keys(JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}'))).toContain(
      unreadMessage!.id,
    );

    // Un commentaire frais rend post-1 non lu de façon déterministe : les
    // commentaires seed précèdent le montage et sont lus par défaut
    // (référence mountAt du fil Cercle).
    await data.create('post_comments', {
      post_id: 'post-1',
      household_id: DEMO_HOUSEHOLD_ID,
      author_id: DEMO_MEMBERS.thomas,
      content: `À solder à ${new Date().toISOString()}`,
      created_at: new Date().toISOString(),
    });
    await waitFor(() => expect(result.current.items.some((item) => item.id === 'cercle:post-1')).toBe(true));

    // Tout marquer comme lu cache les lignes marquables partout : ni pastille,
    // ni lus récents (auto-masquage dérivé des transitions — même magasin et
    // même horizon que la croix). Seule conversation-3 peut survivre : le
    // `beforeEach` recale son message dans le futur, après le marquage.
    await act(async () => {
      result.current.markAllRead();
    });
    for (const id of ['message:conversation-1', 'message:conversation-2', 'cercle:post-1']) {
      await waitFor(() => expect(result.current.items.some((item) => item.id === id)).toBe(false));
      // L'auto-masquage suit dans un rendu ultérieur : attendre sa retombée.
      await waitFor(() => expect(result.current.recentRead.some((item) => item.id === id)).toBe(false));
    }

    // Retirer un rappel calculé le masque (sursis local), sans toucher la donnée.
    const computed = result.current.items.find((item) => !item.markable);
    expect(computed).toBeDefined();
    await act(async () => {
      result.current.dismissItem(computed!);
    });
    const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
    expect(Object.keys(masked)).toContain(computed!.id);
    await waitFor(() => expect(result.current.items.some((item) => item.id === computed!.id)).toBe(false));

    // Tout effacer solde les marquables et masque les rappels restants : plus
    // aucun calculé ne subsiste (les marquables dépendent de l'heure, cf. ci-dessus).
    await act(async () => {
      result.current.clearAll();
    });
    await waitFor(() => expect(result.current.items.some((item) => !item.markable)).toBe(false));
  });

  it('isole le feed messages : marquage direct de conversation-1', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    seedHouseholdStore();
    const { result } = renderHook(() => useMessagesFeed(), { wrapper });

    await waitFor(() => expect(result.current.conversations.length).toBeGreaterThan(0));
    const before = result.current.conversations.find((c) => c.id === 'conversation-1')?.unread ?? -1;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      result.current.markRead('conversation-1');
    });
    await waitFor(() => {
      expect(result.current.conversations.find((c) => c.id === 'conversation-1')?.unread).toBe(0);
    });
  });

  it('fait surface un message posté dans un fil non ouvert (cloche affamée)', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));

    // Base saine : on solde le fil, sans jamais l'ouvrir (aucun useThreadPage,
    // aucun marquage post-envoi). Le fil non ouvert ne doit plus peser.
    const row = result.current.items.find((item) => item.id === 'message:conversation-2');
    expect(row).toBeDefined();
    await act(async () => {
      result.current.markItem(row!);
    });
    await waitFor(() => expect(result.current.items.some((item) => item.id === 'message:conversation-2')).toBe(false));

    // Le second membre poste dans ce fil non ouvert : la cloche doit lever la
    // pastille et la ligne (titre, extrait, lien) sans rechargement.
    const body = `Le pain est pris à ${new Date().toISOString()}`;
    await data.create('messages', {
      conversation_id: 'conversation-2',
      household_id: DEMO_HOUSEHOLD_ID,
      sender_id: DEMO_MEMBERS.thomas,
      content: body,
      created_at: new Date().toISOString(),
    });

    await waitFor(() => {
      const raised = result.current.items.find((item) => item.id === 'message:conversation-2');
      expect(raised).toBeDefined();
      expect(raised?.detail).toBe(body);
      expect(raised?.href).toBe('/messages');
    });
    expect(result.current.messagesUnread).toBeGreaterThan(0);
  });

  it('ouvrir le fil cache sa ligne partout (auto-masquage à la lecture)', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));

    // Lire = cacher : la ligne du fil quitte la cloche ET les lus récents,
    // quel que soit le chemin de marquage (ici via markItem, comme au clic).
    const row = result.current.items.find((item) => item.id === 'message:conversation-1');
    expect(row).toBeDefined();
    await act(async () => {
      result.current.markItem(row!);
    });
    await waitFor(() => expect(result.current.items.some((item) => item.id === 'message:conversation-1')).toBe(false));
    await waitFor(() =>
      expect(result.current.recentRead.some((item) => item.id === 'message:conversation-1')).toBe(false),
    );
    const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
    expect(Object.keys(masked)).toContain('message:conversation-1');
  });

  it('masque les lignes messages quand la préférence est coupée', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    // Sans utilisateur de session, la requête profils est désactivée et les
    // défauts (tout affiché) s'appliquent : on connecte le démo-utilisateur
    // pour que la préférence stockée soit lue.
    useSessionStore.setState({ user: demoUser, status: 'authenticated' });
    try {
      // Avant tout rendu : la requête profils lira la préférence coupée.
      await data.update('profiles', DEMO_USER_ID, { message_notifications_enabled: false });
      const { result } = renderHook(() => useNotifications(), { wrapper });

      // Les rappels calculés subsistent : seule la source messages est coupée.
      await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
      expect(result.current.items.some((item) => item.kind === 'message')).toBe(false);
      expect(result.current.recentRead.some((item) => item.kind === 'message')).toBe(false);
    } finally {
      useSessionStore.setState({ user: null, status: 'guest' });
    }
  });

  it('le marquage au niveau du fil ouvert cache aussi la ligne (sans markItem)', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    // Deux crochets sur le même client : la page Messages marque au niveau du
    // feed (messages-page.tsx), sans passer par markItem — la cloche suit par
    // transition d'état, pas par appel. Session connectée : la marque
    // transite par le même chemin serveur que en production.
    useSessionStore.setState({ user: demoUser, status: 'authenticated' });
    try {
      const { result } = renderHook(() => ({ notifs: useNotifications(), feed: useMessagesFeed() }), { wrapper });

      await waitFor(() =>
        expect(result.current.notifs.items.some((item) => item.id === 'message:conversation-2')).toBe(true),
      );
      await act(async () => {
        result.current.feed.markRead('conversation-2');
      });
      await waitFor(() =>
        expect(result.current.notifs.items.some((item) => item.id === 'message:conversation-2')).toBe(false),
      );
      await waitFor(() =>
        expect(result.current.notifs.recentRead.some((item) => item.id === 'message:conversation-2')).toBe(false),
      );
      const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
      expect(Object.keys(masked)).toContain('message:conversation-2');
    } finally {
      useSessionStore.setState({ user: null, status: 'guest' });
    }
  });

  it('le marquage d’un post au niveau du Cercle cache aussi sa ligne', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    // Session connectée : comme cercle-page.tsx, marquage direct au feed via
    // le même chemin serveur que en production, sans markItem.
    useSessionStore.setState({ user: demoUser, status: 'authenticated' });
    try {
      const { result } = renderHook(() => ({ notifs: useNotifications(), cercle: useCercleFeed() }), { wrapper });

      // Commentaire frais => non-lu déterministe, quelle que soit l'heure.
      await data.create('post_comments', {
        post_id: 'post-1',
        household_id: DEMO_HOUSEHOLD_ID,
        author_id: DEMO_MEMBERS.thomas,
        content: `Lu à l'ouverture à ${new Date().toISOString()}`,
        created_at: new Date().toISOString(),
      });
      await waitFor(() =>
        expect(result.current.notifs.items.some((item) => item.id === 'cercle:post-1')).toBe(true),
      );
      // Comme cercle-page.tsx : marquage direct au feed, sans markItem.
      await act(async () => {
        result.current.cercle.markPostRead('post-1');
      });
      await waitFor(() =>
        expect(result.current.notifs.items.some((item) => item.id === 'cercle:post-1')).toBe(false),
      );
      await waitFor(() =>
        expect(result.current.notifs.recentRead.some((item) => item.id === 'cercle:post-1')).toBe(false),
      );
      const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
      expect(Object.keys(masked)).toContain('cercle:post-1');
    } finally {
      useSessionStore.setState({ user: null, status: 'guest' });
    }
  });

  it('une activité fraîche sur un fil masqué le réaffiche avec pastille', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() =>
      expect(result.current.items.some((item) => item.id === 'message:conversation-2')).toBe(true),
    );
    const row = result.current.items.find((item) => item.id === 'message:conversation-2');
    await act(async () => {
      result.current.markItem(row!);
    });
    await waitFor(() =>
      expect(result.current.items.some((item) => item.id === 'message:conversation-2')).toBe(false),
    );
    await waitFor(() =>
      expect(result.current.recentRead.some((item) => item.id === 'message:conversation-2')).toBe(false),
    );

    // Nouveau message dans le fil masqué : démasquage, pastille, extrait.
    const body = `Le pain est chaud à ${new Date().toISOString()}`;
    await data.create('messages', {
      conversation_id: 'conversation-2',
      household_id: DEMO_HOUSEHOLD_ID,
      sender_id: DEMO_MEMBERS.thomas,
      content: body,
      created_at: new Date().toISOString(),
    });
    await waitFor(() => {
      const raised = result.current.items.find((item) => item.id === 'message:conversation-2');
      expect(raised).toBeDefined();
      expect(raised?.detail).toBe(body);
    });
    expect(result.current.messagesUnread).toBeGreaterThan(0);
    const masked = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
    expect(Object.keys(masked)).not.toContain('message:conversation-2');
  });

  it('un masque expiré réaffiche le rappel (horizon jusqu’à demain)', async () => {
    localStorage.removeItem('ensemble-organises-messages-read');
    localStorage.removeItem('ensemble-organises-cercle-read');
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    const first = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(first.result.current.total).toBeGreaterThan(0));
    const computed = first.result.current.items.find((item) => !item.markable);
    expect(computed).toBeDefined();
    await act(async () => {
      first.result.current.dismissItem(computed!);
    });
    await waitFor(() => expect(first.result.current.items.some((item) => item.id === computed!.id)).toBe(false));
    first.unmount();

    // Le sursis expire : échéance antidatée, le prochain chargement nettoie.
    const stored = JSON.parse(localStorage.getItem('eo-notifications-masquees-v1') ?? '{}');
    stored[computed!.id] = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem('eo-notifications-masquees-v1', JSON.stringify(stored));
    const second = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(second.result.current.items.some((item) => item.id === computed!.id)).toBe(true));
  });
});

describe('centre de notifications — régime voyage (15-01)', () => {
  it('les tâches d’un voyage ne remontent pas dans les restes', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    await data.create('tasks', {
      id: 'task-voyage-notif',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      name: 'Valise du voyage lointain',
      description: null,
      due_date: '2027-04-10',
      priority_order: 99,
      status: 'a_faire',
      folder_id: null,
      created_by: DEMO_MEMBERS.camille,
      created_at: new Date().toISOString(),
    } as never);
    try {
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const titles = result.current.items.map((item) => item.title);
      expect(titles).not.toContain('Valise du voyage lointain');
    } finally {
      await data.remove('tasks', 'task-voyage-notif').catch(() => undefined);
    }
  });
});

describe('centre de notifications — fils inédits (UAT phase 9)', () => {
  it('un nouveau fil sans commentaire surface avec son texte, puis se solde', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    const body = `Fil inédit à ${new Date().toISOString()}`;
    const created = (await data.create('posts', {
      household_id: DEMO_HOUSEHOLD_ID,
      author_id: DEMO_MEMBERS.thomas,
      text: body,
      created_at: new Date().toISOString(),
    } as never)) as unknown as { id: string };
    try {
      await waitFor(() => expect(result.current.items.some((item) => item.id === `cercle:${created.id}`)).toBe(true));
      const row = result.current.items.find((item) => item.id === `cercle:${created.id}`);
      expect(row?.detail).toBe(body);
      await act(async () => {
        result.current.markItem(row!);
      });
      await waitFor(() => expect(result.current.items.some((item) => item.id === `cercle:${created.id}`)).toBe(false));
    } finally {
      await data.remove('posts', created.id).catch(() => undefined);
    }
  });
});

/**
 * WR-19 : `items` lit `assigneesByTask` et `currentMember` mais ne déclarait que
 * `tasksResource.rows`. Réassigner une tâche change `task_assignees` sans
 * toucher `tasks.rows` : la cloche ne se recalculait donc jamais, alors que le
 * compteur « à faire » du module Tâches, lui, suivait — deux nombres qui se
 * contredisaient pour la même donnée.
 *
 * Session **connectée** requise pour que ce test puisse échouer. Sans elle, la
 * lecture des marques de lecture (`notification_reads`) est désactivée et son
 * `rows` vaut un `[]` neuf à chaque rendu (`useResource` rend `query.data ?? []`) ;
 * les feeds messages et Cercle qui en dérivent changent alors d'identité à
 * **chaque** rendu, le memo `items` se recalcule pour cette raison étrangère, et
 * la dépendance manquante ne se voit plus. Ici les feeds se stabilisent, le rendu
 * qui voit `assigneesByTask` changer ne change **que** lui, et le memo ne peut se
 * recalculer que si cette valeur est déclarée — sans le correctif, les trois
 * assertions ci-dessous expirent.
 */
describe('centre de notifications — réassignation (WR-19)', () => {
  it('retire de la cloche une tâche réassignée, et le compteur décroît d’autant', async () => {
    localStorage.removeItem('eo-notifications-masquees-v1');
    seedHouseholdStore();
    useSessionStore.setState({ user: demoUser, status: 'authenticated' });
    try {
      const queryClient = createTestQueryClient();
      const ownWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      );
      const { result } = renderHook(() => useNotifications(), { wrapper: ownWrapper });

      // task-1 est assignée à Camille, le membre courant : elle est dans la cloche.
      await waitFor(() => expect(result.current.items.some((item) => item.id === 'tache:task-1')).toBe(true));
      const totalBefore = result.current.total;
      const tasksBefore = result.current.items.filter((item) => item.kind === 'tache').length;

      // Réassignation réelle (même chemin que le module Tâches) : la table
      // `task_assignees` change, la ligne `tasks` reste identique.
      await setTaskAssignees('task-1', [DEMO_MEMBERS.thomas]);
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.tableAll('task_assignees') });
      });

      // Elle quitte la cloche, et le compteur de la barre décroît du même pas :
      // les trois assertions lisent le MÊME rendu.
      await waitFor(() => {
        expect(result.current.items.some((item) => item.id === 'tache:task-1')).toBe(false);
        expect(result.current.total).toBe(totalBefore - 1);
        expect(result.current.items.filter((item) => item.kind === 'tache').length).toBe(tasksBefore - 1);
      });
    } finally {
      useSessionStore.setState({ user: null, status: 'guest' });
    }
    // Budget du test au-dessus du `asyncUtilTimeout` (8 s) du fichier : sans le
    // correctif, l'échec doit dire quelle assertion n'a pas tenu, pas être coupé
    // par le délai global de Vitest (5 s) — un délai qui tombe ne dit rien.
  }, 12_000);
});

describe('centre de notifications — restes personnels', () => {
  it('ne rappelle que les tâches sans assigné ou assignées à moi', async () => {
    seedHouseholdStore();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    const taches = result.current.items.filter((item) => item.kind === 'tache').map((item) => item.title);
    // Camille connectée : task-1 à elle ; task-2/task-4 à Thomas (exclues).
    expect(taches).toContain('Valider les rendez-vous du carnet');
    expect(taches).not.toContain('Ajouter le lait d’agne');
    expect(taches).not.toContain('Choisir le menu du week-end');
  });
});
