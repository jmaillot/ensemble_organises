import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMomentLabel } from '../types';
import { COMMENT_CONTENT_MAX } from '../types';
import type { FeedComment, FeedPost } from '../types';

const schema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Écrivez un commentaire.')
    .max(COMMENT_CONTENT_MAX, `Le commentaire est limité à ${COMMENT_CONTENT_MAX} caractères.`),
});

type CommentValues = z.infer<typeof schema>;

export interface CommentsDialogProps {
  post: FeedPost | null;
  open: boolean;
  currentMemberId: string;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { postId: string; content: string }) => Promise<boolean>;
  onUpdateComment: (commentId: string, content: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

/** Fil de discussion d'une publication, dans une modale accessible. */
export function CommentsDialog({
  post,
  open,
  currentMemberId,
  isAdmin,
  onOpenChange,
  onSubmit,
  onUpdateComment,
  onDeleteComment,
}: CommentsDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CommentValues>({ resolver: zodResolver(schema), defaultValues: { content: '' } });
  const contentValue = watch('content') ?? '';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeedComment | null>(null);

  useEffect(() => {
    if (!open) {
      reset({ content: '' });
      setEditingId(null);
      setEditDraft('');
      setPendingDelete(null);
    }
  }, [open, reset]);

  if (!post) return null;

  const onSubmitComment = handleSubmit(async (values) => {
    const done = await onSubmit({ postId: post.id, content: values.content.trim() });
    if (done) reset({ content: '' });
  });

  const startEdit = (comment: FeedComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (comment: FeedComment) => {
    const message = editDraft.trim();
    if (message === '' || message === comment.content || savingEdit) return;
    setSavingEdit(true);
    const done = await onUpdateComment(comment.id, message);
    setSavingEdit(false);
    if (done) cancelEdit();
  };

  const canDeleteComment = (comment: FeedComment) =>
    comment.authorId === currentMemberId || isAdmin;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commentaires</DialogTitle>
          <DialogDescription>
            {post.commentCount > 0
              ? `${post.commentCount} commentaire${post.commentCount > 1 ? 's' : ''} · ${post.author?.display_name ?? 'Membre du foyer'}`
              : 'Soyez la première personne à répondre.'}
          </DialogDescription>
        </DialogHeader>

        {post.comments.length > 0 ? (
          <ul className="mb-4 grid gap-3">
            {post.comments.map((comment) => {
              const mine = comment.authorId === currentMemberId;
              const editing = editingId === comment.id;
              const editTrimmed = editDraft.trim();
              const canSaveEdit =
                editTrimmed !== '' &&
                editTrimmed.length <= COMMENT_CONTENT_MAX &&
                editTrimmed !== comment.content;
              return (
                <li key={comment.id} className="flex items-start gap-2.5 border-t border-border pt-3 first:border-0 first:pt-0">
                  <MemberAvatar member={comment.author} name={comment.author?.display_name ?? 'Membre'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <strong className="text-[12px] font-bold">{comment.author?.display_name ?? 'Membre du foyer'}</strong>
                      <small className="text-[10px] text-muted">{formatMomentLabel(comment.createdAt)}</small>
                    </div>
                    {editing ? (
                      <form
                        className="grid gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveEdit(comment);
                        }}
                      >
                        <Textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          aria-label="Modifier votre commentaire"
                          autoFocus
                        />
                        <div className="flex items-center justify-between gap-2">
                          <small className="text-[10px] text-muted">
                            {editTrimmed.length} / {COMMENT_CONTENT_MAX} caractères
                            {editTrimmed.length > COMMENT_CONTENT_MAX ? ' — limite dépassée' : ''}
                          </small>
                          <div className="flex justify-end gap-1.5">
                            <Button type="button" variant="quiet" size="sm" onClick={cancelEdit}>
                              Annuler
                            </Button>
                            <Button type="submit" variant="secondary" size="sm" disabled={!canSaveEdit || savingEdit}>
                              {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                            </Button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <p className="m-0 text-[12px] leading-[1.55] text-ink-soft">{comment.content}</p>
                    )}
                    {!editing && (mine || canDeleteComment(comment)) ? (
                      <div className="mt-1 flex justify-end gap-1">
                        {mine ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            icon="edit"
                            onClick={() => startEdit(comment)}
                            aria-label="Modifier ce commentaire"
                          >
                            <span className="sr-only">Modifier</span>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          onClick={() => setPendingDelete(comment)}
                          aria-label="Supprimer ce commentaire"
                          className="text-coral hover:bg-coral-soft hover:text-coral"
                        >
                          <span className="sr-only">Supprimer</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon="comment"
            title="Pas encore de commentaire"
            description="Répondez à cette publication pour lancer la discussion du foyer."
            className="mb-4 min-h-[180px]"
          />
        )}

        <form onSubmit={onSubmitComment} className="grid gap-3" noValidate>
          <Field
            label="Votre commentaire"
            hint={`${contentValue.trim().length} / ${COMMENT_CONTENT_MAX} caractères`}
            error={errors.content?.message}
          >
            {(props) => (
              <Textarea
                {...props}
                {...register('content')}
                className="min-h-[84px]"
                placeholder="Répondre au foyer…"
                aria-label="Répondre au foyer"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            <Button type="submit" icon="send">
              Publier
            </Button>
          </div>
        </form>

      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) setPendingDelete(null);
      }}
      title="Supprimer ce commentaire ?"
      description="Le commentaire sera retiré du fil pour tout le foyer."
      confirmLabel="Supprimer"
      onConfirm={() => {
        if (pendingDelete) void onDeleteComment(pendingDelete.id);
        setPendingDelete(null);
      }}
    />
    </>
  );
}
