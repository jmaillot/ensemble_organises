import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  configured: true,
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  get supabase() {
    if (!state.configured) return null;
    return {
      storage: {
        from: () => ({ upload: state.upload, createSignedUrl: state.createSignedUrl }),
      },
    };
  },
  supabaseUrl: 'https://api.exemple.fr',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseFunctionsBase: 'https://api.exemple.fr/functions/v1',
}));

const { depositHouseholdFile, formatBytes, isImageMime } = await import('./storage');

const pdf = () => new File(['%PDF-1.4'], 'ordonnance.pdf', { type: 'application/pdf' });
const image = () =>
  new File([new Uint8Array([1, 2, 3])], 'nala.jpg', { type: 'image/jpeg' });

describe('dépôt de fichiers du foyer', () => {
  beforeEach(() => {
    state.configured = true;
    state.upload.mockReset().mockResolvedValue({ error: null });
    state.createSignedUrl
      .mockReset()
      .mockResolvedValue({ data: { signedUrl: 'https://stockage/signe' }, error: null });
    // jsdom n'implémente pas `URL.createObjectURL` (aperçus locaux).
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:apercu-test') });
  });

  it('refuse les types hors images et PDF avant tout envoi', async () => {
    const exe = new File(['x'], 'outil.exe', { type: 'application/x-msdownload' });
    await expect(depositHouseholdFile({ householdId: 'foyer', folder: 'notes/note', file: exe })).rejects.toThrow(
      /images et les PDF/,
    );
    expect(state.upload).not.toHaveBeenCalled();
  });

  it('dépose un PDF tel quel sous le foyer et renvoie l’URL signée', async () => {
    const deposited = await depositHouseholdFile({ householdId: 'foyer-a', folder: 'pets/pet-1', file: pdf() });

    expect(state.upload).toHaveBeenCalledOnce();
    const [path, blob, options] = state.upload.mock.calls[0] as [string, Blob, { contentType: string }];
    expect(path.startsWith('foyer-a/pets/pet-1/')).toBe(true);
    expect(path.endsWith('.pdf')).toBe(true);
    expect(options.contentType).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(deposited).toMatchObject({ url: 'https://stockage/signe', name: 'ordonnance.pdf', mime: 'application/pdf' });
  });

  it('fait passer les images par la compression avant envoi', async () => {
    const deposited = await depositHouseholdFile({ householdId: 'foyer-a', folder: 'pets/pet-1', file: image() });

    const [, , options] = state.upload.mock.calls[0] as [string, Blob, { contentType: string }];
    expect(options.contentType).toMatch(/^image\//);
    expect(deposited.mime).toMatch(/^image\//);
  });

  it('remonte les erreurs du Storage au lieu de laisser une ligne sans fichier', async () => {
    state.upload.mockResolvedValue({ error: new Error('quota dépassé') });
    await expect(depositHouseholdFile({ householdId: 'foyer-a', folder: 'notes/note-1', file: pdf() })).rejects.toThrow(
      /quota dépassé/,
    );
  });

  it('revient à un aperçu local en mode démo', async () => {
    state.configured = false;
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:apercu') });

    const deposited = await depositHouseholdFile({ householdId: 'foyer-a', folder: 'notes/note-1', file: pdf() });
    expect(deposited.url).toBe('blob:apercu');
    expect(state.upload).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe('libellés de pièces jointes', () => {
  it('formate les tailles à la française', () => {
    expect(formatBytes(0)).toBe('0 Ko');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,5 Mo');
  });

  it('distingue images et documents', () => {
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
  });
});
