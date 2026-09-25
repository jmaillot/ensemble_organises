import { MemberAvatar } from '@/components/shared/member-avatar';
import { CountBadge } from '@/components/shared/module-shell';
import { LoadingRows } from '@/components/ui/empty-state';
import { pluralize } from '@/lib/utils';
import { formatListTime, type ConversationSummary } from '../types';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  isLoading?: boolean;
  className?: string;
}

/** Liste des conversations : une vraie liste de boutons, `aria-current` compris. */
export function ConversationList({ conversations, activeId, onSelect, isLoading = false, className }: ConversationListProps) {
  return (
    <aside
      aria-label="Conversations"
      className={className ?? 'panel-surface rounded-[16px] p-2.5 max-[920px]:max-h-[260px] max-[920px]:overflow-auto'}
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-3">
        <h3 className="m-0 font-display text-base tracking-[-0.035em]">Conversations</h3>
        <CountBadge value={conversations.length} label="conversations" />
      </div>
      {isLoading ? <LoadingRows rows={3} className="px-2" /> : null}
      {!isLoading && conversations.length === 0 ? (
        <p className="m-0 px-2 pb-2 text-xs text-muted">Aucune conversation pour le moment.</p>
      ) : null}
      <ul className="grid list-none gap-0.5 p-0">
        {conversations.map((conversation) => {
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
                className={`flex w-full items-center gap-2.5 rounded-[11px] px-2 py-[11px] text-left transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint ${
                  isActive ? 'bg-accent-faint' : ''
                }`}
              >
                <MemberAvatar name={conversation.title} colorTag={conversation.colorTag} size="sm" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs">{conversation.title}</strong>
                  <span className="block truncate text-[10px] text-muted">
                    {conversation.lastMessageMine ? 'Vous : ' : ''}
                    {conversation.lastMessage ?? 'Aucun message'}
                  </span>
                </span>
                {conversation.unread > 0 ? (
                  <span className="size-[7px] shrink-0 rounded-full bg-coral" aria-hidden="true" />
                ) : (
                  <small className="shrink-0 text-[10px] text-muted">{formatListTime(conversation.lastMessageAt)}</small>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
