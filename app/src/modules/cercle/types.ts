/**
 * Types métier du Cercle : le fil familial (publications, médias, commentaires
 * et réactions) et les mappers depuis les lignes SQL.
 */

import { daysBetween, formatMediumDate, todayIso, toIsoDate } from '@/lib/utils';
import { isUnseen } from '@/lib/notification-reads';
import { displayablePhoto } from '@/modules/anniversaires/types';
import type { HouseholdMemberRow, PostCommentRow, PostMediaRow, PostReactionRow, PostRow } from '@/types';
import type { CompressedImage } from './lib/media';

export type PostMediaKind = 'photo' | 'video';

export interface PostMedia {
  id: string;
  postId: string;
  kind: PostMediaKind;
  /**
   * URL affichable (signée à la lecture), `null` en échec fermé — jamais le
   * chemin brut du bucket dans le DOM (D-01, WR-08). Une forme non-chemin
   * (aperçu `blob:` du mode démo, URL http(s) héritée) est rendue telle quelle.
   */
  url: string | null;
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
  /** Fil inédit d'un autre membre, jamais ouvert (0 commentaire possible). */
  isNew: boolean;
}

export interface PublishInput {
  text: string;
  image?: CompressedImage | null;
}

/**
 * Plafonds miroirs des CHECK base (0004 : posts.text 4000,
 * post_comments.content 2000). Le client reflète la base, jamais l'inverse.
 */
export const POST_TEXT_MAX = 4000;
export const COMMENT_CONTENT_MAX = 2000;

export const ROLE_LABELS: Record<HouseholdMemberRow['role'], string> = {
  admin: 'Admin',
  membre: 'Membre',
  enfant: 'Enfant',
};

/**
 * Média du fil (D-01) : la colonne porte le chemin du bucket, l'URL affichable
 * est forgée à la lecture par la carte de résolution (`displayablePhoto`, point
 * unique de 19-07). Une forme non-chemin — URL externe héritée, aperçu `blob:`
 * de la publication optimiste — est rendue telle quelle ; un chemin non résolu
 * rend `null` (échec fermé, jamais un lien mort).
 */
export function toPostMedia(row: PostMediaRow, resolved: Record<string, string> = {}): PostMedia {
  return { id: row.id, postId: row.post_id, kind: row.media_type, url: displayablePhoto(row.url, resolved, row.id) };
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

export function toPost(row: PostRow): Omit<FeedPost, 'author' | 'media' | 'comments' | 'commentCount' | 'reactionCount' | 'liked' | 'unreadComments' | 'isNew'> {
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
  /** Lecture par publication : les commentaires plus récents sont « non lus ». */
  readAt: (postId: string) => string;
  /**
   * Médias résolus à la lecture, indexés par `post_media.id` (D-01) : un chemin
   * de bucket y trouve son URL signée ; absent, la résolution est un échec
   * fermé (`null`).
   */
  resolvedMedia?: Record<string, string>;
}

/**
 * Assemble le fil à partir des quatre tables. Les publications sont triées du
 * plus récent au plus ancien ; les commentaires restent en ordre chronologique.
 */
export function composeFeed({ posts, media, comments, reactions, members, currentMemberId, readAt, resolvedMedia = {} }: FeedInput): FeedPost[] {
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
        media: (mediaByPost.get(row.id) ?? []).map((mediaRow) => toPostMedia(mediaRow, resolvedMedia)),
        comments: postComments.map((comment) => ({
          ...comment,
          author: memberById.get(comment.authorId) ?? null,
        })),
        commentCount: postComments.length,
        reactionCount: postReactions.length,
        liked: postReactions.some((reaction) => reaction.authorId === currentMemberId),
        unreadComments: postComments.filter(
          (comment) => comment.authorId !== currentMemberId && isUnseen(comment.createdAt, readAt(row.id)),
        ).length,
        mine: row.author_id === currentMemberId,
        isNew: row.author_id !== currentMemberId && isUnseen(row.created_at, readAt(row.id)),
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
