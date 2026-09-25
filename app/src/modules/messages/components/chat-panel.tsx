import { useEffect, useRef, useState, type RefObject } from 'react';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/shared/icon';
import { formatClock, type ConversationSummary, type Message } from '../types';

export interface ChatPanelProps {
  conversation: ConversationSummary | null;
  messages: Message[];
  isSending?: boolean;
  onSend: (content: string) => void;
  /** Sur petit écran : revient à la liste pour ne pas écraser la discussion. */
  onBackToList?: () => void;
  composerRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** Zone de discussion : journal accessible, bulles et zone de saisie. */
export function ChatPanel({ conversation, messages, isSending = false, onSend, onBackToList, composerRef, className }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    setDraft('');
  }, [conversationId]);

  // Le fil suit toujours le dernier message (envoi optimiste compris).
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [conversationId, messages.length]);

  if (!conversation) {
    return (
      <section aria-label="Discussion" className={className}>
        <EmptyState
          icon="message"
          title="Aucune conversation"
          description="Les échanges de votre foyer apparaîtront ici. Choisissez une conversation dans la liste pour la rejoindre."
        />
      </section>
    );
  }

  const participants = conversation.participants.length;
  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    onSend(content);
    setDraft('');
  };

  return (
    <section aria-label="Discussion" className={className}>
      <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-[15px]">
        {onBackToList ? (
          <Button
            variant="ghost"
            size="sm"
            icon="arrowLeft"
            onClick={onBackToList}
            className="-ml-2 hidden shrink-0 max-[650px]:inline-flex"
            aria-label="Retour à la liste"
          >
            Retour
          </Button>
        ) : null}
        <MemberAvatar name={conversation.title} colorTag={conversation.colorTag} size="sm" />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[13px]">{conversation.title}</strong>
          <small className="block truncate text-[10px] text-muted">
            {conversation.type === 'direct' ? 'Échange privé' : `${participants} participants`} · Foyer
          </small>
        </div>
      </div>

      <div
        ref={bodyRef}
        role="log"
        aria-live="polite"
        aria-label={`Messages de ${conversation.title}`}
        className="scrollbar-slim flex flex-1 flex-col gap-2.5 overflow-auto bg-bg px-[18px] py-[18px]"
      >
        {messages.length === 0 ? (
          <p className="m-auto max-w-[320px] text-center text-xs text-muted">
            {conversation.type === 'direct'
              ? `Dites bonjour à ${conversation.title}.`
              : `Lancez la conversation « ${conversation.title} ».`}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[72%] rounded-[14px_14px_14px_4px] border border-border bg-surface px-3 py-2.5 text-xs ${
                message.isMine ? 'self-end rounded-[14px_14px_4px_14px] border-fg bg-fg text-surface' : 'self-start'
              }`}
            >
              {!message.isMine ? <span className="mb-1 block text-[10px] font-extrabold text-muted">{message.senderName}</span> : null}
              <span className="whitespace-pre-wrap break-words">{message.content}</span>
              <time
                dateTime={message.createdAt}
                className={`mt-1 block text-[10px] ${message.isMine ? 'text-on-dark' : 'text-muted'}`}
              >
                {formatClock(message.createdAt)}
                {message.pending ? ' · envoi…' : ''}
              </time>
            </div>
          ))
        )}
      </div>

      <form
        className="flex gap-2 border-t border-border p-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Écrire un message…"
          aria-label="Écrire un message"
          autoComplete="off"
          maxLength={1000}
          className="flex-1"
        />
        <Button type="submit" icon="send" aria-label="Envoyer" disabled={!draft.trim() || isSending} />
      </form>
      <p className="m-0 flex items-center gap-1.5 border-t border-border px-3 py-2 text-[10px] text-muted">
        <Icon name="wifi" size="sm" />
        Les messages arrivent en temps réel pour les membres du foyer.
      </p>
    </section>
  );
}
