import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import GuestRecipePage from './guest-recipe-page';
import { fetchGuestRecipeView } from './api';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const CODE = 'code-partage-recette-123456';

const viewPayload = {
  recipeId: 'recipe-1',
  title: 'Gratin dauphinois',
  servings: 4,
  prepMinutes: 30,
  cookMinutes: 45,
  coverPhotoUrl: null,
  category: 'Recettes du foyer',
  ingredients: [
    { id: 'i1', name: 'Pommes de terre', quantity: 500, unit: 'g', position: 0 },
    { id: 'i2', name: 'Sel', quantity: null, unit: 'au goût', position: 1 },
  ],
  steps: [
    { id: 's1', content: 'Éplucher les pommes de terre.', position: 0, photoUrl: null },
    { id: 's2', content: 'Enfourner 45 minutes.', position: 1, photoUrl: null },
  ],
  tags: ['Plat'],
};

/**
 * Même charge, mais l'étape 1 porte une URL signée (ce que sert l'Edge) :
 * c'est le cas où la page DOIT afficher l'image. L'étape 2 reste nue.
 */
const signedStepViewPayload = {
  ...viewPayload,
  steps: [
    { id: 's1', content: 'Éplucher les pommes de terre.', position: 0, photoUrl: 'https://signe.example/step-s1' },
    { id: 's2', content: 'Enfourner 45 minutes.', position: 1, photoUrl: null },
  ],
};

/**
 * La page invitée ne parle qu'à l'Edge (`link-view`) : PostgREST-js passe
 * par `fetch`, donc tout appel direct y laisserait une trace. Le tableau
 * `calls` prouve l'isolement (T-16-10).
 */
function mockViewFetch(calls: string[], ok = true, payload: unknown = viewPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      calls.push(_url as string);
      const body = (JSON.parse((init?.body as string) ?? '{}') as { action?: string; code?: string }) ?? {};
      calls.push(`${body.action ?? '?'}`);
      if (!ok) return { ok: false, json: async () => ({ error: 'Ce lien est invalide.' }) };
      return { ok: true, json: async () => payload };
    }),
  );
}

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/recette" element={<GuestRecipePage />} />
    </Routes>,
    { route: code ? `/invitation/recette?code=${code}` : '/invitation/recette', withHousehold: false },
  );
}

/** Aucun bouton d'édition, d'ajout, de suppression, de partage ni d'export. */
function expectReadOnly() {
  expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Partager/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Exporter|Imprimer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nouvelle recette/ })).not.toBeInTheDocument();
}

