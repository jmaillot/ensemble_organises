import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import type { ConversationMemberRow, ConversationRow, MessageRow } from '@/types';

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
  return data.create<MessageRow>('messages', {
    id: randomId('message'),
    conversation_id: draft.conversationId,
    household_id: draft.householdId,
    sender_id: draft.senderId,
    content: draft.content,
    media_url: null,
    created_at: new Date().toISOString(),
  });
}
