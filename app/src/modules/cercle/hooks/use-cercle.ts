/**
 * Hook du Cercle : lecture composée du fil (publications, médias, commentaires,
 * réactions), abonnement temps réel et mutations optimistes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { queryKeys } from '@/lib/data/useResource';
import { useHouseholdStore, useIsAdmin, useMembers } from '@/stores/household-store';
import type { HouseholdMemberRow, PostCommentRow, PostMediaRow, PostReactionRow, PostRow } from '@/types';
import { useToast } from '@/components/ui/toast';
import { randomId } from '@/lib/utils';
import {
  cercleTables,
  createComment,
  createPost,
  createReaction,
  listPostComments,
  listPostMedia,
  listPostReactions,
  listPosts,
  removePostCascade,
  removeReaction,
} from '../api';
import { composeFeed, type FeedPost, type PublishInput } from '../types';

export const cercleKeys = {
  all: ['cercle'] as const,
  posts: (householdId: string | null) => ['cercle', 'posts', householdId] as const,
  media: (householdId: string | null) => ['cercle', 'media', householdId] as const,
  comments: (householdId: string | null) => ['cercle', 'comments', householdId] as const,
  reactions: (householdId: string | null) => ['cercle', 'reactions', householdId] as const,
};

export interface CercleFeed {
  feed: FeedPost[];
  members: HouseholdMemberRow[];
  currentMemberId: string;
  isAdmin: boolean;
  unreadTotal: number;
  reactionTotal: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  publish: (input: PublishInput) => Promise<boolean>;
  addComment: (input: { postId: string; content: string }) => Promise<boolean>;
  toggleReaction: (postId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  canDelete: (post: FeedPost) => boolean;
}

export function useCercleFeed(): CercleFeed {
  const queryClient = useQueryClient();
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const members = useMembers();
  const isAdmin = useIsAdmin();
  const enabled = Boolean(householdId);

  // La visite courante sert de référence : tout commentaire postérieur est « non lu ».
  const [lastVisitAt, setLastVisitAt] = useState(() => new Date().toISOString());
  useEffect(() => {
    setLastVisitAt(new Date().toISOString());
  }, [householdId]);

  const posts = useQuery({
    queryKey: cercleKeys.posts(householdId),
    enabled,
    queryFn: () => listPosts(householdId),
  });
  const media = useQuery({
    queryKey: cercleKeys.media(householdId),
    enabled,
    queryFn: () => listPostMedia(householdId),
  });
  const comments = useQuery({
    queryKey: cercleKeys.comments(householdId),
    enabled,
    queryFn: () => listPostComments(householdId),
  });
  const reactions = useQuery({
    queryKey: cercleKeys.reactions(householdId),
    enabled,
    queryFn: () => listPostReactions(householdId),
  });

  /**
   * Rafraîchit le fil : la clé globale `tableAll` (contrat de la couche data)
   * est invalidée en plus des clés du module, pour rester interopérable avec
   * les ressources génériques.
   */
  const invalidateTable = useCallback(
    async (table: string) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(table) });
      await queryClient.invalidateQueries({ queryKey: cercleKeys.all });
    },
    [queryClient],
  );

  const invalidate = useCallback(
    async () => Promise.all((Object.values(cercleTables) as string[]).map((table) => invalidateTable(table))),
    [invalidateTable],
  );

  // Temps réel : une écriture de n'importe quel membre invalide le fil.
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = (Object.values(cercleTables) as string[]).map((table) =>
      data.subscribe(table, () => {
        void invalidateTable(table);
      }),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [enabled, invalidateTable]);

  const feed = useMemo(
    () =>
      composeFeed({
        posts: posts.data ?? [],
        media: media.data ?? [],
        comments: comments.data ?? [],
        reactions: reactions.data ?? [],
        members,
        currentMemberId,
        lastVisitAt,
      }),
    [posts.data, media.data, comments.data, reactions.data, members, currentMemberId, lastVisitAt],
  );

  const unreadTotal = useMemo(
    () => feed.reduce((total, post) => total + post.unreadComments, 0),
    [feed],
  );
  const reactionTotal = useMemo(
    () => feed.reduce((total, post) => total + post.reactionCount, 0),
    [feed],
  );

  const publish = useCallback(
    async ({ text, image }: PublishInput) => {
      if (!householdId) return false;
      const postId = randomId('post');
      const mediaId = `${postId}-media`;
      const now = new Date().toISOString();
      const optimisticPost: PostRow = {
        id: postId,
        household_id: householdId,
        author_id: currentMemberId,
        text,
        created_at: now,
      };
      const optimisticMedia: PostMediaRow[] = image
        ? [
            {
              id: mediaId,
              post_id: postId,
              household_id: householdId,
              media_type: 'photo',
              url: image.previewUrl,
            },
          ]
        : [];

      // Publication optimiste : le post apparaît immédiatement en tête de fil.
      queryClient.setQueryData<PostRow[]>(cercleKeys.posts(householdId), (previous) => [
        optimisticPost,
        ...(previous ?? []),
      ]);
      if (optimisticMedia.length > 0) {
        queryClient.setQueryData<PostMediaRow[]>(cercleKeys.media(householdId), (previous) => [
          ...optimisticMedia,
          ...(previous ?? []),
        ]);
      }

      try {
        const { post, media: createdMedia } = await createPost({
          householdId,
          authorId: currentMemberId,
          text,
          image,
          id: postId,
          mediaId,
        });
        queryClient.setQueryData<PostRow[]>(cercleKeys.posts(householdId), (previous) =>
          (previous ?? []).map((row) => (row.id === postId ? post : row)),
        );
        if (createdMedia.length > 0) {
          queryClient.setQueryData<PostMediaRow[]>(cercleKeys.media(householdId), (previous) => [
            ...(previous ?? []).filter((row) => row.post_id !== postId),
            ...createdMedia,
          ]);
        }
        await invalidate();
        toast('Publication partagée avec le foyer.', 'success');
        return true;
      } catch (error) {
        queryClient.setQueryData<PostRow[]>(cercleKeys.posts(householdId), (previous) =>
          (previous ?? []).filter((row) => row.id !== postId),
        );
        queryClient.setQueryData<PostMediaRow[]>(cercleKeys.media(householdId), (previous) =>
          (previous ?? []).filter((row) => row.post_id !== postId),
        );
        toast(error instanceof Error ? error.message : 'Publication impossible.', 'error');
        return false;
      }
    },
    [currentMemberId, householdId, invalidate, queryClient, toast],
  );

  const addComment = useCallback(
    async ({ postId, content }: { postId: string; content: string }) => {
      if (!householdId) return false;
      const commentId = randomId('post-comment');
      const now = new Date().toISOString();
      const optimistic: PostCommentRow = {
        id: commentId,
        post_id: postId,
        household_id: householdId,
        author_id: currentMemberId,
        content,
        created_at: now,
      };
      queryClient.setQueryData<PostCommentRow[]>(cercleKeys.comments(householdId), (previous) => [
        ...(previous ?? []),
        optimistic,
      ]);
      try {
        const created = await createComment({
          householdId,
          postId,
          authorId: currentMemberId,
          content,
          id: commentId,
        });
        queryClient.setQueryData<PostCommentRow[]>(cercleKeys.comments(householdId), (previous) =>
          (previous ?? []).map((row) => (row.id === commentId ? created : row)),
        );
        await invalidate();
        return true;
      } catch (error) {
        queryClient.setQueryData<PostCommentRow[]>(cercleKeys.comments(householdId), (previous) =>
          (previous ?? []).filter((row) => row.id !== commentId),
        );
        toast(error instanceof Error ? error.message : 'Commentaire impossible.', 'error');
        return false;
      }
    },
    [currentMemberId, householdId, invalidate, queryClient, toast],
  );

  const toggleReaction = useCallback(
    async (postId: string) => {
      if (!householdId) return;
      // Le cache optimiste fait foi : un double-clic rapide s'annule correctement.
      const cached = queryClient.getQueryData<PostReactionRow[]>(cercleKeys.reactions(householdId)) ?? [];
      const existing = cached.find((row) => row.post_id === postId && row.author_id === currentMemberId);
      const reactionId = randomId('post-reaction');
      queryClient.setQueryData<PostReactionRow[]>(cercleKeys.reactions(householdId), (previous) =>
        existing ? (previous ?? []).filter((row) => row.id !== existing.id) : [
            ...(previous ?? []),
            {
              id: reactionId,
              post_id: postId,
              household_id: householdId,
              author_id: currentMemberId,
              reaction_type: 'coeur',
              created_at: new Date().toISOString(),
            },
          ],
      );
      try {
        if (existing) await removeReaction(existing.id);
        else await createReaction({ householdId, postId, authorId: currentMemberId, id: reactionId });
        await invalidate();
      } catch (error) {
        await invalidate();
        toast(error instanceof Error ? error.message : 'Réaction impossible.', 'error');
      }
    },
    [currentMemberId, householdId, invalidate, queryClient, toast],
  );

  const deletePost = useCallback(
    async (postId: string) => {
      if (!householdId) return;
      try {
        await removePostCascade({ householdId, postId });
        await invalidate();
        toast('Publication supprimée.');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Suppression impossible.', 'error');
      }
    },
    [householdId, invalidate, toast],
  );

  const canDelete = useCallback(
    (post: FeedPost) => post.mine || isAdmin,
    [isAdmin],
  );

  const isLoading = posts.isLoading || media.isLoading || comments.isLoading || reactions.isLoading;
  const isMutating = posts.isFetching || comments.isFetching || reactions.isFetching;

  return {
    feed,
    members,
    currentMemberId,
    isAdmin,
    unreadTotal,
    reactionTotal,
    isLoading,
    isError: posts.isError,
    error: (posts.error as Error | null) ?? null,
    refetch: () => void posts.refetch(),
    isMutating,
    publish,
    addComment,
    toggleReaction,
    deletePost,
    canDelete,
  };
}
