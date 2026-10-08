import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import { isUnseen } from '@/lib/notification-reads';
import { useSyncedReads } from '@/lib/notification-reads';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { createConversation, addConversationMembers, createMessage, deleteMessage as removeMessageRow, depositMessageImage, fetchConversationParticipants, fetchConversations, fetchLatestMessages, fetchMessagePage, leaveConversation as leaveConversationRow, removeArchivedConversation as removeArchivedConversationRow, removeConversationCascade, updateMessageContent, MESSAGE_PAGE_SIZE, MAX_MESSAGE_LENGTH, type ConversationDraft, type MessagePage } from '../api';
import type { CompressedImage } from '@/modules/cercle/lib/media';
import { resolveConversationTitle, sortMessages, toMessage, toParticipant, type ConversationSummary, type Message, type ReadMap } from '../types';
import type { ConversationMemberRow, MessageRow } from '@/types';

export const messageKeys = {
  all: ['messages'] as const,
  conversations: (householdId: string | null) => ['messages', 'conversations', householdId] as const,
  participants: ['messages', 'participants'] as const,
  /** Dernier message connu de chaque fil : aperçus, tri et signal de non-lus. */
  previews: (householdId: string | null) => ['messages', 'previews', householdId] as const,
  /** Page chargée d'un fil : une entrée par (fil, taille de fenêtre). */
  thread: (householdId: string | null, conversationId: string | null, limit: number) =>
    ['messages', 'thread', householdId, conversationId, limit] as const,
  /** Préfixe pour toucher toutes les fenêtres mises en cache d'un même fil. */
  threadPrefix: (householdId: string | null, conversationId: string) =>
    ['messages', 'thread', householdId, conversationId] as const,
};

const READ_STORAGE_KEY = 'ensemble-organises-messages-read';

/**
 * Suivi de lecture. Le modèle ne contient pas encore d'horodatage de lecture
 * par message : la référence est conservée localement et sera remplacée par un
 * accusé de lecture serveur (table dédiée ou colonne `read_at`).
 */
export function useReadConversations() {
  const { readMap, markRead } = useSyncedReads('conversation', READ_STORAGE_KEY);
  return { readMap, markRead } as const;
}

export interface MessagesFeed {
  /** Fils actifs (le membre courant y est actif) : triés par activité. */
  conversations: ConversationSummary[];
  /** Fils quittés (pierre tombale) : archives en lecture seule. */
  archivedConversations: ConversationSummary[];
  /** Appartenances ACTIVES déclarées par fil (pierres exclues). */
  memberIdsByConversation: Map<string, string[]>;
  /**
   * Non-lus par fil : signal 1/0 depuis l'aperçu pour les fils fermés (borne
   * inférieure honnête — le compte exact exigerait le fil entier), la page
   * appelle `useThreadPage` pour le compte exact du fil ouvert. Fils actifs
   * seuls : les archives ne comptent plus.
   */
  unreadTotal: number;
  householdId: string | null;
  currentMemberId: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  readMap: ReadMap;
  markRead: (conversationId: string) => void;
  send: (conversationId: string, content: string) => Promise<void>;
  isSending: boolean;
  sendMedia: (conversationId: string, content: string, image: CompressedImage) => Promise<void>;
  createConversation: (draft: Omit<ConversationDraft, 'householdId'>) => Promise<string>;
  addMembers: (conversationId: string, memberIds: string[]) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  leaveConversation: (conversationId: string) => Promise<void>;
  /** Retire un fil quitté de ses archives (sa propre pierre, D-08). */
  removeArchivedConversation: (conversationId: string) => Promise<void>;
  isCreating: boolean;
  isDeleting: boolean;
  isLeaving: boolean;
  isRemovingArchived: boolean;
}

