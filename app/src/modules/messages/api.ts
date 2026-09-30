import { data, DataError } from '@/lib/data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { ConversationMemberRow, ConversationRow, MessageRow } from '@/types';

/** Longueur maximale d'un message, comme la contrainte SQL (0004). */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Accès aux messages. Tout passe par l'adaptateur de données : la RLS reste
 * la barrière d'autorisation côté Supabase, le cache IndexedDB sert la lecture
 * hors ligne. Les colonnes du modèle ne comportent pas encore d'accusé de
 * lecture : la lecture est donc suivie côté client (cf. `useReadConversations`).
 */

export interface MessageDraft {
  conversationId: string;
  householdId: string;
  senderId: string;
  content: string;
}

export async function fetchConversations(householdId: string | null): Promise<ConversationRow[]> {
  if (!householdId) return [];
  return data.list<ConversationRow>('conversations', { household_id: householdId });
}

/** Table d'association : elle ne porte pas `household_id`, elle dérive du foyer. */
export async function fetchConversationParticipants(): Promise<ConversationMemberRow[]> {
  return data.list<ConversationMemberRow>('conversation_members');
}

export async function fetchMessages(householdId: string | null): Promise<MessageRow[]> {
  if (!householdId) return [];
  return data.list<MessageRow>('messages', { household_id: householdId });
}

export async function createMessage(draft: MessageDraft): Promise<MessageRow> {
  const content = draft.content.trim();
  if (content.length === 0) throw new Error('Écrivez un message avant de l’envoyer.');
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Un message fait ${MAX_MESSAGE_LENGTH} caractères au maximum.`);
  }
  return data.create<MessageRow>('messages', {
    id: randomId('message'),
    conversation_id: draft.conversationId,
    household_id: draft.householdId,
    sender_id: draft.senderId,
    content,
    media_url: null,
    created_at: new Date().toISOString(),
  });
}

export interface ConversationDraft {
  householdId: string;
  /** `direct` à un interlocuteur, `groupe` au-delà (titre exigé). */
  type: 'direct' | 'groupe';
  title: string | null;
  /** Membres initiaux, créateur inclus (exigé par le RPC). */
  memberIds: string[];
}

/**
 * Création d'une conversation et de ses membres initiaux. En mode Supabase,
 * le RPC atomique `create_conversation` (0041) ; en mode local, les mêmes
 * lignes en IndexedDB, atomique sur une écriture.
 */
export async function createConversation(draft: ConversationDraft): Promise<ConversationRow> {
  const memberIds = [...new Set(draft.memberIds.filter((id) => id.trim() !== ''))];
  if (memberIds.length === 0) throw new Error('Choisissez au moins un membre pour la conversation.');
  if (draft.type === 'groupe' && (draft.title ?? '').trim().length < 2) {
    throw new Error('Un groupe exige un titre.');
  }
  if (isSupabaseConfigured && supabase) {
    const { data: row, error } = await supabase.rpc('create_conversation', {
      p_household_id: draft.householdId,
      p_type: draft.type,
      p_title: draft.type === 'groupe' ? (draft.title ?? '').trim() : null,
      p_member_ids: memberIds,
    });
    if (error) throw new DataError(error.message || 'Création impossible.', error);
    return row as ConversationRow;
  }
  const row = await data.create<ConversationRow>('conversations', {
    id: randomId('conversation'),
    household_id: draft.householdId,
    type: draft.type,
    title: draft.type === 'groupe' ? (draft.title ?? '').trim() : null,
    created_at: new Date().toISOString(),
  });
  try {
    await Promise.all(
      memberIds.map((memberId) =>
        data.create<ConversationMemberRow>('conversation_members', {
          conversation_id: row.id,
          member_id: memberId,
        }),
      ),
    );
  } catch (error) {
    await data.remove('conversations', row.id).catch(() => undefined);
    throw error;
  }
  return row;
}

/**
 * Ajout ultérieur de membres à une conversation existante. La RLS
 * (`can_join_conversation`) réserve l'opération aux participants et aux
 * admins ; les doublons sont ignorés avant tout appel réseau.
 */
export async function addConversationMembers(conversationId: string, memberIds: string[]): Promise<void> {
  const fresh = [...new Set(memberIds.filter((id) => id.trim() !== ''))];
  if (fresh.length === 0) throw new Error('Choisissez au moins un membre à ajouter.');
  const existing = await data.list<ConversationMemberRow>('conversation_members');
  const missing = fresh.filter(
    (memberId) => !existing.some((row) => row.conversation_id === conversationId && row.member_id === memberId),
  );
  await Promise.all(
    missing.map((memberId) =>
      data.create<ConversationMemberRow>('conversation_members', { conversation_id: conversationId, member_id: memberId }),
    ),
  );
}
