import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostMediaRow } from '@/types';
import { createPost, removePostCascade } from './api';
import { toPostMedia } from './types';

/**
 * WR-08/D-01 — le Cercle est le dernier module qui persistait une URL signée
 * (TTL 30 j). La colonne `post_media.url` porte désormais le CHEMIN du bucket ;
 * l'URL est forgée à la lecture (`toPostMedia` + `resolveHouseholdMediaUrls`,
 * point unique de 19-01). L'écriture ne signe plus rien elle-même, et le
 * retrait d'objet suit la suppression de ligne (D-03, WR-10).
 */
const { mockCreate, mockList, mockRemove, mockUpload, mockCreateSignedUrl, mockRemoveFile } = vi.hoisted(() => ({
  mockCreate: vi.fn(async (_table: string, values: Record<string, unknown>) => ({ created_at: '2026-10-15T00:00:00Z', ...values })),
  mockList: vi.fn(async (_table?: string, _filter?: Record<string, unknown>): Promise<unknown[]> => []),
  mockRemove: vi.fn(async () => {}),
  mockUpload: vi.fn(async () => ({ error: null })),
  mockCreateSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signe.example/media.jpg?token=expire' }, error: null })),
  mockRemoveFile: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { list: mockList, create: mockCreate, remove: mockRemove } };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl, remove: mockRemoveFile }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockImplementation(async () => []);
});

function compressed() {
  return {
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    mime: 'image/webp',
    name: 'moment.webp',
    originalName: 'moment.jpg',
    size: 3,
    width: 10,
    height: 10,
    previewUrl: 'blob:moment',
  };
}

async function published() {
  await createPost({ householdId: 'hh-1', authorId: 'camille', text: 'Au lac.', image: compressed(), id: 'post-1', mediaId: 'media-1' });
}

describe('createPost — la colonne média porte le CHEMIN (D-01, WR-08)', () => {
  it('écrit un chemin de bucket dans `post_media.url`, jamais une URL signée', async () => {
    await published();

    const [table, values] = mockCreate.mock.calls[1] as [string, Record<string, unknown>];
    expect(table).toBe('post_media');
    expect(String(values.url)).toMatch(/^hh-1\/post-1\/media_[^/]+\.(webp|jpg)$/);
    expect(String(values.url)).not.toMatch(/^https?:/);
    // L'écriture ne signe rien : la signature n'existe qu'à la lecture.
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('signe à la lecture : un chemin rend l’URL forgée, un échec rend `null`', () => {
    const row: PostMediaRow = { id: 'media-1', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'hh-1/post-1/media_x.webp' };

    expect(toPostMedia(row, { 'media-1': 'https://signe.example/media-x' }).url).toBe('https://signe.example/media-x');
    // Échec fermé : jamais le chemin brut dans le DOM.
    expect(toPostMedia(row, {}).url).toBeNull();
  });

  it('rend telle quelle une forme non-chemin (aperçu `blob:`, URL héritée)', () => {
    const preview: PostMediaRow = { id: 'media-2', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'blob:moment' };
    const legacy: PostMediaRow = { id: 'media-3', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'https://externe.example/x.jpg' };

    expect(toPostMedia(preview, {}).url).toBe('blob:moment');
    expect(toPostMedia(legacy, {}).url).toBe('https://externe.example/x.jpg');
  });
});

describe('removePostCascade — les médias partent avec la publication (D-03, WR-10)', () => {
  it('retire l’objet de chaque média, après les lignes', async () => {
    mockList.mockImplementation(async (table?: string) =>
      table === 'post_media'
        ? [
            { id: 'media-1', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'hh-1/post-1/a.webp' },
            { id: 'media-2', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'hh-1/post-1/b.webp' },
          ]
        : [],
    );

    await removePostCascade({ householdId: 'hh-1', postId: 'post-1' });

    expect(mockRemoveFile).toHaveBeenCalledTimes(2);
    expect(mockRemoveFile).toHaveBeenCalledWith(['hh-1/post-1/a.webp']);
    expect(mockRemoveFile).toHaveBeenCalledWith(['hh-1/post-1/b.webp']);
    // D-03 : la ligne part d'abord, l'objet ensuite.
    expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(mockRemoveFile.mock.invocationCallOrder[0]);
  });

  it('n’essaie pas de retirer une valeur qui n’est pas un chemin de bucket', async () => {
    mockList.mockImplementation(async (table?: string): Promise<unknown[]> =>
      table === 'post_media'
        ? [{ id: 'media-1', post_id: 'post-1', household_id: 'hh-1', media_type: 'photo', url: 'https://externe.example/x.jpg' }]
        : [],
    );

    await removePostCascade({ householdId: 'hh-1', postId: 'post-1' });

    expect(mockRemoveFile).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('posts', 'post-1');
  });

  it('une publication sans média ne fait aucun retrait', async () => {
    await removePostCascade({ householdId: 'hh-1', postId: 'post-1' });

    expect(mockRemoveFile).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('posts', 'post-1');
  });
});