describe('GuestRecipePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('affiche la fiche en lecture seule depuis le lien, sans compte', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      expect(await screen.findByRole('heading', { name: 'Gratin dauphinois' })).toBeInTheDocument();
      expect(screen.getByText(/Pommes de terre/)).toBeInTheDocument();
      expect(screen.getByText(/Éplucher les pommes de terre/)).toBeInTheDocument();
      // Curseur et cases suivent (lecture active, pas lecture morte).
      expect(screen.getByLabelText(/Pour 4 personnes/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Marquer l’étape 2 comme faite/ })).toBeInTheDocument();
      expectReadOnly();
      // Seul appel réseau : `link-view` vers l'Edge, jamais PostgREST direct.
      expect(calls.filter((call) => !call.startsWith('http'))).toEqual(['link-view']);
      expect(calls.some((call) => call.includes('/functions/v1/recipe-invite'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('affiche la photo signée d’une étape, sous son texte, en lecture seule', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, true, signedStepViewPayload);
    try {
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      // L'image de l'étape 1 porte EXACTEMENT l'URL signée servie par l'Edge,
      // jamais un chemin de bucket.
      const image = screen.getByRole('img', { name: 'Photo de l’étape 1' });
      expect(image).toHaveAttribute('src', 'https://signe.example/step-s1');
      // L'étape nue (2) ne rend aucun élément média.
      expect(screen.queryByRole('img', { name: 'Photo de l’étape 2' })).not.toBeInTheDocument();
      // Lecture seule : l'image est là, mais aucune commande d'édition.
      expectReadOnly();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('le curseur recalcule les quantités sans compte', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      fireEvent.change(screen.getByLabelText(/Pour 4 personnes/), { target: { value: '8' } });
      expect(await screen.findByText(/1000 g/)).toBeInTheDocument();
      expect(screen.getByText(/au goût/)).toBeInTheDocument();
      expectReadOnly();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propose le formulaire sans code, puis ouvre le lien saisi', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    const user = userEvent.setup();
    try {
      renderGuest(null);
      await user.type(screen.getByLabelText(/Code d’invitation/), CODE);
      await user.click(screen.getByRole('button', { name: 'Voir la recette' }));
      expect(await screen.findByRole('heading', { name: 'Gratin dauphinois' })).toBeInTheDocument();
      expect(calls.filter((call) => !call.startsWith('http'))).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code trop court : garde sans appel réseau', async () => {
    const calls: string[] = [];
    mockViewFetch(calls);
    try {
      renderGuest(null);
      fireEvent.change(screen.getByLabelText(/Code d’invitation/), { target: { value: 'court' } });
      const form = screen.getByLabelText(/Code d’invitation/).closest('form');
      if (!form) throw new Error('formulaire invité absent');
      fireEvent.submit(form);
      expect(await screen.findByText(/semble incomplet/)).toBeInTheDocument();
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien révoqué : message et retour au formulaire', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, false);
    const user = userEvent.setup();
    try {
      renderGuest(CODE);
      expect(await screen.findByText(/ne passe plus/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Réessayer/ }));
      expect(screen.getByLabelText(/Code d’invitation/)).toBeInTheDocument();
      expect(calls.filter((call) => !call.startsWith('http'))).toEqual(['link-view']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien expiré : même oracle, sans distinction d’état', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, false);
    try {
      renderGuest(CODE);
      // L'oracle est unique : révoqué ou expiré rendent exactement le même
      // message, sans détail d'état qui distinguerait les deux cas.
      expect(
        await screen.findByText('Ce lien ne passe plus (lien révoqué ou expiré). Demandez un nouveau lien à l’organisateur.'),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * Échec fermé (T-21-04) : le seul producteur d'URL d'affichage côté client
   * est la valeur `photoUrl` servie par l'Edge. La page ne dérive jamais une
   * URL d'un chemin, ne signe rien et ne complète aucune valeur absente.
   */
  it('une étape dont la charge porte photoUrl: null ne rend aucun élément média', async () => {
    const calls: string[] = [];
    // viewPayload : les deux étapes portent `photoUrl: null`.
    mockViewFetch(calls);
    try {
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      const list = screen.getByRole('list', { name: 'Étapes de la recette' });
      // Compte exact : zéro image, pas une simple absence de vérification.
      expect(within(list).queryAllByRole('img')).toHaveLength(0);
      expectReadOnly();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('une charge qui ne porte que photo_path rend photoUrl: null, sans laisser le chemin dans le DOM', async () => {
    const BUCKET_PATH = 'foyer-1/recipes/r-1/steps/s-1/file-a7f3.jpg';
    const photoPathOnlyPayload = {
      ...viewPayload,
      steps: [
        { id: 's1', content: 'Éplucher les pommes de terre.', position: 0, photo_path: BUCKET_PATH },
        { id: 's2', content: 'Enfourner 45 minutes.', position: 1 },
      ],
    };
    const calls: string[] = [];
    mockViewFetch(calls, true, photoPathOnlyPayload);
    try {
      // La projection lit `photoUrl` (le nom de la charge servie), jamais
      // `photo_path` (le nom de la colonne) : la clé absente rend `null`.
      const projected = await fetchGuestRecipeView(CODE);
      expect(projected.steps[0].photoUrl).toBeNull();
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      // Aucun `src` du DOM ne contient le chemin de bucket — le test tombe si
      // la projection lisait la mauvaise clé.
      expect(document.body.innerHTML).not.toContain(BUCKET_PATH);
      expect(within(screen.getByRole('list', { name: 'Étapes de la recette' })).queryAllByRole('img')).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('une recette mêlant une étape photographiée et une étape nue rend exactement une image', async () => {
    const calls: string[] = [];
    mockViewFetch(calls, true, signedStepViewPayload);
    try {
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      const list = screen.getByRole('list', { name: 'Étapes de la recette' });
      const images = within(list).queryAllByRole('img');
      // La présence de l'une n'entraîne pas l'autre.
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute('src', 'https://signe.example/step-s1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('la carte d’affichage porte une entrée par étape : l’étape nue reste null, aucune URL fabriquée', async () => {
    const BUCKET_PATH = 'foyer-1/recipes/r-1/steps/s-2/file-b9e1.jpg';
    const mixedRawPathPayload = {
      ...viewPayload,
      steps: [
        { id: 's1', content: 'Éplucher les pommes de terre.', position: 0, photoUrl: 'https://signe.example/step-s1' },
        // L'étape 2 porte un chemin brut et pas d'URL : la page ne doit RIEN
        // en fabriquer (ni signature, ni complétion).
        { id: 's2', content: 'Enfourner 45 minutes.', position: 1, photo_path: BUCKET_PATH },
      ],
    };
    const calls: string[] = [];
    mockViewFetch(calls, true, mixedRawPathPayload);
    try {
      renderGuest(CODE);
      await screen.findByRole('heading', { name: 'Gratin dauphinois' });
      const list = screen.getByRole('list', { name: 'Étapes de la recette' });
      // Une entrée par étape : s1 photographiée, s2 nue → exactement une image.
      const images = within(list).queryAllByRole('img');
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute('src', 'https://signe.example/step-s1');
      // La valeur absente n'a pas été complétée : le chemin brut n'apparaît
      // dans aucun `src` du DOM.
      expect(document.body.innerHTML).not.toContain(BUCKET_PATH);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
