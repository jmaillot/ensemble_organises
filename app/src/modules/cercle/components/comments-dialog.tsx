import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMomentLabel } from '../types';
import type { FeedPost } from '../types';

const schema = z.object({
  content: z.string().trim().min(1, 'Écrivez un commentaire.').max(400, 'Le commentaire est limité à 400 caractères.'),
});

type CommentValues = z.infer<typeof schema>;

export interface CommentsDialogProps {
  post: FeedPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { postId: string; content: string }) => Promise<boolean>;
}

/** Fil de discussion d'une publication, dans une modale accessible. */
export function CommentsDialog({ post, open, onOpenChange, onSubmit }: CommentsDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CommentValues>({ resolver: zodResolver(schema), defaultValues: { content: '' } });

  useEffect(() => {
    if (!open) reset({ content: '' });
  }, [open, reset]);

  if (!post) return null;

  const onSubmitComment = handleSubmit(async (values) => {
    const done = await onSubmit({ postId: post.id, content: values.content.trim() });
    if (done) reset({ content: '' });
  });

  return (
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
            {post.comments.map((comment) => (
              <li key={comment.id} className="flex items-start gap-2.5 border-t border-border pt-3 first:border-0 first:pt-0">
                <MemberAvatar member={comment.author} name={comment.author?.display_name ?? 'Membre'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <strong className="text-[12px] font-bold">{comment.author?.display_name ?? 'Membre du foyer'}</strong>
                    <small className="text-[10px] text-muted">{formatMomentLabel(comment.createdAt)}</small>
                  </div>
                  <p className="m-0 text-[12px] leading-[1.55] text-ink-soft">{comment.content}</p>
                </div>
              </li>
            ))}
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
          <Field label="Votre commentaire" error={errors.content?.message}>
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
  );
}
