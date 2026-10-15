import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ArdoiseRow } from '@/types';
import ArdoisePage from './ardoise-page';
import ArdoiseDetailPage from './ardoise-detail-page';

/**
 * Médias de l'Ardoise (WR-08/WR-10, phase 19) : la colonne `cover_url` porte un
 * CHEMIN, l'URL signée est forgée à l'affichage, et l'objet suit la vie de sa
 * ligne. Le dépôt est simulé pour renvoyer un chemin ET une URL signée
 * distincts : sans cela, la preuve « la colonne reçoit un chemin » serait
 * incapable d'échouer (les deux valeurs se confondraient).
 */
const { storageMocks, supabaseState } = vi.hoisted(() => {
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  return {
    storageMocks: {
      createSignedUrl: vi.fn(
        async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null }),
      ),
      remove: vi.fn(async () => ({ error: null })),
    },
    supabaseState: { configured: false },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    if (!supabaseState.configured) return null;
    return {
      storage: {
        from: (_bucket: string) => ({
          createSignedUrl: storageMocks.createSignedUrl,
          remove: storageMocks.remove,
        }),
      },
      functions: { invoke: async () => ({ data: null, error: null }) },
      rpc: async () => ({ data: null, error: null }),
      auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) },
    };
  },
  supabaseFunctionsBase: null,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'https://signe.example/foyer-1/ardoises/couverture.webp',
      path: 'foyer-1/ardoises/couverture.webp',
      name: file.name,
      mime: 'image/webp',
      size: 12,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});

import { removeHouseholdFile } from '@/lib/storage';

const removeFileMock = vi.mocked(removeHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
});

async function ardoiseRow(id: string): Promise<ArdoiseRow | undefined> {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  const rows = await getLocalAdapter().list<ArdoiseRow>('ardoises', { household_id: DEMO_HOUSEHOLD_ID });
  return rows.find((row) => row.id === id);
}

