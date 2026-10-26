/**
 * Hook du Cercle : lecture composée du fil (publications, médias, commentaires,
 * réactions), abonnement temps réel et mutations optimistes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { queryKeys } from '@/lib/data/useResource';
import { isHouseholdMediaPath, resolveHouseholdMediaUrls } from '@/lib/storage';
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
  removeComment,
  removePostCascade,
  removeReaction,
  updateCommentContent,
  updatePostText,
} from '../api';
import { composeFeed, type FeedComment, type FeedPost, type PublishInput } from '../types';
import { useSyncedReads } from '@/lib/notification-reads';

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
  updatePost: (postId: string, text: string) => Promise<boolean>;
  updateComment: (commentId: string, content: string) => Promise<boolean>;
  deletePost: (postId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  canDelete: (post: FeedPost) => boolean;
  canEditPost: (post: FeedPost) => boolean;
  canDeleteComment: (comment: FeedComment) => boolean;
  canEditComment: (comment: FeedComment) => boolean;
  /** D-12 : faux pour un enfant géré — l'écran masque alors le composeur. */
  canPublish: boolean;
  /** Marque les commentaires d'une publication comme lus, sur tous les appareils. */
  markPostRead: (postId: string) => void;
}

/** Clé du miroir local des lectures du Cercle (repli hors ligne). */
export const CERCLE_READ_KEY = 'ensemble-organises-cercle-read';

export function useCercleFeed(): CercleFeed {
  const queryClient = useQueryClient();
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const members = useMembers();
  const isAdmin = useIsAdmin();
  const enabled = Boolean(householdId);

  // La visite courante sert de référence par défaut : sans marque explicite,
  // tout commentaire postérieur est « non lu », comme avant la synchronisation.
  const [mountAt, setMountAt] = useState(() => new Date().toISOString());
  useEffect(() => {
    setMountAt(new Date().toISOString());
  }, [householdId]);
  const { readMap: postReads, markRead: markPostRead } = useSyncedReads('post', CERCLE_READ_KEY);
  const readAt = useCallback((postId: string) => postReads[postId] ?? mountAt, [postReads, mountAt]);

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

  // Les médias portent des CHEMINS (D-01) : on forge les URL signées à la
  // lecture, en échec fermé (annulation stricte, jamais d'état éventé). Les
  // formes non-chemin (aperçu `blob:` de la publication optimiste, URL
  // héritée) ne passent pas par l'effet — `displayablePhoto` les rend telles
  // quelles, ce qui garde la publication instantanée.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mediaRows = media.data;
  useEffect(() => {
    const pending = (mediaRows ?? [])
      .filter((row) => isHouseholdMediaPath(row.url))
      .map((row) => ({ id: row.id, file_url: row.url }));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveHouseholdMediaUrls(pending).then((resolved) => {
      if (!cancelled) setMediaUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaRows]);

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
        readAt,
        resolvedMedia: mediaUrls,
      }),
    [posts.data, media.data, comments.data, reactions.data, members, currentMemberId, readAt, mediaUrls],
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

  const updatePost = useCallback(
    async (postId: string, text: string) => {
      if (!householdId) return false;
      const message = text.trim();
      const previous = queryClient.getQueryData<PostRow[]>(cercleKeys.posts(householdId)) ?? [];
      queryClient.setQueryData<PostRow[]>(cercleKeys.posts(householdId), (rows) =>
        (rows ?? []).map((row) => (row.id === postId ? { ...row, text: message } : row)),
      );
      try {
        await updatePostText(postId, message);
        await invalidate();
        toast('Publication modifiée.');
        return true;
      } catch (error) {
        queryClient.setQueryData<PostRow[]>(cercleKeys.posts(householdId), previous);
        toast(error instanceof Error ? error.message : 'Modification impossible.', 'error');
        return false;
      }
    },
    [householdId, invalidate, queryClient, toast],
  );

  const updateComment = useCallback(
    async (commentId: string, content: string) => {
      if (!householdId) return false;
      const message = content.trim();
      const previous = queryClient.getQueryData<PostCommentRow[]>(cercleKeys.comments(householdId)) ?? [];
      queryClient.setQueryData<PostCommentRow[]>(cercleKeys.comments(householdId), (rows) =>
        (rows ?? []).map((row) => (row.id === commentId ? { ...row, content: message } : row)),
      );
      try {
        await updateCommentContent(commentId, message);
        await invalidate();
        toast('Commentaire modifié.');
        return true;
      } catch (error) {
        queryClient.setQueryData<PostCommentRow[]>(cercleKeys.comments(householdId), previous);
        toast(error instanceof Error ? error.message : 'Modification impossible.', 'error');
        return false;
      }
    },
    [householdId, invalidate, queryClient, toast],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!householdId) return;
      try {
        await removeComment(commentId);
        await invalidate();
        toast('Commentaire supprimé.');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Suppression impossible.', 'error');
      }
    },
    [householdId, invalidate, toast],
  );

  // D-07 : suppression unitaire strictement auteur pour le contenu adulte —
  // D-12 : les adultes (admin OU membre, useIsAdult) modèrent en plus le
  // contenu d'un enfant géré. Le rôle de l'auteur vient de la liste vivante
  // du store ; une ligne archivée n'y est plus, la règle retombe sur l'auteur
  // — les gardes réelles restent en base (0146), l'UI ne fait qu'afficher.
  const currentRole = members.find((member) => member.id === currentMemberId)?.role;
  const isAdult = currentRole === 'admin' || currentRole === 'membre';
  const canDelete = useCallback(
    (post: FeedPost) => {
      if (!isAdult) return post.mine;
      const authorRole = members.find((member) => member.id === post.authorId)?.role;
      return authorRole === 'enfant' || post.mine;
    },
    [isAdult, members],
  );

  // D-12 : un enfant géré ne publie pas — l'écran n'affiche donc aucun
  // composeur. La prohibition réelle est l'absence de politique INSERT côté
  // serveur (0146) ; ce drapeau n'ôte qu'une UI morte.
  const canPublish = isAdult;

  const canEditPost = useCallback((post: FeedPost) => post.mine, []);

  // D-12 (symétrie WR-05) : un adulte modère aussi les COMMENTAIRES d'un
  // enfant géré, exactement comme canDelete le fait pour les posts — la
  // politique post_comments_delete_admin (0149) l'autorise en base, l'UI
  // n'affichait jamais le bouton. Le rôle de l'auteur vient de la liste
  // vivante du store, même contrat que canDelete.
  const canDeleteComment = useCallback(
    (comment: FeedComment) => {
      if (!isAdult) return comment.authorId === currentMemberId;
      const authorRole = members.find((member) => member.id === comment.authorId)?.role;
      return authorRole === 'enfant' || comment.authorId === currentMemberId;
    },
    [isAdult, members, currentMemberId],
  );

  const canEditComment = useCallback(
    (comment: FeedComment) => comment.authorId === currentMemberId,
    [currentMemberId],
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
    updatePost,
    updateComment,
    deletePost,
    deleteComment,
    canDelete,
    canEditPost,
    canDeleteComment,
    canEditComment,
    markPostRead,
    canPublish,
  };
}
