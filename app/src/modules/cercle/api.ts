/**
 * Accès aux données du Cercle. Le module passe par l'adaptateur actif
 * (`src/lib/data`) : PostgREST + RLS en ligne, IndexedDB hors ligne. Les
 * suppressions sont explicites en cascade, l'adaptateur n'ayant pas de
 * suppression implicite des lignes enfants.
 */

import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { PostCommentRow, PostMediaRow, PostReactionRow, PostRow } from '@/types';
import type { CompressedImage } from './lib/media';

export const cercleTables = {
  posts: 'posts',
  media: 'post_media',
  comments: 'post_comments',
  reactions: 'post_reactions',
} as const;

/** Bucket privé des médias du Cercle (politiques RLS sur le chemin d'objet). */
export const CERCLES_BUCKET = 'cercle';
/** Durée de validité des URL signées servies par le Storage. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 30;

function requireHousehold(householdId: string | null): string {
  if (!householdId) throw new Error('Aucun foyer sélectionné.');
  return householdId;
}

export function listPosts(householdId: string | null): Promise<PostRow[]> {
  return data.list<PostRow>(cercleTables.posts, { household_id: requireHousehold(householdId) });
}

export function listPostMedia(householdId: string | null): Promise<PostMediaRow[]> {
  return data.list<PostMediaRow>(cercleTables.media, { household_id: requireHousehold(householdId) });
}

export function listPostComments(householdId: string | null): Promise<PostCommentRow[]> {
  return data.list<PostCommentRow>(cercleTables.comments, { household_id: requireHousehold(householdId) });
}

export function listPostReactions(householdId: string | null): Promise<PostReactionRow[]> {
  return data.list<PostReactionRow>(cercleTables.reactions, { household_id: requireHousehold(householdId) });
}

export interface CreatePostInput {
  householdId: string;
  authorId: string;
  text: string;
  image?: CompressedImage | null;
  /** Identifiants préparés par l'appelant : la ligne optimiste est déjà la bonne. */
  id?: string;
  mediaId?: string;
}

/**
 * Dépôt du média : bucket privé en mode Supabase (URL signée), aperçu local en
 * mode démo. La compression a déjà été appliquée côté navigateur.
 */
async function depositMedia(input: { householdId: string; postId: string; image: CompressedImage }): Promise<string> {
  const { householdId, postId, image } = input;
  if (!isSupabaseConfigured || !supabase) return image.previewUrl;
  const path = `${householdId}/${postId}/${randomId('media')}.${image.mime === 'image/webp' ? 'webp' : 'jpg'}`;
  const { error } = await supabase.storage.from(CERCLES_BUCKET).upload(path, image.blob, {
    contentType: image.mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: signed, error: signError } = await supabase.storage
    .from(CERCLES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw new Error(signError.message);
  return signed.signedUrl;
}

export async function createPost({
  householdId,
  authorId,
  text,
  image,
  id,
  mediaId,
}: CreatePostInput): Promise<{ post: PostRow; media: PostMediaRow[] }> {
  const postId = id ?? randomId('post');
  const post = await data.create<PostRow>(cercleTables.posts, {
    id: postId,
    household_id: householdId,
    author_id: authorId,
    text,
    created_at: new Date().toISOString(),
  } as Partial<PostRow>);

  if (!image) return { post, media: [] };

  try {
    const url = await depositMedia({ householdId, postId, image });
    const media = await data.create<PostMediaRow>(cercleTables.media, {
      id: mediaId ?? randomId('post-media'),
      post_id: postId,
      household_id: householdId,
      media_type: 'photo',
      url,
    } as Partial<PostMediaRow>);
    return { post, media: [media] };
  } catch (error) {
    // Média déposé en échec : la publication est annulée pour ne pas laisser un
    // post sans photo, et l'UI remonte l'erreur.
    await data.remove(cercleTables.posts, postId).catch(() => undefined);
    throw error;
  }
}

export async function removePostCascade(input: { householdId: string; postId: string }): Promise<void> {
  const { householdId, postId } = input;
  const [media, comments, reactions] = await Promise.all([
    data.list<PostMediaRow>(cercleTables.media, { household_id: householdId, post_id: postId }),
    data.list<PostCommentRow>(cercleTables.comments, { household_id: householdId, post_id: postId }),
    data.list<PostReactionRow>(cercleTables.reactions, { household_id: householdId, post_id: postId }),
  ]);
  await Promise.all([
    ...media.map((row) => data.remove(cercleTables.media, row.id)),
    ...comments.map((row) => data.remove(cercleTables.comments, row.id)),
    ...reactions.map((row) => data.remove(cercleTables.reactions, row.id)),
    data.remove(cercleTables.posts, postId),
  ]);
}

export async function createComment(input: {
  householdId: string;
  postId: string;
  authorId: string;
  content: string;
  id?: string;
}): Promise<PostCommentRow> {
  return data.create<PostCommentRow>(cercleTables.comments, {
    id: input.id ?? randomId('post-comment'),
    post_id: input.postId,
    household_id: input.householdId,
    author_id: input.authorId,
    content: input.content,
    created_at: new Date().toISOString(),
  } as Partial<PostCommentRow>);
}

export async function createReaction(input: {
  householdId: string;
  postId: string;
  authorId: string;
  type?: string;
  id?: string;
}): Promise<PostReactionRow> {
  return data.create<PostReactionRow>(cercleTables.reactions, {
    id: input.id ?? randomId('post-reaction'),
    post_id: input.postId,
    household_id: input.householdId,
    author_id: input.authorId,
    reaction_type: input.type ?? 'coeur',
    created_at: new Date().toISOString(),
  } as Partial<PostReactionRow>);
}

export function removeReaction(reactionId: string): Promise<void> {
  return data.remove(cercleTables.reactions, reactionId);
}
