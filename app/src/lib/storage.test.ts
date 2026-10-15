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

const {
  depositHouseholdFile,
  formatBytes,
  householdMediaPathOf,
  isHouseholdMediaPath,
  isImageMime,
  replacedMediaPath,
  resolveHouseholdMediaUrl,
  resolveHouseholdMediaUrls,
  storedValueOf,
} = await import('./storage');

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

describe('valeur de colonne et résolution des médias du foyer (D-01)', () => {
  beforeEach(() => {
    state.configured = true;
    state.upload.mockReset().mockResolvedValue({ error: null });
    state.createSignedUrl
      .mockReset()
      .mockResolvedValue({ data: { signedUrl: 'https://stockage/signe' }, error: null });
  });

  it('le chemin du bucket est la valeur de colonne ; l’URL ne sert qu’en démo', () => {
    expect(
      storedValueOf({ url: 'https://signe.example/expire', path: 'foyer-1/notes/n/ordonnance.pdf', name: 'ordonnance.pdf', mime: 'application/pdf', size: 12 }),
    ).toBe('foyer-1/notes/n/ordonnance.pdf');
    expect(
      storedValueOf({ url: 'blob:apercu-demo', path: null, name: 'ordonnance.pdf', mime: 'application/pdf', size: 12 }),
    ).toBe('blob:apercu-demo');
    // Une valeur blanche est rendue telle quelle, sans valeur inventée.
    expect(
      storedValueOf({ url: '  ', path: '', name: 'vide.pdf', mime: 'application/pdf', size: 0 }),
    ).toBe('');
  });

  it('distingue un chemin de bucket des formes affichables héritées', () => {
    expect(isHouseholdMediaPath('foyer-1/notes/n/ordonnance.pdf')).toBe(true);
    expect(isHouseholdMediaPath('https://signe.example/x?token=1')).toBe(false);
    expect(isHouseholdMediaPath('HTTP://exemple.fr/signe')).toBe(false);
    expect(isHouseholdMediaPath('data:image/png;base64,AAAA')).toBe(false);
    expect(isHouseholdMediaPath('blob:apercu')).toBe(false);
    expect(isHouseholdMediaPath('/assets/ordonnance.png')).toBe(false);
  });

  it('normalise une valeur blanche : rien à signer, rien à retirer', () => {
    expect(householdMediaPathOf('  foyer-1/notes/n/a.pdf  ')).toBe('foyer-1/notes/n/a.pdf');
    expect(householdMediaPathOf('   ')).toBeNull();
    expect(householdMediaPathOf('')).toBeNull();
    expect(householdMediaPathOf(null)).toBeNull();
    expect(householdMediaPathOf('https://signe.example/x')).toBeNull();
  });

  it('forge une URL signée à la lecture, en échec fermé', async () => {
    expect(await resolveHouseholdMediaUrl('foyer-1/notes/n/a.pdf')).toBe('https://stockage/signe');
    expect(state.createSignedUrl).toHaveBeenCalledWith('foyer-1/notes/n/a.pdf', 60 * 60 * 24 * 30);

    // Formes non-chemin : rendues telles quelles, jamais signées.
    expect(await resolveHouseholdMediaUrl('blob:apercu-demo')).toBe('blob:apercu-demo');
    expect(await resolveHouseholdMediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    // Valeur blanche : `null`, et aucune signature tentée.
    state.createSignedUrl.mockClear();
    expect(await resolveHouseholdMediaUrl('  ')).toBeNull();
    expect(state.createSignedUrl).not.toHaveBeenCalled();
  });

  it('forge impossible → null, jamais un lien mort vers le DOM', async () => {
    state.createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error('expiré') });
    expect(await resolveHouseholdMediaUrl('foyer-1/notes/n/a.pdf')).toBeNull();

    state.configured = false;
    expect(await resolveHouseholdMediaUrl('foyer-1/notes/n/a.pdf')).toBeNull();
  });

  it('forge chaque ligne en une passe, en omettant les échecs', async () => {
    state.createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'https://stockage/a' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('refus') });

    const resolved = await resolveHouseholdMediaUrls([
      { id: 'pj-a', file_url: 'foyer-1/notes/n/a.pdf' },
      { id: 'pj-b', file_url: 'foyer-1/notes/n/b.pdf' },
    ]);

    expect(resolved).toEqual({ 'pj-a': 'https://stockage/a' });
  });

  it('remplacement : le chemin précédent est retiré tant qu’il diffère de la suite', () => {
    expect(replacedMediaPath('foyer-1/places/a.webp', 'foyer-1/places/b.webp')).toBe('foyer-1/places/a.webp');
    // Retrait (valeur suivante blanche) : c’est un remplacement par rien.
    expect(replacedMediaPath('foyer-1/places/a.webp', '')).toBe('foyer-1/places/a.webp');
    expect(replacedMediaPath('foyer-1/places/a.webp', null)).toBe('foyer-1/places/a.webp');
    // Même valeur : rien à retirer (c’est le défaut WR-05).
    expect(replacedMediaPath('foyer-1/places/a.webp', 'foyer-1/places/a.webp')).toBeNull();
    // Formes non-chemin : jamais un objet de bucket.
    expect(replacedMediaPath('https://signe.example/a?token=1', 'foyer-1/places/b.webp')).toBeNull();
    expect(replacedMediaPath('data:image/png;base64,AAAA', null)).toBeNull();
    expect(replacedMediaPath('  ', null)).toBeNull();
    expect(replacedMediaPath(null, null)).toBeNull();
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
