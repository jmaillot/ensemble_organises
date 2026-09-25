import { addDays, formatShortDate, toIsoDate, todayIso } from '@/lib/utils';
import type { ConversationRow, HouseholdMemberRow, MemberColorTag, MessageRow } from '@/types';

/** Membre présent dans une conversation, résolu pour l'affichage. */
export interface ConversationParticipant {
  id: string;
  name: string;
  colorTag: MemberColorTag;
}

/** Ligne de conversation enrichie : c'est l'unité affichée dans la liste. */
export interface ConversationSummary {
  id: string;
  type: 'direct' | 'groupe';
  /** Titre résolu : prénom(s) pour un direct, `title` pour un groupe. */
  title: string;
  participants: ConversationParticipant[];
  /** Couleur de l'interlocuteur principal (couleur du foyer en groupe). */
  colorTag: MemberColorTag;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageMine: boolean;
  unread: number;
}

/** Message affiché dans la zone de discussion. */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderColorTag: MemberColorTag;
  content: string;
  createdAt: string;
  isMine: boolean;
  /** Message optimiste : affiché immédiatement, pas encore persisté. */
  pending: boolean;
}

/** Le modèle ne suit pas encore la lecture côté serveur : elle est locale. */
export type ReadMap = Record<string, string>;

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const clockFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const formatClock = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : clockFormatter.format(date);
};

/** Heure pour une liste de conversations, date courte au-delà de la veille. */
export function formatListTime(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = toIsoDate(date);
  if (day === todayIso()) return formatClock(iso);
  if (day === addDays(todayIso(), -1)) return 'Hier';
  if (day === addDays(todayIso(), 1)) return 'Demain';
  return formatShortDate(day);
}

/**
 * Titre d'une conversation : les prénoms des autres participants pour un
 * échange direct, le `title` du groupe sinon (jamais l'identifiant SQL).
 */
export function resolveConversationTitle(
  row: ConversationRow,
  participants: ConversationParticipant[],
  currentMemberId: string | null,
): string {
  if (row.type === 'groupe') return row.title?.trim() || 'Groupe du foyer';
  const others = participants.filter((participant) => participant.id !== currentMemberId);
  if (others.length === 0) return firstNameOf(row.title?.trim() || 'Foyer');
  if (others.length === 1) return firstNameOf(others[0].name);
  return others.map((participant) => firstNameOf(participant.name)).join(', ');
}

export function toParticipant(member: HouseholdMemberRow): ConversationParticipant {
  return { id: member.id, name: member.display_name, colorTag: member.color_tag };
}

export function toMessage(
  row: MessageRow,
  context: { currentMemberId: string | null; members: HouseholdMemberRow[]; pending?: boolean },
): Message {
  const sender = context.members.find((member) => member.id === row.sender_id);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: sender?.display_name ?? 'Membre du foyer',
    senderColorTag: sender?.color_tag ?? 'accent',
    content: row.content,
    createdAt: row.created_at,
    isMine: row.sender_id === context.currentMemberId,
    // Les lignes optimistes ne sont pas encore persistées : on le signale.
    pending: context.pending ?? row.id.startsWith('pending-'),
  };
}

/** Messages d'une conversation, du plus ancien au plus récent. */
export function sortMessages(messages: Message[]) {
  return [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
