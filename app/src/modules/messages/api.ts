import { data, DataError } from '@/lib/data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { CompressedImage } from '@/modules/cercle/lib/media';
import type { ConversationMemberRow, ConversationRow, MessageRow } from '@/types';

/** Bucket privé : `household-media` (0010), chemin préfixé par le foyer. */
const MESSAGES_BUCKET = 'household-media';
/** Durée de validité des URL signées servies par le Storage. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 30;

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
  /** URL du média joint (signée en mode Supabase, aperçu local en démo). */
  mediaUrl?: string | null;
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
  if (content.length === 0 && !draft.mediaUrl) throw new Error('Écrivez un message ou joignez une image.');
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Un message fait ${MAX_MESSAGE_LENGTH} caractères au maximum.`);
  }
  return data.create<MessageRow>('messages', {
    id: randomId('message'),
    conversation_id: draft.conversationId,
    household_id: draft.householdId,
    sender_id: draft.senderId,
    content,
    media_url: draft.mediaUrl ?? null,
    created_at: new Date().toISOString(),
  });
}

/**
 * Dépôt d'une image jointe : bucket privé en mode Supabase (URL signée),
 * aperçu local en mode démo. La compression a déjà été appliquée côté
 * navigateur (module Cercle, sans dépendance).
 */
export async function depositMessageImage(input: {
  householdId: string;
  conversationId: string;
  image: CompressedImage;
}): Promise<string> {
  if (!isSupabaseConfigured || !supabase) return input.image.previewUrl;
  const path = `${input.householdId}/messages/${input.conversationId}/${randomId('media')}.${input.image.mime === 'image/webp' ? 'webp' : 'jpg'}`;
  const { error } = await supabase.storage.from(MESSAGES_BUCKET).upload(path, input.image.blob, {
    contentType: input.image.mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: signed, error: signError } = await supabase.storage.from(MESSAGES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw new Error(signError.message);
  return signed.signedUrl;
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

/**
 * Suppression d'une conversation et de tout son contenu (participants,
 * messages). En ligne la cascade SQL emporte les enfants ; en local
 * l'adaptateur n'a pas de cascade implicite, on retire explicitement.
 * La RLS (`conversations_delete`) réserve l'opération aux administrateurs.
 */
export async function removeConversationCascade(input: {
  householdId: string;
  conversationId: string;
}): Promise<void> {
  const { householdId, conversationId } = input;
  const [media, members] = await Promise.all([
    data.list<MessageRow>('messages', { household_id: householdId, conversation_id: conversationId }),
    data.list<ConversationMemberRow>('conversation_members', { conversation_id: conversationId }),
  ]);
  await Promise.all([
    ...media.map((row) => data.remove('messages', row.id)),
    ...members.map((row) =>
      data.removeWhere('conversation_members', { conversation_id: row.conversation_id, member_id: row.member_id }),
    ),
    data.remove('conversations', conversationId),
  ]);
}