describe('ArdoisePage — liste', () => {
  it('affiche les ardoises du foyer de démonstration', async () => {
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    expect(await screen.findByText('Ardoise du foyer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer une ardoise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeInTheDocument();
  });

  it('crée une ardoise depuis le dialogue', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end ski');
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end ski')).toBeInTheDocument();
  });

  it('propose une photo de couverture optionnelle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Photo de couverture/)).toBeInTheDocument();
    // Optionnelle : la création reste possible sans photo.
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end sans photo');
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end sans photo')).toBeInTheDocument();
  });

  it('crée une ardoise avec une sélection de membres', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/ardoise" element={<ArdoisePage />} />
        <Route path="/ardoise/:id" element={<ArdoiseDetailPage />} />
      </Routes>,
      { route: '/ardoise' },
    );

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end restreint');
    // Thomas exclu : tout le monde est coché par défaut.
    await user.click(within(dialog).getByRole('checkbox', { name: /Thomas/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    expect(await screen.findByText('Week-end restreint')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Inviter un membre' }));
    const membersDialog = await screen.findByRole('dialog', { name: /Membres de/ });
    expect(within(membersDialog).getByText('Dans l’ardoise (3)')).toBeInTheDocument();
    expect(within(membersDialog).getByText('Ajouter (1)')).toBeInTheDocument();
  });

  it('affiche la photo de couverture en fond dans la liste', async () => {
    const { updateArdoise } = await import('./api');
    await updateArdoise('ardoise-foyer', { cover_url: 'https://exemple.fr/cover.jpg' });
    try {
      const { container } = renderWithProviders(<ArdoisePage />, { route: '/ardoise' });
      await screen.findByText('Ardoise du foyer');
      const photo = container.querySelector('img[src="https://exemple.fr/cover.jpg"]');
      expect(photo).not.toBeNull();
    } finally {
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });

  it('ouvre le dialogue rejoindre avec un code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Rejoindre' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/code/i);
  });
});

/**
 * WR-08 côté liste : la valeur ÉCRITE est la valeur de colonne (un chemin), et
 * la valeur AFFICHÉE est l'URL forgée à la lecture. Le dépôt simulé renvoie les
 * deux formes distinctes, donc chaque assertion peut échouer.
 */
describe('ArdoisePage — couverture : chemins et URLs (WR-08)', () => {
  it('écrit la couverture déposée en chemin, jamais l’URL signée du dépôt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    await user.click(await screen.findByRole('button', { name: 'Créer une ardoise' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nom de l’ardoise/), 'Week-end photo');
    await user.upload(
      within(dialog).getByLabelText(/Photo de couverture/),
      new File(['pixels'], 'plage.jpg', { type: 'image/jpeg' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’ardoise' }));

    await screen.findByText('Week-end photo');
    const created = await waitFor(async () => {
      const { getLocalAdapter } = await import('@/lib/data/local-adapter');
      const rows = await getLocalAdapter().list<ArdoiseRow>('ardoises', { household_id: DEMO_HOUSEHOLD_ID });
      const row = rows.find((candidate) => candidate.name === 'Week-end photo');
      expect(row).toBeDefined();
      return row as ArdoiseRow;
    });

    expect(created.cover_url).toBe('foyer-1/ardoises/couverture.webp');
    expect(created.cover_url).not.toMatch(/^https?:\/\//);
  });

  it('signe le chemin stocké à l’affichage (backend présent)', async () => {
    const { updateArdoise } = await import('./api');
    supabaseState.configured = true;
    await updateArdoise('ardoise-foyer', { cover_url: 'foyer-1/ardoises/plage.webp' });
    try {
      const { container } = renderWithProviders(<ArdoisePage />, { route: '/ardoise' });
      await screen.findByText('Ardoise du foyer');

      await waitFor(() =>
        expect(container.querySelector('img[src="https://signe.example/foyer-1/ardoises/plage.webp"]')).not.toBeNull(),
      );
      // Le chemin brut ne doit jamais atteindre le DOM (lien mort).
      expect(container.querySelector('img[src="foyer-1/ardoises/plage.webp"]')).toBeNull();
      expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('foyer-1/ardoises/plage.webp', expect.any(Number));
    } finally {
      supabaseState.configured = false;
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });

  it('affiche une couverture externe héritée telle quelle, sans appel de signature', async () => {
    const { updateArdoise } = await import('./api');
    supabaseState.configured = true;
    await updateArdoise('ardoise-foyer', { cover_url: 'https://externe.example/photo.jpg' });
    try {
      const { container } = renderWithProviders(<ArdoisePage />, { route: '/ardoise' });
      await screen.findByText('Ardoise du foyer');

      expect(container.querySelector('img[src="https://externe.example/photo.jpg"]')).not.toBeNull();
      expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
    } finally {
      supabaseState.configured = false;
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });
});

/**
 * WR-10 côté fiche : le brouillon part de la valeur STOCKÉE (un chemin), jamais
 * de la valeur affichée (une URL signée) — sinon chaque enregistrement de nom
 * écrirait une URL éphémère dans une colonne que le reste du dépôt lit comme un
 * chemin (WR-05 de la phase 18, à ne pas réintroduire). Le remplacement, lui,
 * retire l'objet précédent après une écriture réussie (D-03).
 */
describe('ArdoiseDetailPage — Paramètres : la couverture suit sa ligne (WR-10)', () => {
  function renderDetail() {
    return renderWithProviders(
      <Routes>
        <Route path="/ardoise/:id" element={<ArdoiseDetailPage />} />
      </Routes>,
      { route: '/ardoise/ardoise-foyer' },
    );
  }

  async function openParametres() {
    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Paramètres' }));
    await screen.findByRole('heading', { name: 'Paramètres' });
    return user;
  }

  it('réenregistrer sans nouvelle couverture réécrit la valeur stockée, jamais l’URL affichée', async () => {
    const { updateArdoise } = await import('./api');
    supabaseState.configured = true;
    await updateArdoise('ardoise-foyer', { cover_url: 'foyer-1/ardoises/plage.webp' });
    try {
      const user = await openParametres();
      // L'écran montre bien l'URL signée…
      expect(await screen.findByRole('img', { name: /Couverture de/ })).toHaveAttribute(
        'src',
        'https://signe.example/foyer-1/ardoises/plage.webp',
      );

      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await screen.findByText('Ardoise mise à jour.');

      // … mais la colonne conserve le chemin : aucune URL signée n'y est écrite,
      // et l'objet n'est pas retiré puisqu'il n'a pas été remplacé.
      expect((await ardoiseRow('ardoise-foyer'))?.cover_url).toBe('foyer-1/ardoises/plage.webp');
      expect(removeFileMock).not.toHaveBeenCalled();
    } finally {
      supabaseState.configured = false;
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });

  it('remplacer la couverture persiste un chemin et retire l’objet précédent', async () => {
    const { updateArdoise } = await import('./api');
    await updateArdoise('ardoise-foyer', { cover_url: 'foyer-1/ardoises/ancienne.webp' });
    try {
      const user = await openParametres();
      await user.upload(
        screen.getByLabelText(/Photo de couverture/),
        new File(['pixels'], 'nouvelle.jpg', { type: 'image/jpeg' }),
      );
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await screen.findByText('Ardoise mise à jour.');

      expect((await ardoiseRow('ardoise-foyer'))?.cover_url).toBe('foyer-1/ardoises/couverture.webp');
      expect(removeFileMock).toHaveBeenCalledWith('foyer-1/ardoises/ancienne.webp');
    } finally {
      await updateArdoise('ardoise-foyer', { cover_url: null });
    }
  });
});
