/**
 * Types métier du Cercle : le fil familial (publications, médias, commentaires
 * et réactions) et les mappers depuis les lignes SQL.
 */

import { daysBetween, formatMediumDate, todayIso, toIsoDate } from '@/lib/utils';
import type { HouseholdMemberRow, PostCommentRow, PostMediaRow, PostReactionRow, PostRow } from '@/types';
import type { CompressedImage } from './lib/media';

export type PostMediaKind = 'photo' | 'video';

export interface PostMedia {
  id: string;
  postId: string;
  kind: PostMediaKind;
  url: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

/** Commentaire du fil, auteur résolu via `household_members`. */
export interface FeedComment extends PostComment {
  author: HouseholdMemberRow | null;
}

export interface PostReaction {
  id: string;
  postId: string;
  authorId: string;
  type: string;
}

/** Publication enrichie : auteur, médias, compteurs et état de lecture. */
export interface FeedPost {
  id: string;
  authorId: string;
  author: HouseholdMemberRow | null;
  text: string;
  createdAt: string;
  createdLabel: string;
  media: PostMedia[];
  comments: FeedComment[];
  commentCount: number;
  reactionCount: number;
  liked: boolean;
  unreadComments: number;
  mine: boolean;
}

export interface PublishInput {
  text: string;
  image?: CompressedImage | null;
}

export const ROLE_LABELS: Record<HouseholdMemberRow['role'], string> = {
  admin: 'Admin',
  membre: 'Membre',
  enfant: 'Enfant',
};

export function toPostMedia(row: PostMediaRow): PostMedia {
  return { id: row.id, postId: row.post_id, kind: row.media_type, url: row.url };
}

export function toPostComment(row: PostCommentRow): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function toPostReaction(row: PostReactionRow): PostReaction {
  return { id: row.id, postId: row.post_id, authorId: row.author_id, type: row.reaction_type };
}

export function toPost(row: PostRow): Omit<FeedPost, 'author' | 'media' | 'comments' | 'commentCount' | 'reactionCount' | 'liked' | 'unreadComments'> {
  return {
    id: row.id,
    authorId: row.author_id,
    text: row.text,
    createdAt: row.created_at,
    createdLabel: formatMomentLabel(row.created_at),
    mine: false,
  };
}

/** « Il y a 18 min », « Hier », puis la date courte au-delà d’une semaine. */
export function formatMomentLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatMediumDate(iso);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = daysBetween(toIsoDate(date), todayIso());
  if (days <= 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  return formatMediumDate(iso);
}

export interface FeedInput {
  posts: PostRow[];
  media: PostMediaRow[];
  comments: PostCommentRow[];
  reactions: PostReactionRow[];
  members: HouseholdMemberRow[];
  currentMemberId: string;
  /** Date de la dernière visite : les commentaires plus récents sont « non lus ». */
  lastVisitAt: string;
}

/**
 * Assemble le fil à partir des quatre tables. Les publications sont triées du
 * plus récent au plus ancien ; les commentaires restent en ordre chronologique.
 */
export function composeFeed({ posts, media, comments, reactions, members, currentMemberId, lastVisitAt }: FeedInput): FeedPost[] {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const mediaByPost = groupBy(media, (row) => row.post_id);
  const commentsByPost = groupBy(comments, (row) => row.post_id);
  const reactionsByPost = groupBy(reactions, (row) => row.post_id);

  return [...posts]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => {
      const postComments = [...(commentsByPost.get(row.id) ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(toPostComment);
      const postReactions = (reactionsByPost.get(row.id) ?? []).map(toPostReaction);
      return {
        ...toPost(row),
        author: memberById.get(row.author_id) ?? null,
        media: (mediaByPost.get(row.id) ?? []).map(toPostMedia),
        comments: postComments.map((comment) => ({
          ...comment,
          author: memberById.get(comment.authorId) ?? null,
        })),
        commentCount: postComments.length,
        reactionCount: postReactions.length,
        liked: postReactions.some((reaction) => reaction.authorId === currentMemberId),
        unreadComments: postComments.filter(
          (comment) => comment.createdAt > lastVisitAt && comment.authorId !== currentMemberId,
        ).length,
        mine: row.author_id === currentMemberId,
      };
    });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(key(row));
    if (bucket) bucket.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}
