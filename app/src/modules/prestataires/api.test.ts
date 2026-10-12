import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachmentPathOf,
  createProviderAttachment,
  isAttachmentPath,
  removeProvider,
  removeProviderAttachment,
  resolveAttachmentUrl,
} from './api';

const { dataMocks, storageMocks, supabaseState } = vi.hoisted(() => {
  const dataMocks = {
    list: vi.fn(async () => [] as unknown[]),
    create: vi.fn(async (_table: string, values: Record<string, unknown>) => values),
    update: vi.fn(async () => ({})),
    remove: vi.fn(async () => {}),
    removeWhere: vi.fn(async () => {}),
  };
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  const storageMocks = {
    from: vi.fn((_bucket: string) => ({
      createSignedUrl: storageMocks.createSignedUrl,
      remove: storageMocks.remove,
    })),
    createSignedUrl: vi.fn(async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const supabaseState = { configured: false };
  return { dataMocks, storageMocks, supabaseState };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: dataMocks };
});

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'https://signe.example/depot-initial',
      path: 'foyer/providers/fiche/devis.pdf',
      name: file.name,
      mime: 'application/pdf',
      size: 12,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured ? { storage: storageMocks } : null;
  },
}));

import { removeHouseholdFile } from '@/lib/storage';

const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
  dataMocks.list.mockResolvedValue([]);
  dataMocks.create.mockImplementation(async (_table: string, values: Record<string, unknown>) => values);
    storageMocks.createSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signe.example/${path}` },
      error: null,
    }));
});

function pdf(name = 'devis.pdf'): File {
  return new File(['%PDF'], name, { type: 'application/pdf' });
}

describe('pièces prestataires — hygiène des fichiers (D-03)', () => {
  it('persiste le chemin bucket, jamais l’URL signée', async () => {
    await createProviderAttachment('foyer-1', 'fiche-1', pdf());

    expect(dataMocks.create).toHaveBeenCalledWith(
      'provider_attachments',
      expect.objectContaining({ file_url: 'foyer/providers/fiche/devis.pdf' }),
    );
    const stored = (dataMocks.create.mock.calls[0][1] as Record<string, unknown>).file_url;
    expect(stored).not.toMatch(/^https?:\/\//);
  });

  it('nettoie le dépôt quand l’écriture de la ligne échoue (pas d’orphelin)', async () => {
    dataMocks.create.mockRejectedValueOnce(new Error('RLS refuse'));

    await expect(createProviderAttachment('foyer-1', 'fiche-1', pdf())).rejects.toThrow('RLS refuse');
    expect(removeFileMock).toHaveBeenCalledWith('foyer/providers/fiche/devis.pdf');
  });

  it('forge une URL fraîche à chaque lecture (résilience par construction)', async () => {
    supabaseState.configured = true;

    const first = await resolveAttachmentUrl('foyer/providers/fiche/a.pdf');
    storageMocks.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://signe.example/foyer/providers/fiche/a.pdf?rotation=2' },
      error: null,
    });
    const second = await resolveAttachmentUrl('foyer/providers/fiche/a.pdf');

    expect(first).toBe('https://signe.example/foyer/providers/fiche/a.pdf');
    expect(second).not.toBe(first);
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer/providers/fiche/a.pdf', 60 * 60);
  });

  it('échec fermé : forge impossible → null, jamais de lien mort', async () => {
    supabaseState.configured = true;
    storageMocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'expiré' } });
    expect(await resolveAttachmentUrl('foyer/providers/fiche/a.pdf')).toBeNull();

    // Sans Supabase, un chemin ne peut pas se forger : null aussi.
    supabaseState.configured = false;
    expect(await resolveAttachmentUrl('foyer/providers/fiche/a.pdf')).toBeNull();
  });

  it('laisse passer aperçus locaux et URL http(s) héritées', async () => {
    expect(await resolveAttachmentUrl('blob:apercu')).toBe('blob:apercu');
    expect(await resolveAttachmentUrl('https://signe.example/heritage?token=x')).toBe(
      'https://signe.example/heritage?token=x',
    );
    expect(isAttachmentPath('blob:apercu')).toBe(false);
    expect(isAttachmentPath('https://signe.example/heritage')).toBe(false);
    expect(isAttachmentPath('foyer/providers/fiche/a.pdf')).toBe(true);
    expect(attachmentPathOf('foyer/providers/fiche/a.pdf')).toBe('foyer/providers/fiche/a.pdf');
    expect(attachmentPathOf('blob:apercu')).toBeNull();
    expect(attachmentPathOf(null)).toBeNull();
  });

  it('retrait d’une pièce : lit le chemin, supprime le fichier puis la ligne', async () => {
    dataMocks.list.mockResolvedValueOnce([
      { id: 'pj-1', provider_id: 'fiche-1', file_url: 'foyer/providers/fiche/a.pdf' },
    ]);

    await removeProviderAttachment('pj-1');

    expect(dataMocks.list).toHaveBeenCalledWith('provider_attachments', { id: 'pj-1' });
    expect(removeFileMock).toHaveBeenCalledWith('foyer/providers/fiche/a.pdf');
    expect(dataMocks.remove).toHaveBeenCalledWith('provider_attachments', 'pj-1');
  });

  it('suppression d’une fiche : chaque fichier joint part avec sa ligne', async () => {
    dataMocks.list.mockResolvedValueOnce([
      { id: 'pj-1', provider_id: 'fiche-1', file_url: 'foyer/providers/fiche/a.pdf' },
      { id: 'pj-2', provider_id: 'fiche-1', file_url: 'blob:apercu-demo' },
    ]);

    await removeProvider('fiche-1');

    expect(dataMocks.removeWhere).toHaveBeenCalledWith('provider_attachments', { provider_id: 'fiche-1' });
    expect(removeFileMock).toHaveBeenCalledWith('foyer/providers/fiche/a.pdf');
    expect(removeFileMock).not.toHaveBeenCalledWith('blob:apercu-demo');
    expect(dataMocks.remove).toHaveBeenCalledWith('providers', 'fiche-1');
  });
});
