import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Badge } from '@/components/ui/primitives';
import { pluralize } from '@/lib/utils';
import type { FeedPost } from '../types';

export interface PostCardProps {
  post: FeedPost;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onToggleReaction: () => void;
  onOpenComments: () => void;
  onRequestDelete: () => void;
}

function PostCardComponent({
  post,
  active,
  canDelete,
  onSelect,
  onToggleReaction,
  onOpenComments,
  onRequestDelete,
}: PostCardProps) {
  const authorName = post.author?.display_name ?? 'Membre du foyer';
  return (
    <article
      data-post-id={post.id}
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
      onFocusCapture={onSelect}
      className={cn(
        'panel-surface mb-3.5 rounded-[16px] p-[18px] transition-[border-color,background] duration-[var(--duration-quick)]',
        active && 'border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]',
      )}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <MemberAvatar member={post.author} name={authorName} size="md" />
        <div className="min-w-0 flex-1">
          <strong className="block text-[13px] font-bold">{authorName}</strong>
          <small className="block text-[10px] text-muted">{post.createdLabel}</small>
        </div>
        {post.unreadComments > 0 ? (
          <Badge tone="coral">
            {post.unreadComments > 1 ? `${post.unreadComments} nouveaux commentaires` : '1 nouveau commentaire'}
          </Badge>
        ) : null}
        {canDelete ? (
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

      {post.text ? <p className="mb-[13px] text-[13px] leading-[1.6]">{post.text}</p> : null}

      {post.media.map((media) =>
        media.kind === 'video' ? (
          <video
            key={media.id}
            className="mb-[13px] max-h-[420px] w-full rounded-[13px] bg-bg object-contain"
            src={media.url}
            controls
            preload="metadata"
            aria-label={`Vidéo de ${authorName}`}
          />
        ) : (
          <img
            key={media.id}
            className="mb-[13px] max-h-[420px] w-full rounded-[13px] bg-bg object-contain"
            src={media.url}
            alt={`Publication de ${authorName}`}
            loading="lazy"
          />
        ),
      )}

      {post.comments.length > 0 ? (
        <div className="my-[13px] grid gap-2 rounded-[11px] bg-bg py-2.5 px-3">
          {post.comments.slice(-2).map((comment) => (
            <div key={comment.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[11px] text-ink-soft">
              <strong className="text-fg">{comment.author?.display_name ?? 'Membre'}</strong>
              <span>{comment.content}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleReaction();
          }}
          aria-pressed={post.liked}
          aria-label={post.liked ? 'Retirer ma réaction' : 'Réagir à cette publication'}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-[9px] bg-bg px-2.5 text-[11px] font-bold text-muted transition-colors duration-[var(--duration-quick)] hover:text-coral hover:bg-coral-soft',
            post.liked && 'bg-coral-soft text-coral',
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
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] bg-bg px-2.5 text-[11px] font-bold text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
        >
          <Icon name="comment" size="sm" />
          {post.commentCount > 0 ? pluralize(post.commentCount, 'commentaire') : 'Commenter'}
        </button>
      </div>
    </article>
  );
}

export const PostCard = memo(PostCardComponent);
