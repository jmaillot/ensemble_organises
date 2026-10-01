import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { createConversation, addConversationMembers, createMessage, depositMessageImage, fetchConversationParticipants, fetchConversations, fetchMessages, removeConversationCascade, MAX_MESSAGE_LENGTH, type ConversationDraft } from '../api';
import type { CompressedImage } from '@/modules/cercle/lib/media';
import { resolveConversationTitle, sortMessages, toMessage, toParticipant, type ConversationSummary, type Message, type ReadMap } from '../types';
import type { MessageRow } from '@/types';

export const messageKeys = {
  all: ['messages'] as const,
  conversations: (householdId: string | null) => ['messages', 'conversations', householdId] as const,
  participants: ['messages', 'participants'] as const,
  rows: (householdId: string | null) => ['messages', 'rows', householdId] as const,
};

const READ_STORAGE_KEY = 'ensemble-organises-messages-read';

function readStoredReadMap(): ReadMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(READ_STORAGE_KEY) ?? '{}') as ReadMap;
  } catch {
    // Un cache local corrompu ne doit pas empêcher l'affichage des messages.
    return {};
  }
}

/**
 * Suivi de lecture. Le modèle ne contient pas encore d'horodatage de lecture
 * par message : la référence est conservée localement et sera remplacée par un
 * accusé de lecture serveur (table dédiée ou colonne `read_at`).
 */
export function useReadConversations() {
  const [readMap, setReadMap] = useState<ReadMap>(readStoredReadMap);

  const markRead = useCallback((conversationId: string) => {
    setReadMap((current) => {
      const at = new Date().toISOString();
      if (current[conversationId] === at) return current;
      const next = { ...current, [conversationId]: at };
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Stockage plein ou refusé : la lecture reste valable pour la session.
        }
      }
      return next;
    });
  }, []);

  return { readMap, markRead } as const;
}

export interface MessagesFeed {
  conversations: ConversationSummary[];
  messagesByConversation: Map<string, Message[]>;
  totalMessages: number;
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
  isCreating: boolean;
  isDeleting: boolean;
}

/** Conversations, participants et messages du foyer, assemblés pour l'écran. */
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
  const messagesQuery = useQuery({
    queryKey: messageKeys.rows(householdId),
    enabled: Boolean(householdId),
    queryFn: () => fetchMessages(householdId),
  });

  const rows = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const conversationRows = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const participantRows = useMemo(() => participantsQuery.data ?? [], [participantsQuery.data]);

  const messagesByConversation = useMemo(() => {
    const grouped = new Map<string, Message[]>();
    for (const row of rows) {
      const message = toMessage(row, { currentMemberId, members });
      const existing = grouped.get(message.conversationId);
      if (existing) existing.push(message);
      else grouped.set(message.conversationId, [message]);
    }
    for (const [conversationId, list] of grouped) grouped.set(conversationId, sortMessages(list));
    return grouped;
  }, [currentMemberId, members, rows]);

  const conversations = useMemo<ConversationSummary[]>(() => {
    const memberById = new Map(members.map((member) => [member.id, member]));
    const createdAt = new Map(conversationRows.map((row) => [row.id, row.created_at]));
    const summaries = conversationRows.map((row) => {
      // Membres déclarés dans la conversation, complétés par celles et ceux qui
      // y ont écrit : une table `conversation_members` incomplète ne doit pas
      // afficher « Foyer » à la place d'un prénom.
      const memberIds = [
        ...participantRows.filter((participant) => participant.conversation_id === row.id).map((participant) => participant.member_id),
        ...rows.filter((message) => message.conversation_id === row.id).map((message) => message.sender_id),
      ];
      const participants = [...new Set(memberIds)]
        .map((memberId) => memberById.get(memberId))
        .filter((member): member is NonNullable<typeof member> => Boolean(member))
        .map(toParticipant);
      const thread = messagesByConversation.get(row.id) ?? [];
      const last = thread.at(-1) ?? null;
      const readAt = readMap[row.id] ?? '';
      return {
        id: row.id,
        type: row.type,
        title: resolveConversationTitle(row, participants, currentMemberId),
        participants,
        colorTag: participants.find((participant) => participant.id !== currentMemberId)?.colorTag ?? 'accent',
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt ?? null,
        lastMessageMine: last?.isMine ?? false,
        unread: thread.filter((message) => !message.isMine && (!readAt || message.createdAt > readAt)).length,
      } satisfies ConversationSummary;
    });
    // Les conversations les plus récentes d'abord ; celles sans message restent en fin de liste.
    const activity = (conversation: ConversationSummary) => conversation.lastMessageAt ?? createdAt.get(conversation.id) ?? '';
    return summaries.sort((left, right) => {
      if (Boolean(left.lastMessageAt) !== Boolean(right.lastMessageAt)) return left.lastMessageAt ? -1 : 1;
      return activity(right).localeCompare(activity(left));
    });
  }, [conversationRows, currentMemberId, members, messagesByConversation, participantRows, readMap, rows]);

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
      await queryClient.cancelQueries({ queryKey: messageKeys.rows(householdId) });
      const key = messageKeys.rows(householdId);
      const previous = queryClient.getQueryData<Awaited<ReturnType<typeof fetchMessages>>>(key);
      const optimistic: MessageRow = {
        id: `pending-${randomId('message')}`,
        conversation_id: input.conversationId,
        household_id: householdId,
        sender_id: currentMemberId,
        content: input.content,
        media_url: input.mediaUrl ?? null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<MessageRow[]>(key, (current = []) => [...current, optimistic]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!householdId || !context?.previous) return;
      queryClient.setQueryData(messageKeys.rows(householdId), context.previous);
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

  const refetch = useCallback(() => {
    void conversationsQuery.refetch();
    void messagesQuery.refetch();
  }, [conversationsQuery, messagesQuery]);

  return {
    conversations,
    messagesByConversation,
    totalMessages: rows.length,
    unreadTotal: conversations.reduce((total, conversation) => total + conversation.unread, 0),
    householdId,
    currentMemberId,
    isLoading: conversationsQuery.isLoading || messagesQuery.isLoading,
    isError: conversationsQuery.isError || messagesQuery.isError,
    error: (conversationsQuery.error ?? messagesQuery.error ?? null) as Error | null,
    refetch,
    readMap,
    markRead,
    send,
    isSending: sendMutation.isPending,
    sendMedia,
    createConversation: createConversationAndSelect,
    addMembers,
    deleteConversation,
    isCreating: createMutation.isPending || addMembersMutation.isPending,
    isDeleting: deleteMutation.isPending,
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
