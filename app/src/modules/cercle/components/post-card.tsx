import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Badge } from '@/components/ui/primitives';
import { pluralize } from '@/lib/utils';
import { COMMENT_CONTENT_MAX, POST_TEXT_MAX, type FeedComment, type FeedPost } from '../types';

/**
 * Réponses inline (D-06) : les N derniers commentaires sous chaque carte,
 * présentation seule — l'envoi réutilise le verbe create-comment existant.
 */
export const INLINE_COMMENT_COUNT = 2;

export interface PostCardProps {
  post: FeedPost;
  active: boolean;
  canDelete: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onToggleReaction: () => void;
  onOpenComments: () => void;
  onRequestDelete: () => void;
  onSaveEdit: (postId: string, text: string) => Promise<boolean>;
  /** Contexte d'auteur pour les affordances inline (mêmes grilles que le dialogue). */
  currentMemberId?: string;
  /** Verbe create-comment existant — absent = pas de compositeur inline (rendu direct en test). */
  onSubmitComment?: (input: { postId: string; content: string }) => Promise<boolean>;
  onUpdateComment?: (commentId: string, content: string) => Promise<boolean>;
  onDeleteComment?: (commentId: string) => Promise<void>;
}

function PostCardComponent({
  post,
  active,
  canDelete,
  canEdit,
  onSelect,
  onToggleReaction,
  onOpenComments,
  onRequestDelete,
  onSaveEdit,
  currentMemberId,
  onSubmitComment,
  onUpdateComment,
  onDeleteComment,
}: PostCardProps) {
  const authorName = post.author?.display_name ?? 'Membre du foyer';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [saving, setSaving] = useState(false);
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= POST_TEXT_MAX && trimmed !== post.text;

  // Compositeur de réponse inline : même plafond (2000) et même verbe que le dialogue.
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const replyTrimmed = reply.trim();
  const replyOverCap = replyTrimmed.length > COMMENT_CONTENT_MAX;

  // Édition/suppression inline : mêmes grilles auteur-seul (D-07) que le dialogue.
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [pendingDeleteComment, setPendingDeleteComment] = useState<FeedComment | null>(null);

  const startEdit = () => {
    setDraft(post.text);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const done = await onSaveEdit(post.id, trimmed);
    setSaving(false);
    if (done) setEditing(false);
  };

  const submitReply = async () => {
    if (!onSubmitComment || sending) return;
    const message = reply.trim();
    if (message === '') return;
    if (message.length > COMMENT_CONTENT_MAX) {
      setReplyError(`Le commentaire est limité à ${COMMENT_CONTENT_MAX} caractères.`);
      return;
    }
    setSending(true);
    setReplyError(null);
    const done = await onSubmitComment({ postId: post.id, content: message });
    setSending(false);
    if (done) {
      setReply('');
      setReplyError(null);
    }
  };

  const startCommentEdit = (comment: FeedComment) => {
    setEditingCommentId(comment.id);
    setCommentDraft(comment.content);
  };

  const saveCommentEdit = async (comment: FeedComment) => {
    if (!onUpdateComment) return;
    const message = commentDraft.trim();
    if (message === '' || message === comment.content || savingComment) return;
    if (message.length > COMMENT_CONTENT_MAX) return;
    setSavingComment(true);
    const done = await onUpdateComment(comment.id, message);
    setSavingComment(false);
    if (done) {
      setEditingCommentId(null);
      setCommentDraft('');
    }
  };

  const canEditInline = (comment: FeedComment) =>
    Boolean(onUpdateComment) && comment.authorId === currentMemberId;
  const canDeleteInline = (comment: FeedComment) =>
    Boolean(onDeleteComment) && comment.authorId === currentMemberId;

  const visibleComments = post.comments.slice(-INLINE_COMMENT_COUNT);
  const hiddenCount = post.commentCount - visibleComments.length;

  return (
    <>
      <article
        data-post-id={post.id}
        data-active={active ? 'true' : undefined}
        onClick={onSelect}
        onFocusCapture={onSelect}
        className={cn(
          'panel-surface mb-3.5 rounded-[22px] p-[18px] transition-[border-color,box-shadow] duration-[var(--duration-quick)] hover:shadow-md min-[651px]:p-[22px]',
          active && 'border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]',
        )}
      >
        <div className="mb-3.5 flex items-center gap-2.5">
          <MemberAvatar member={post.author} name={authorName} size="md" />
          <div className="min-w-0 flex-1">
            <strong className="block text-[14px] font-bold">{authorName}</strong>
            <small className="block text-[11px] text-muted">{post.createdLabel}</small>
          </div>
          {post.unreadComments > 0 ? (
            <Badge tone="coral">
              {post.unreadComments > 1 ? `${post.unreadComments} nouveaux commentaires` : '1 nouveau commentaire'}
            </Badge>
          ) : null}
          {canEdit && !editing ? (
            <Button
              variant="ghost"
              size="sm"
              icon="edit"
              onClick={(event) => {
                event.stopPropagation();
                startEdit();
              }}
              aria-label={`Modifier la publication de ${authorName}`}
              className="text-muted hover:bg-accent-faint hover:text-fg"
            >
              <span className="sr-only">Modifier</span>
            </Button>
          ) : null}
          {canDelete && !editing ? (
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete();
              }}
              aria-label={`Supprimer la publication de ${authorName}`}
              className="text-muted hover:bg-coral-soft hover:text-coral"
            >
              <span className="sr-only">Supprimer</span>
            </Button>
          ) : null}
        </div>

        {editing ? (
          <form
            className="mb-[13px] grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              aria-label="Modifier votre publication"
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <small className="text-[10px] text-muted">
                {trimmed.length} / {POST_TEXT_MAX} caractères
                {trimmed.length > POST_TEXT_MAX ? ' — limite dépassée' : ''}
              </small>
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="quiet" size="sm" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="secondary" size="sm" disabled={!canSave || saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </form>
        ) : post.text ? (
          <p className="mb-[13px] text-[13.5px] leading-[1.6]">{post.text}</p>
        ) : null}

        {post.media.map((media) =>
          // `url` est nulle en échec fermé (signature refusée, D-01) : on
          // n'insère ni `<img src="null">` ni `<video src="null">` — l'image
          // manque, elle ne devient pas un lien mort.
          media.url === null ? null : media.kind === 'video' ? (
            <video
              key={media.id}
              className="mb-[13px] max-h-[420px] w-full rounded-[18px] bg-bg object-contain"
              src={media.url}
              controls
              preload="metadata"
              aria-label={`Vidéo de ${authorName}`}
            />
          ) : (
            <img
              key={media.id}
              className="mb-[13px] max-h-[420px] w-full rounded-[18px] bg-bg object-contain"
              src={media.url}
              alt={`Publication de ${authorName}`}
              loading="lazy"
            />
          ),
        )}

        {visibleComments.length > 0 ? (
          <ul
            aria-label={`Derniers commentaires sur la publication de ${authorName}`}
            className="my-[13px] grid gap-2 rounded-[16px] bg-bg py-3 px-3.5"
          >
            {visibleComments.map((comment) => {
              const commentAuthor = comment.author?.display_name ?? 'Membre';
              const editingComment = editingCommentId === comment.id;
              const commentTrimmed = commentDraft.trim();
              const canSaveComment =
                commentTrimmed !== '' &&
                commentTrimmed.length <= COMMENT_CONTENT_MAX &&
                commentTrimmed !== comment.content;
              return (
                <li key={comment.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[11px] text-ink-soft">
                  <strong className="text-fg">{commentAuthor}</strong>
                  <div className="min-w-0">
                    {editingComment ? (
                      <form
                        className="grid gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void saveCommentEdit(comment);
                        }}
                      >
                        <Textarea
                          value={commentDraft}
                          onChange={(event) => setCommentDraft(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Modifier votre commentaire"
                          autoFocus
                        />
                        <div className="flex items-center justify-between gap-2">
                          <small className="text-[10px] text-muted">
                            {commentTrimmed.length} / {COMMENT_CONTENT_MAX} caractères
                            {commentTrimmed.length > COMMENT_CONTENT_MAX ? ' — limite dépassée' : ''}
                          </small>
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="quiet"
                              size="sm"
                              onClick={() => {
                                setEditingCommentId(null);
                                setCommentDraft('');
                              }}
                            >
                              Annuler
                            </Button>
                            <Button type="submit" variant="secondary" size="sm" disabled={!canSaveComment || savingComment}>
                              {savingComment ? 'Enregistrement…' : 'Enregistrer'}
                            </Button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <span>{comment.content}</span>
                    )}
                    {!editingComment && (canEditInline(comment) || canDeleteInline(comment)) ? (
                      <div className="mt-1 flex justify-end gap-1">
                        {canEditInline(comment) ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            icon="edit"
                            onClick={(event) => {
                              event.stopPropagation();
                              startCommentEdit(comment);
                            }}
                            aria-label="Modifier ce commentaire"
                          >
                            <span className="sr-only">Modifier</span>
                          </Button>
                        ) : null}
                        {canDeleteInline(comment) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteComment(comment);
                            }}
                            aria-label="Supprimer ce commentaire"
                            className="text-coral hover:bg-coral-soft hover:text-coral"
                          >
                            <span className="sr-only">Supprimer</span>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenComments();
            }}
            className="mb-[13px] text-[11px] font-bold text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Tous les commentaires ({post.commentCount})
          </button>
        ) : null}

        {onSubmitComment ? (
          <form
            className="mb-[13px] flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void submitReply();
            }}
          >
            <label htmlFor={`reply-${post.id}`} className="sr-only">
              Répondre à {authorName}
            </label>
            <input
              id={`reply-${post.id}`}
              type="text"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="Répondre…"
              aria-label={`Répondre à ${authorName}`}
              className="min-h-9 min-w-0 flex-1 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              icon="send"
              disabled={replyTrimmed === '' || replyOverCap || sending}
              aria-label={`Envoyer la réponse à ${authorName}`}
            >
              <span className="sr-only">Envoyer</span>
            </Button>
          </form>
        ) : null}
        {replyOverCap || replyError ? (
          <small role={replyError ? 'alert' : undefined} className="mb-[13px] block text-[10px] text-coral">
            {replyError ?? `Le commentaire est limité à ${COMMENT_CONTENT_MAX} caractères.`}
          </small>
        ) : null}

        <div className="mt-1 flex gap-2 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleReaction();
            }}
            aria-pressed={post.liked}
            aria-label={post.liked ? 'Retirer ma réaction' : 'Réagir à cette publication'}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[11.5px] font-bold text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:text-coral hover:bg-coral-soft',
              post.liked && 'border-coral/40 bg-coral-soft text-coral',
            )}
          >
            <Icon name="heart" size="sm" />
            {post.reactionCount > 0 ? pluralize(post.reactionCount, 'réaction') : 'Réagir'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenComments();
            }}
            aria-label="Ouvrir les commentaires"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[11.5px] font-bold text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
          >
            <Icon name="comment" size="sm" />
            {post.commentCount > 0 ? pluralize(post.commentCount, 'commentaire') : 'Commenter'}
          </button>
        </div>
      </article>

      <ConfirmDialog
        open={pendingDeleteComment !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDeleteComment(null);
        }}
        title="Supprimer ce commentaire ?"
        description="Le commentaire sera retiré du fil pour tout le foyer."
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (pendingDeleteComment && onDeleteComment) void onDeleteComment(pendingDeleteComment.id);
          setPendingDeleteComment(null);
        }}
      />
    </>
  );
}

export const PostCard = memo(PostCardComponent);
