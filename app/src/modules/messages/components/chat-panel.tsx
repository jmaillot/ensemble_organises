import { useEffect, useRef, useState, type RefObject } from 'react';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/shared/icon';
import { compressImage, describeFile, type CompressedImage } from '@/modules/cercle/lib/media';
import { formatClock, type ConversationSummary, type Message } from '../types';

export interface ChatPanelProps {
  conversation: ConversationSummary | null;
  messages: Message[];
  isSending?: boolean;
  onSend: (content: string) => void;
  onSendMedia?: (content: string, image: CompressedImage) => void;
  /** Ouvre le dialogue d'ajout de membre ; absent, le bouton est masqué. */
  onAddMember?: () => void;
  /** Sur petit écran : revient à la liste pour ne pas écraser la discussion. */
  onBackToList?: () => void;
  composerRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** Zone de discussion : journal accessible, bulles, pièces jointes et saisie. */
export function ChatPanel({ conversation, messages, isSending = false, onSend, onSendMedia, onAddMember, onBackToList, composerRef, className }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<CompressedImage | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    setDraft('');
    setAttachment((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setAttachError(null);
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
  const canSubmit = draft.trim() !== '' || attachment !== null;
  const submit = () => {
    const content = draft.trim();
    if (!content && !attachment) return;
    if (attachment && onSendMedia) onSendMedia(content, attachment);
    else onSend(content);
    setDraft('');
    setAttachment((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setAttachError(null);
    try {
      const image = await compressImage(file);
      setAttachment((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return image;
      });
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : 'Image illisible.');
    }
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
        {onAddMember ? (
          <Button
            variant="quiet"
            size="sm"
            icon="plus"
            onClick={onAddMember}
            aria-label={`Ajouter un membre à ${conversation.title}`}
            className="shrink-0"
          >
            Ajouter
          </Button>
        ) : null}
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
              // Un seul fond pour les deux camps (écriture sombre sur fond
              // clair) : seul l'alignement distingue envoyés et reçus.
              className={`max-w-[72%] rounded-[14px_14px_14px_4px] border border-border bg-surface px-3 py-2.5 text-xs ${
                message.isMine ? 'self-end rounded-[14px_14px_4px_14px]' : 'self-start'
              }`}
            >
              <span className="mb-1 block text-[10px] font-extrabold text-muted">{`${message.senderName} :`}</span>
              {message.mediaUrl ? (
                <a href={message.mediaUrl} target="_blank" rel="noreferrer" aria-label={`Ouvrir l’image de ${message.senderName}`}>
                  <img src={message.mediaUrl} alt="" loading="lazy" className="mb-1.5 max-h-48 w-auto rounded-[10px]" />
                </a>
              ) : null}
              <span className="whitespace-pre-wrap break-words">{message.content}</span>
              <time
                dateTime={message.createdAt}
                className="mt-1 block text-[10px] text-muted"
              >
                {formatClock(message.createdAt)}
                {message.pending ? ' · envoi…' : ''}
              </time>
            </div>
          ))
        )}
      </div>

      {attachment ? (
        <div className="flex items-center gap-2 border-t border-border px-3 pt-2.5">
          <img src={attachment.previewUrl} alt="" className="h-11 w-auto rounded-[8px]" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
            {describeFile(attachment.originalName, attachment.size)}
          </span>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => {
              URL.revokeObjectURL(attachment.previewUrl);
              setAttachment(null);
            }}
            aria-label="Retirer l’image jointe"
          >
            Retirer
          </Button>
        </div>
      ) : null}
      {attachError ? (
        <p role="alert" className="m-0 border-t border-border px-3 pt-2 text-[11px] font-semibold text-coral">
          {attachError}
        </p>
      ) : null}
      <form
        className="flex gap-2 border-t border-border p-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Joindre une image"
          onChange={(event) => {
            void attach(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="quiet"
          size="sm"
          icon="image"
          onClick={() => fileRef.current?.click()}
          aria-label="Joindre une image"
        />
        <Input
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Écrire un message…"
          aria-label="Écrire un message"
          autoComplete="off"
          maxLength={4000}
          className="flex-1"
        />
        <Button type="submit" icon="send" aria-label="Envoyer" disabled={!canSubmit || isSending} />
      </form>
      <p className="m-0 flex items-center gap-1.5 border-t border-border px-3 py-2 text-[10px] text-muted">
        <Icon name="wifi" size="sm" />
        Les messages arrivent en temps réel pour les membres du foyer.
      </p>
    </section>
  );
}
