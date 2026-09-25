import { useState } from 'react';
import { ModuleShell, MetricRow, Panel, SectionHeading } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useCercleFeed } from './hooks/use-cercle';
import { PostCard } from './components/post-card';
import { PostComposer } from './components/post-composer';
import { CommentsDialog } from './components/comments-dialog';
import { ROLE_LABELS } from './types';

const MAX_STACK = 3;

export default function CerclePage() {
  const { feed, members, unreadTotal, reactionTotal, isLoading, isError, error, refetch, publish, addComment, toggleReaction, deletePost, canDelete } =
    useCercleFeed();
  const [focusSignal, setFocusSignal] = useState(0);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const commentsPost = feed.find((post) => post.id === commentsPostId) ?? null;
  const pendingDeletePost = feed.find((post) => post.id === pendingDeleteId) ?? null;

  return (
    <ModuleShell
      module="cercle"
      actions={
        <Button icon="plus" onClick={() => setFocusSignal((value) => value + 1)}>
          Publier un moment
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Membres', value: members.length, caption: 'dans le cercle' },
          { label: 'Publications', value: feed.length, caption: 'dans le fil' },
          { label: 'Réactions', value: reactionTotal, caption: 'ce mois-ci' },
          {
            label: 'Notifications',
            value: unreadTotal,
            caption: unreadTotal > 0 ? 'nouveaux commentaires' : 'tout est lu',
          },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_285px] items-start gap-[18px] max-[920px]:grid-cols-1">
        <div className="min-w-0">
          <SectionHeading
            title="Le fil du foyer"
            description="Photos, petites nouvelles et réactions, dans l’ordre où elles arrivent."
            action={unreadTotal > 0 ? <Badge tone="coral">{unreadTotal} non lus</Badge> : <Badge tone="muted">Tout est lu</Badge>}
          />

          <PostComposer onPublish={publish} focusSignal={focusSignal} />

          {isError ? (
            <ErrorState message={error?.message ?? 'Le fil n’a pas pu être chargé.'} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingRows rows={3} />
          ) : feed.length === 0 ? (
            <EmptyState
              icon="people"
              title="Le fil est encore vide"
              description="Soyez la première personne à publier un moment."
              actionLabel="Publier un moment"
              onAction={() => setFocusSignal((value) => value + 1)}
            />
          ) : (
            <div aria-live="polite">
              {feed.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  active={activePostId === post.id}
                  canDelete={canDelete(post)}
                  onSelect={() => setActivePostId(post.id)}
                  onToggleReaction={() => void toggleReaction(post.id)}
                  onOpenComments={() => {
                    setActivePostId(post.id);
                    setCommentsPostId(post.id);
                  }}
                  onRequestDelete={() => setPendingDeleteId(post.id)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-3.5">
          <Panel title="Votre cercle" description="Les membres qui partagent le fil.">
            <div className="flex items-center">
              {members.slice(0, MAX_STACK).map((member) => (
                <MemberAvatar
                  key={member.id}
                  member={member}
                  size="sm"
                  className="-ml-[7px] border-2 border-surface first:ml-0"
                />
              ))}
              {members.length > MAX_STACK ? (
                <span className="-ml-[7px] grid size-[23px] place-items-center rounded-[8px] border-2 border-surface bg-fg text-[9px] font-extrabold text-surface">
                  +{members.length - MAX_STACK}
                  <span className="sr-only">
                    {members.length - MAX_STACK} autre{members.length - MAX_STACK > 1 ? 's' : ''} membre
                    {members.length - MAX_STACK > 1 ? 's' : ''}
                  </span>
                </span>
              ) : null}
            </div>
          </Panel>

          <Panel title="Membres du foyer" description={`${members.length} personne${members.length > 1 ? 's' : ''} sur le fil.`}>
            <div className="grid">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 border-t border-border py-2.5 first:border-0 first:pt-0">
                  <MemberAvatar member={member} size="sm" />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[12px] font-bold">{member.display_name}</strong>
                    <small className="block text-[10px] text-muted">{ROLE_LABELS[member.role]}</small>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="À propos du Cercle" description="Un fil familial, calme et privé.">
            <p className="m-0 text-[12px] leading-[1.55] text-muted">
              Chaque publication peut recevoir des réactions et des commentaires. L’auteur et les administrateurs du foyer
              peuvent retirer une publication, toujours après confirmation.
            </p>
          </Panel>
        </aside>
      </div>

      <CommentsDialog
        post={commentsPost}
        open={commentsPostId !== null}
        onOpenChange={(open) => {
          if (!open) setCommentsPostId(null);
        }}
        onSubmit={addComment}
      />

      <ConfirmDialog
        open={pendingDeletePost !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Supprimer cette publication ?"
        description="Le message, la photo, les commentaires et les réactions associés seront retirés du fil."
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (pendingDeletePost) {
            void deletePost(pendingDeletePost.id);
            if (activePostId === pendingDeletePost.id) setActivePostId(null);
          }
          setPendingDeleteId(null);
        }}
      />
    </ModuleShell>
  );
}