/** Conversations, registre et aperçus du foyer : jamais un fil en entier. */
export function useMessagesFeed(): MessagesFeed {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const members = useMembers();
  const { readMap, markRead } = useReadConversations();

  const conversationsQuery = useQuery({
    queryKey: messageKeys.conversations(householdId),
    enabled: Boolean(householdId),
    queryFn: () => fetchConversations(householdId),
  });
  const participantsQuery = useQuery({
    queryKey: messageKeys.participants,
    queryFn: fetchConversationParticipants,
  });

  const conversationRows = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const participantRows = useMemo(() => participantsQuery.data ?? [], [participantsQuery.data]);

  // Visibilité locale du gate de lecture serveur : un fil sans aucune ligne
  // d'appartenance (ni active, ni tombée) est invisible — en ligne la RLS
  // (`conversations_select`) le masque, en local ce filtre l'imite. Sans
  // lui, un fil retiré de ses archives resurgirait actif en démo.
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of participantRows) {
      if (row.member_id === currentMemberId) ids.add(row.conversation_id);
    }
    return ids;
  }, [currentMemberId, participantRows]);

  const visibleRows = useMemo(
    () => conversationRows.filter((row) => visibleIds.has(row.id)),
    [conversationRows, visibleIds],
  );
  const conversationIds = useMemo(() => visibleRows.map((row) => row.id).sort(), [visibleRows]);

  const previewsQuery = useQuery({
    queryKey: messageKeys.previews(householdId),
    enabled: Boolean(householdId) && conversationIds.length > 0,
    queryFn: () => fetchLatestMessages(householdId, conversationIds),
  });
  const previewRows = useMemo(() => previewsQuery.data ?? [], [previewsQuery.data]);
  const previewByConversation = useMemo(() => {
    const grouped = new Map<string, MessageRow>();
    for (const row of previewRows) grouped.set(row.conversation_id, row);
    return grouped;
  }, [previewRows]);

  // Registre ACTIF seul : les pierres tombales (`left_at`) ne nourrissent ni
  // les effectifs, ni les non-lus, ni les replis d'affichage des restants.
  const memberIdsByConversation = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const row of participantRows) {
      if (row.left_at) continue;
      const existing = grouped.get(row.conversation_id);
      if (existing) existing.push(row.member_id);
      else grouped.set(row.conversation_id, [row.member_id]);
    }
    return grouped;
  }, [participantRows]);

  // Fils quittés par le membre courant : leurs lignes portent sa pierre.
  const archivedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of participantRows) {
      if (row.member_id === currentMemberId && row.left_at) ids.add(row.conversation_id);
    }
    return ids;
  }, [currentMemberId, participantRows]);

  const buildSummaries = useCallback(
    (
      rows: typeof conversationRows,
    ): ConversationSummary[] => {
      const memberById = new Map(members.map((member) => [member.id, member]));
      const createdAt = new Map(rows.map((row) => [row.id, row.created_at]));
      const summaries = rows.map((row) => {
      // Membres déclarés ACTIFS, complétés par l'expéditrice du dernier
      // message : une table `conversation_members` incomplète ne doit pas
      // afficher « Foyer » à la place d'un prénom. Seul l'aperçu alimente le
      // repli (pas le fil entier) : les expéditrices anciennes d'un fil non
      // ouvert restent invisibles tant qu'il n'est pas chargé.
      const preview = previewByConversation.get(row.id);
      const memberIds = [
        ...(memberIdsByConversation.get(row.id) ?? []),
        ...(preview ? [preview.sender_id] : []),
      ];
      const participants = [...new Set(memberIds)]
        .map((memberId) => memberById.get(memberId))
        .filter((member): member is NonNullable<typeof member> => Boolean(member))
        .map(toParticipant);
      const last = preview ? toMessage(preview, { currentMemberId, members }) : null;
      const readAt = readMap[row.id] ?? '';
      const unseenLatest = last !== null && !last.isMine && isUnseen(last.createdAt, readAt);
      return {
        id: row.id,
        type: row.type,
        title: resolveConversationTitle(row, participants, currentMemberId),
        participants,
        colorTag: participants.find((participant) => participant.id !== currentMemberId)?.colorTag ?? 'accent',
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt ?? null,
        lastMessageMine: last?.isMine ?? false,
        unread: unseenLatest ? 1 : 0,
        isArchived: archivedIds.has(row.id),
      } satisfies ConversationSummary;
    });
    // Les conversations les plus récentes d'abord ; celles sans message restent en fin de liste.
    const activity = (conversation: ConversationSummary) => conversation.lastMessageAt ?? createdAt.get(conversation.id) ?? '';
    return summaries.sort((left, right) => {
      if (Boolean(left.lastMessageAt) !== Boolean(right.lastMessageAt)) return left.lastMessageAt ? -1 : 1;
      return activity(right).localeCompare(activity(left));
    });
    },
    [archivedIds, currentMemberId, memberIdsByConversation, members, previewByConversation, readMap],
  );

  const conversations = useMemo(
    () => buildSummaries(visibleRows.filter((row) => !archivedIds.has(row.id))),
    [archivedIds, buildSummaries, visibleRows],
  );
  const archivedConversations = useMemo(
    () => buildSummaries(visibleRows.filter((row) => archivedIds.has(row.id))),
    [archivedIds, buildSummaries, visibleRows],
  );

  /**
   * Applique une réécriture aux fenêtres du fil mises en cache (toutes les
   * tailles) et à l'aperçu, en rendant l'instantané pour restauration.
   */
  const rewriteThreadCaches = useCallback(
    (conversationId: string, rewrite: (row: MessageRow) => MessageRow | null) => {
      if (!householdId) return { threadEntries: [], previousPreview: undefined as MessageRow[] | undefined };
      const threadEntries = queryClient.getQueriesData<MessagePage>({
        queryKey: messageKeys.threadPrefix(householdId, conversationId),
      });
      for (const [key, page] of threadEntries) {
        if (!page) continue;
        queryClient.setQueryData<MessagePage>(key, {
          ...page,
          rows: page.rows.flatMap((row) => {
            const rewritten = rewrite(row);
            return rewritten === null ? [] : [rewritten];
          }),
        });
      }
      const previewKey = messageKeys.previews(householdId);
      const previousPreview = queryClient.getQueryData<MessageRow[]>(previewKey);
      queryClient.setQueryData<MessageRow[]>(previewKey, (current = []) => {
        const next: MessageRow[] = [];
        for (const row of current) {
          if (row.conversation_id !== conversationId) {
            next.push(row);
            continue;
          }
          const rewritten = rewrite(row);
          if (rewritten) next.push(rewritten);
        }
        return next;
      });
      return { threadEntries, previousPreview };
    },
    [householdId, queryClient],
  );

  const restoreThreadCaches = useCallback(
    (
      snapshot: { threadEntries: ReturnType<typeof queryClient.getQueriesData<MessagePage>>; previousPreview: MessageRow[] | undefined },
    ) => {
      for (const [key, page] of snapshot.threadEntries) queryClient.setQueryData(key, page);
      if (snapshot.previousPreview && householdId) {
        queryClient.setQueryData(messageKeys.previews(householdId), snapshot.previousPreview);
      }
    },
    [householdId, queryClient],
  );

  const sendMutation = useMutation({
    mutationFn: (input: { conversationId: string; content: string; mediaUrl?: string | null }) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      return createMessage({
        conversationId: input.conversationId,
        householdId,
        senderId: currentMemberId,
        content: input.content,
        mediaUrl: input.mediaUrl ?? null,
      });
    },
    onMutate: async (input) => {
      if (!householdId) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: messageKeys.all });
      const optimistic: MessageRow = {
        id: `pending-${randomId('message')}`,
        conversation_id: input.conversationId,
        household_id: householdId,
        sender_id: currentMemberId,
        content: input.content,
        media_url: input.mediaUrl ?? null,
        created_at: new Date().toISOString(),
      };
      const threadEntries = queryClient.getQueriesData<MessagePage>({
        queryKey: messageKeys.threadPrefix(householdId, input.conversationId),
      });
      for (const [key, page] of threadEntries) {
        if (!page) continue;
        queryClient.setQueryData<MessagePage>(key, { ...page, rows: [optimistic, ...page.rows], total: page.total + 1 });
      }
      const previewKey = messageKeys.previews(householdId);
      const previousPreview = queryClient.getQueryData<MessageRow[]>(previewKey);
      queryClient.setQueryData<MessageRow[]>(previewKey, (current = []) => {
        const rest = current.filter((row) => row.conversation_id !== input.conversationId);
        return [...rest, optimistic];
      });
      return { previous: { threadEntries, previousPreview } };
    },
    onError: (_error, _input, context) => {
      if (!context?.previous) return;
      restoreThreadCaches(context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  const send = useCallback(
    async (conversationId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Un message fait ${MAX_MESSAGE_LENGTH} caractères au maximum.`);
      }
      await sendMutation.mutateAsync({ conversationId, content: trimmed });
    },
    [sendMutation],
  );

  /** Envoi avec image jointe : dépôt du média puis message, dans cet ordre. */
  const sendMedia = useCallback(
    async (conversationId: string, content: string, image: CompressedImage) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      const mediaUrl = await depositMessageImage({ householdId, conversationId, image });
      await sendMutation.mutateAsync({ conversationId, content: content.trim(), mediaUrl });
    },
    [householdId, sendMutation],
  );

  const createMutation = useMutation({
    mutationFn: async (draft: Omit<ConversationDraft, 'householdId'>) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (!currentMemberId) throw new Error('Aucun membre courant pour créer la conversation.');
      // Le créateur participe toujours à sa conversation (exigé côté base).
      const memberIds = [...new Set([currentMemberId, ...draft.memberIds].filter((id) => id.trim() !== ''))];
      const row = await createConversation({ householdId, type: draft.type, title: draft.title, memberIds });
      return row.id;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (input: { conversationId: string; memberIds: string[] }) =>
      addConversationMembers(input.conversationId, input.memberIds),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      return removeConversationCascade({ householdId, conversationId });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  /** Édition optimiste : le contenu est remplacé aussitôt, restauré en cas de refus serveur. */
  const editMessageMutation = useMutation({
    mutationFn: (input: { conversationId: string; messageId: string; content: string }) =>
      updateMessageContent(input.messageId, input.content),
    onMutate: async (input) => {
      if (!householdId) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: messageKeys.all });
      const trimmed = input.content.trim();
      const previous = rewriteThreadCaches(input.conversationId, (row) =>
        row.id === input.messageId ? { ...row, content: trimmed } : row,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!context?.previous) return;
      restoreThreadCaches(context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  /** Suppression optimiste d'un seul message : retiré aussitôt, restauré en cas de refus serveur. */
  const deleteMessageMutation = useMutation({
    mutationFn: (input: { conversationId: string; messageId: string }) => removeMessageRow(input.messageId),
    onMutate: async (input) => {
      if (!householdId) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: messageKeys.all });
      const previous = rewriteThreadCaches(input.conversationId, (row) => (row.id === input.messageId ? null : row));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!context?.previous) return;
      restoreThreadCaches(context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  /**
   * Départ volontaire en pierre tombale (D-08) : la ligne d'appartenance est
   * horodatée, jamais retirée. Retrait optimiste du registre actif (la tombe
   * reste lisible pour la section archives), restauré en cas de refus.
   */
  const leaveMutation = useMutation({
    mutationFn: (conversationId: string) => {
      if (!currentMemberId) throw new Error('Aucun membre courant pour quitter la conversation.');
      return leaveConversationRow(conversationId, currentMemberId);
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.participants });
      const previous = queryClient.getQueryData<ConversationMemberRow[]>(messageKeys.participants);
      const stampedAt = new Date().toISOString();
      queryClient.setQueryData<ConversationMemberRow[]>(messageKeys.participants, (current = []) =>
        current.map((row) =>
          row.conversation_id === conversationId && row.member_id === currentMemberId && !row.left_at
            ? { ...row, left_at: stampedAt }
            : row,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!context?.previous) return;
      queryClient.setQueryData(messageKeys.participants, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  /**
   * Retrait d'un fil quitté de ses archives (D-08) : seule sa propre pierre
   * est retirée, le fil disparaît des archives. Restauré en cas de refus.
   */
  const removeArchivedMutation = useMutation({
    mutationFn: (conversationId: string) => {
      if (!currentMemberId) throw new Error('Aucun membre courant pour retirer ce fil des archives.');
      return removeArchivedConversationRow(conversationId, currentMemberId);
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.participants });
      const previous = queryClient.getQueryData<ConversationMemberRow[]>(messageKeys.participants);
      queryClient.setQueryData<ConversationMemberRow[]>(messageKeys.participants, (current = []) =>
        current.filter((row) => !(row.conversation_id === conversationId && row.member_id === currentMemberId)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!context?.previous) return;
      queryClient.setQueryData(messageKeys.participants, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });

  const createConversationAndSelect = useCallback(
    async (draft: Omit<ConversationDraft, 'householdId'>) => createMutation.mutateAsync(draft),
    [createMutation],
  );
  const addMembers = useCallback(
    async (conversationId: string, memberIds: string[]) => addMembersMutation.mutateAsync({ conversationId, memberIds }),
    [addMembersMutation],
  );
  const deleteConversation = useCallback(
    async (conversationId: string) => deleteMutation.mutateAsync(conversationId),
    [deleteMutation],
  );
  const editMessage = useCallback(
    async (conversationId: string, messageId: string, content: string) => {
      await editMessageMutation.mutateAsync({ conversationId, messageId, content });
    },
    [editMessageMutation],
  );
  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      await deleteMessageMutation.mutateAsync({ conversationId, messageId });
    },
    [deleteMessageMutation],
  );
  const leaveConversation = useCallback(
    async (conversationId: string) => leaveMutation.mutateAsync(conversationId),
    [leaveMutation],
  );
  const removeArchivedConversation = useCallback(
    async (conversationId: string) => removeArchivedMutation.mutateAsync(conversationId),
    [removeArchivedMutation],
  );

  const refetch = useCallback(() => {
    void conversationsQuery.refetch();
    void participantsQuery.refetch();
    void previewsQuery.refetch();
  }, [conversationsQuery, participantsQuery, previewsQuery]);

  return {
    conversations,
    archivedConversations,
    memberIdsByConversation,
    unreadTotal: conversations.reduce((total, conversation) => total + conversation.unread, 0),
    householdId,
    currentMemberId,
    isLoading: conversationsQuery.isLoading || participantsQuery.isLoading || previewsQuery.isLoading,
    isError: conversationsQuery.isError || participantsQuery.isError || previewsQuery.isError,
    error: (conversationsQuery.error ?? participantsQuery.error ?? previewsQuery.error ?? null) as Error | null,
    refetch,
    readMap,
    markRead,
    send,
    isSending: sendMutation.isPending,
    sendMedia,
    createConversation: createConversationAndSelect,
    addMembers,
    deleteConversation,
    editMessage,
    deleteMessage,
    leaveConversation,
    removeArchivedConversation,
    isCreating: createMutation.isPending || addMembersMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isLeaving: leaveMutation.isPending,
    isRemovingArchived: removeArchivedMutation.isPending,
  };
}

export interface ThreadPage {
  /** Fil chargé, du plus ancien au plus récent. */
  messages: Message[];
  /** Taille connue du fil (portée conversation). */
  total: number;
  /** Messages effectivement chargés. */
  loaded: number;
  /** Vrai quand des messages plus anciens restent déchargés. */
  hasMoreBefore: boolean;
  /** Anciens restants, pour une copie honnête du « Charger plus ». */
  remainingBefore: number;
  /** Non-lus exacts sur la page chargée (les plus anciens sont antérieurs au marquage). */
  unread: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Page d'un seul fil (D-05) : la fenêtre la plus récente d'abord, élargie par
 * « Charger plus » explicite — jamais de défilement infini. Les tailles de
 * fenêtre sont conservées par fil le temps de la session.
 */
export function useThreadPage(conversationId: string | null): ThreadPage {
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const members = useMembers();
  const { readMap } = useReadConversations();
  const [limits, setLimits] = useState<Record<string, number>>({});
  const limit = conversationId ? (limits[conversationId] ?? MESSAGE_PAGE_SIZE) : MESSAGE_PAGE_SIZE;

  const threadQuery = useQuery({
    queryKey: messageKeys.thread(householdId, conversationId, limit),
    enabled: Boolean(householdId && conversationId),
    queryFn: () => fetchMessagePage(householdId, conversationId, { limit }),
    placeholderData: keepPreviousData,
  });

  const loadMore = useCallback(() => {
    if (!conversationId) return;
    setLimits((previous) => ({
      ...previous,
      [conversationId]: (previous[conversationId] ?? MESSAGE_PAGE_SIZE) + MESSAGE_PAGE_SIZE,
    }));
  }, [conversationId]);

  const messages = useMemo(() => {
    const rows = threadQuery.data?.rows ?? [];
    return sortMessages(rows.map((row) => toMessage(row, { currentMemberId, members })));
  }, [currentMemberId, members, threadQuery.data]);

  const readAt = (conversationId && readMap[conversationId]) ?? '';
  const unread = messages.filter((message) => !message.isMine && isUnseen(message.createdAt, readAt)).length;

  const total = threadQuery.data?.total ?? 0;
  const loaded = threadQuery.data?.rows.length ?? 0;
  const hasMoreBefore = threadQuery.data?.hasMore ?? false;

  const refetch = useCallback(() => {
    void threadQuery.refetch();
  }, [threadQuery]);

  return {
    messages,
    total,
    loaded,
    hasMoreBefore,
    remainingBefore: Math.max(0, total - loaded),
    unread,
    isLoading: threadQuery.isLoading,
    isLoadingMore: threadQuery.isFetching && !threadQuery.isLoading,
    loadMore,
    refetch,
  };
}

/** Abonnement temps réel : la RLS filtre les changements reçus. */
export function useMessagesRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all });
    };
    const unsubscribeMessages = data.subscribe('messages', invalidate);
    const unsubscribeConversations = data.subscribe('conversations', invalidate);
    return () => {
      unsubscribeMessages();
      unsubscribeConversations();
    };
  }, [queryClient]);
}
