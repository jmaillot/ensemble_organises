import { MemberAvatar } from '@/components/shared/member-avatar';
import { CountBadge } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { LoadingRows } from '@/components/ui/empty-state';
import { pluralize } from '@/lib/utils';
import { formatListTime, type ConversationSummary } from '../types';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  /** Fils quittés : section « Anciennes conversations », lecture seule. */
  archivedConversations?: ConversationSummary[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  /** CTA « Démarrer une conversation » (D-04) : présent sur le panneau ET la liste vide. */
  onStartConversation?: () => void;
  isLoading?: boolean;
  className?: string;
}

/** Liste des conversations : une vraie liste de boutons, `aria-current` compris. */
export function ConversationList({ conversations, archivedConversations = [], activeId, onSelect, onStartConversation, isLoading = false, className }: ConversationListProps) {
  const renderItem = (conversation: ConversationSummary) => {
    const isActive = conversation.id === activeId;
    const unreadLabel =
      conversation.unread > 0 ? `, ${pluralize(conversation.unread, 'message')} non lu${conversation.unread > 1 ? 's' : ''}` : '';
    return (
      <li key={conversation.id}>
        <button
          type="button"
          aria-current={isActive ? 'true' : undefined}
          aria-label={`${conversation.title}${unreadLabel}`}
          onClick={() => onSelect(conversation.id)}
          className={`flex min-h-[56px] w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint ${
            isActive ? 'bg-accent-faint' : ''
          }`}
        >
          <MemberAvatar name={conversation.title} colorTag={conversation.colorTag} size="md" />
          <span className="min-w-0 flex-1">
            <strong className={`block truncate text-[13.5px] ${conversation.unread > 0 ? 'font-extrabold' : 'font-semibold'}`}>
              {conversation.title}
            </strong>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
              <span className="min-w-0 truncate">
                {conversation.lastMessageMine ? 'Vous : ' : ''}
                {conversation.lastMessage ?? 'Aucun message'}
              </span>
            </span>
          </span>
          <span className="flex w-9 shrink-0 flex-col items-end gap-1">
            {conversation.lastMessageAt ? (
              <small className="text-[11px] text-muted">{formatListTime(conversation.lastMessageAt)}</small>
            ) : null}
            {conversation.unread > 0 ? (
              <span
                className="grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-coral-deep px-1 text-[11px] font-extrabold text-white"
                aria-hidden="true"
              >
                {conversation.unread}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };
  return (
    <aside
      aria-label="Conversations"
      className={className ?? 'panel-surface rounded-[22px] p-2 max-[920px]:max-h-[260px] max-[920px]:overflow-auto'}
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-3">
        <h3 className="m-0 font-display text-base tracking-[-0.035em]">Conversations</h3>
        <CountBadge value={conversations.length} label="conversations" />
      </div>
      {onStartConversation ? (
        <div className="px-2 pb-2">
          {/* CTA tactille ≥ 44px (min-h-11), icône `people` (UI-SPEC). */}
          <Button size="sm" icon="people" className="min-h-11" onClick={onStartConversation}>
            Démarrer une conversation
          </Button>
        </div>
      ) : null}
      {isLoading ? <LoadingRows rows={3} className="px-2" /> : null}
      {!isLoading && conversations.length === 0 ? (
        <div className="px-2 pb-2">
          <strong className="block text-xs">Aucune conversation</strong>
          <p className="m-0 mt-0.5 text-xs text-muted">Écrivez à un membre du foyer en un tap.</p>
        </div>
      ) : null}
      <ul className="grid list-none gap-0.5 p-0">
        {conversations.map(renderItem)}
      </ul>
      {archivedConversations.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 px-2 pt-3 pb-2">
            <h4 className="m-0 font-display text-sm tracking-[-0.035em]">Anciennes conversations</h4>
            <CountBadge value={archivedConversations.length} label="archives" />
          </div>
          <ul className="grid list-none gap-0.5 p-0" aria-label="Anciennes conversations">
            {archivedConversations.map(renderItem)}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
