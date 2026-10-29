import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/shared/icon';
import { compressImage, describeFile, type CompressedImage } from '@/modules/cercle/lib/media';
import { useReadReceipts } from '../hooks/use-messages';
import { formatClock, type ConversationSummary, type Message } from '../types';
import { ReadReceipts } from './read-receipts';

export interface ChatPanelProps {
  conversation: ConversationSummary | null;
  messages: Message[];
  isSending?: boolean;
  onSend: (content: string) => void;
  onSendMedia?: (content: string, image: CompressedImage) => void;
  /** Ouvre le dialogue d'ajout de membre ; absent, le bouton est masqué. */
  onAddMember?: () => void;
  /** Demande l'archivage du fil pour tous (admin, D-14) ; absent, le bouton est masqué. */
  onArchiveConversation?: () => void;
  /** Enregistre le contenu réécrit d'un message ; absent, l'édition est masquée. */
  onEditMessage?: (messageId: string, content: string) => void;
  /** Demande la suppression d'un seul message ; absent, le bouton est masqué. */
  onDeleteMessage?: (messageId: string) => void;
  /** Demande le départ volontaire du fil ; absent, le bouton est masqué. */
  onLeaveConversation?: () => void;
  /** Fil quitté (D-08) : historique en lecture seule, sans compositeur ni actions d'écriture. */
  readOnly?: boolean;
  /** Fil archivé pour moi (0131) : hors de ma liste, mais écrivable — écrire la ramène. */
  archivedForMe?: boolean;
  /**
   * Fil solo (D-11) : un seul membre actif — indication sobre au compositeur,
   * jamais un blocage d'envoi. Dérivé du registre actif déjà chargé.
   */
  showSoloNotice?: boolean;
  /** Archive ce fil pour moi seul (0131) ; absent, le bouton est masqué. */
  onArchiveForMe?: () => void;
  /** Retire l'archive personnelle (0131) ; absent, le bouton est masqué. */
  onUnarchiveForMe?: () => void;
  /** Supprime ce fil pour moi seul (0131) ; absent, le bouton est masqué. */
  onDeleteForMe?: () => void;
  /** Fenêtre chargée du fil : affiche « Charger plus » quand des anciens restent déchargés. */
  pageInfo?: { hasMoreBefore: boolean; remainingBefore: number; loaded: number; total: number };
  /** Élargit la fenêtre vers les messages plus anciens. */
  onLoadMore?: () => void;
  /** Chargement de la page précédente en cours (données précédentes conservées). */
  isLoadingMore?: boolean;
  /** Sur petit écran : revient à la liste pour ne pas écraser la discussion. */
  onBackToList?: () => void;
  composerRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** Une bulle : contenu, édition inline de l'expéditrice, suppression confirmée. */
function MessageBubble({
  message,
  showEdit,
  showDelete,
  editing,
  editDraft,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
}: {
  message: Message;
  showEdit: boolean;
  showDelete: boolean;
  editing: boolean;
  editDraft: string;
  onStartEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRequestDelete: () => void;
}) {
  const canSave = editDraft.trim() !== '';
  return (
    <div
      className={`max-w-[76%] rounded-[18px_18px_18px_6px] border border-border bg-surface px-3.5 py-2.5 text-[12.5px] ${
        message.isMine ? 'self-end rounded-[18px_18px_6px_18px] border-accent/25 bg-accent-soft' : 'self-start'
      }`}
    >
      <span className="mb-1 block text-[11px] font-extrabold text-muted">{`${message.senderName} :`}</span>
      {message.mediaUrl ? (
        <a href={message.mediaUrl} target="_blank" rel="noreferrer" aria-label={`Ouvrir l’image de ${message.senderName}`}>
          <img src={message.mediaUrl} alt="" loading="lazy" className="mb-1.5 max-h-48 w-auto rounded-[10px]" />
        </a>
      ) : null}
      {editing ? (
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSaveEdit();
          }}
        >
          <Input
            value={editDraft}
            onChange={(event) => onEditDraftChange(event.target.value)}
            aria-label="Modifier votre message"
            autoComplete="off"
            maxLength={4000}
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="quiet" size="sm" onClick={onCancelEdit}>
              Annuler
            </Button>
            <Button type="submit" variant="secondary" size="sm" disabled={!canSave}>
              Enregistrer
            </Button>
          </div>
        </form>
      ) : (
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
      )}
      <time dateTime={message.createdAt} className="mt-1 block text-[11px] text-muted">
        {formatClock(message.createdAt)}
        {message.pending ? ' · envoi…' : ''}
      </time>
      {showEdit || showDelete ? (
        <div className="mt-1 flex justify-end gap-1">
          {showEdit && !editing ? (
            <Button
              type="button"
              variant="quiet"
              size="icon"
              icon="edit"
              onClick={onStartEdit}
              aria-label="Modifier ce message"
              className="size-8"
            />
          ) : null}
          {showDelete && !editing ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              icon="trash"
              onClick={onRequestDelete}
              aria-label="Supprimer ce message"
              className="size-8 text-coral hover:bg-coral-soft hover:text-coral-text"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Zone de discussion : journal accessible, bulles, pièces jointes et saisie. */
export function ChatPanel({ conversation, messages, isSending = false, onSend, onSendMedia, onAddMember, onArchiveConversation, onEditMessage, onDeleteMessage, onLeaveConversation, readOnly = false, archivedForMe = false, showSoloNotice = false, onArchiveForMe, onUnarchiveForMe, onDeleteForMe, pageInfo, onLoadMore, isLoadingMore = false, onBackToList, composerRef, className }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<CompressedImage | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<Message | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationId = conversation?.id ?? null;
  // Dernier message envoyé par l'émettrice : la rangée d'accusés (D-02) vit
  // sous CETTE bulle, pas sous un message reçu après coup.
  const lastMineId = [...messages].reverse().find((message) => message.isMine && !message.isSystem)?.id ?? null;
  const readers = useReadReceipts(conversationId, lastMineId !== null);

  useEffect(() => {
    setDraft('');
    setAttachment((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setAttachError(null);
    setEditingId(null);
    setEditDraft('');
    setPendingDeletion(null);
  }, [conversationId]);

  // Le fil suit le dernier message (envoi optimiste compris), jamais le haut :
  // charger des anciens ne doit pas renvoyer en bas.
  const newestId = messages.at(-1)?.id ?? null;
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [conversationId, newestId]);

  if (!conversation) {
    return (
      <section aria-label="Discussion" className={className}>
        <EmptyState
          icon="message"
          title="Choisissez une conversation"
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
  const saveEditFor = (target: Message) => () => {
    if (editDraft.trim() === '' || !onEditMessage) return;
    onEditMessage(target.id, editDraft);
    setEditingId(null);
    setEditDraft('');
  };
  const requestDeleteFor = (target: Message) => () => setPendingDeletion(target);

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
          <small className="block truncate text-[11px] text-muted">
            {readOnly ? (
              'Conversation quittée · lecture seule'
            ) : archivedForMe ? (
              'Archivée pour vous · écrivez pour la ramener'
            ) : conversation.type === 'direct' ? (
              'Échange privé'
            ) : (
              `${participants} participants`
            )}{' '}
            · Foyer
          </small>
        </div>
        {!readOnly && onAddMember ? (
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
        {onArchiveConversation ? (
          <Button
            variant="ghost"
            size="icon"
            icon="archive"
            onClick={onArchiveConversation}
            aria-label={`Archiver la conversation ${conversation.title} pour tout le foyer`}
            title="Archiver pour tout le foyer (admin)"
            className="size-8 shrink-0 text-muted hover:bg-coral-soft hover:text-coral-text"
          />
        ) : null}
        {onArchiveForMe ? (
          <Button
            variant="quiet"
            size="sm"
            icon="archive"
            onClick={onArchiveForMe}
            aria-label={`Archiver la conversation ${conversation.title} pour moi`}
            title="Archiver pour moi : elle quitte ma liste, les autres la gardent"
            className="shrink-0"
          >
            Archiver
          </Button>
        ) : null}
        {onUnarchiveForMe ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={onUnarchiveForMe}
            aria-label={`Désarchiver la conversation ${conversation.title}`}
            className="shrink-0"
          >
            Désarchiver
          </Button>
        ) : null}
        {onDeleteForMe ? (
          <Button
            variant="ghost"
            size="icon"
            icon="trash"
            onClick={onDeleteForMe}
            aria-label={`Supprimer la conversation ${conversation.title} pour moi`}
            title="Supprimer pour moi : elle disparaît de ma vue, les autres la gardent"
            className="size-8 shrink-0 text-muted hover:bg-coral-soft hover:text-coral-text"
          />
        ) : null}
        {!readOnly && onLeaveConversation ? (
          <Button
            variant="quiet"
            size="sm"
            icon="logout"
            onClick={onLeaveConversation}
            title="Quitter cette conversation"
            aria-label={`Quitter la conversation ${conversation.title}`}
            className="shrink-0"
          >
            Quitter
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
        {pageInfo && messages.length > 0 ? (
          <div className="flex flex-col items-center gap-1.5 pb-1">
            <p role="status" className="m-0 text-[11px] text-muted">
              {pageInfo.loaded} sur {pageInfo.total} messages chargés
            </p>
            {pageInfo.hasMoreBefore && onLoadMore ? (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                aria-label="Charger les messages précédents"
              >
                {isLoadingMore ? 'Chargement…' : `Charger plus (${pageInfo.remainingBefore} restants)`}
              </Button>
            ) : null}
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="m-auto max-w-[320px] text-center text-xs text-muted">
            {conversation.type === 'direct'
              ? `Dites bonjour à ${conversation.title}.`
              : `Lancez la conversation « ${conversation.title} ».`}
          </p>
        ) : (
          messages.map((message) =>
            // Ligne système (départ D-09, arrivée D-11) : annonce centrée atténuée, sans
            // avatar, sans nom, sans actions (ni édition, ni suppression, ni
            // réponse) — le fil lui-même est le signal.
            message.isSystem ? (
              <p
                key={message.id}
                className="mx-auto max-w-[85%] rounded-full bg-surface px-3 py-1 text-center text-[11px] text-muted"
              >
                {message.content}
              </p>
            ) : (
            <Fragment key={message.id}>
            <MessageBubble
              message={message}
              showEdit={Boolean(onEditMessage) && !readOnly && message.isMine && !message.pending}
              showDelete={Boolean(onDeleteMessage) && !readOnly && !message.pending && message.isMine}
              editing={editingId === message.id}
              editDraft={editingId === message.id ? editDraft : message.content}
              onStartEdit={() => {
                setEditingId(message.id);
                setEditDraft(message.content);
              }}
              onEditDraftChange={(value) => {
                setEditingId(message.id);
                setEditDraft(value);
              }}
              onCancelEdit={() => {
                setEditingId(null);
                setEditDraft('');
              }}
              onSaveEdit={saveEditFor(message)}
              onRequestDelete={requestDeleteFor(message)}
            />
            {message.id === lastMineId ? <ReadReceipts readers={readers} /> : null}
            </Fragment>
            ),
          )
        )}
      </div>

      {readOnly ? (
        <p className="m-0 border-t border-border px-3 py-2.5 text-center text-[11px] text-muted">
          Vous avez quitté cette conversation : seuls les messages jusqu’à votre départ restent lisibles, sans
          écriture possible.
        </p>
      ) : (
        <>
      {/* Fil solo (D-11) : indication atténuée au compositeur, sans visuel
          d'alarme — l'envoi reste pleinement permis, la copie dit l'instant
          présent (un futur membre relira l'historique en rejoignant). */}
      {showSoloNotice ? (
        <p role="status" className="m-0 border-t border-border px-3 pt-2 text-center text-[11px] text-muted">
          Vous êtes seul dans cette conversation — aucun autre membre ne peut lire ce message pour l’instant.
        </p>
      ) : null}
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
        <p role="alert" className="m-0 border-t border-border px-3 pt-2 text-[11px] font-semibold text-coral-text">
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
        </>
      )}
      <p className="m-0 flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted">
        <Icon name="wifi" size="sm" />
        Les messages arrivent en temps réel pour les membres du foyer.
      </p>
      <ConfirmDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        title="Supprimer ce message ?"
        description="Ce message disparaîtra pour tous les membres. Cette action est définitive."
        confirmLabel="Supprimer le message"
        onConfirm={() => {
          const target = pendingDeletion;
          setPendingDeletion(null);
          if (!target || !onDeleteMessage) return;
          onDeleteMessage(target.id);
        }}
      />
    </section>
  );
}
