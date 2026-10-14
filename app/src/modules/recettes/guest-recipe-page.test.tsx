import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import GuestRecipePage from './guest-recipe-page';

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
    { id: 's1', content: 'Éplucher les pommes de terre.', position: 0 },
    { id: 's2', content: 'Enfourner 45 minutes.', position: 1 },
  ],
  tags: ['Plat'],
};

/**
 * La page invitée ne parle qu'à l'Edge (`link-view`) : PostgREST-js passe
 * par `fetch`, donc tout appel direct y laisserait une trace. Le tableau
 * `calls` prouve l'isolement (T-16-10).
 */
function mockViewFetch(calls: string[], ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      calls.push(_url as string);
      const body = (JSON.parse((init?.body as string) ?? '{}') as { action?: string; code?: string }) ?? {};
      calls.push(`${body.action ?? '?'}`);
      if (!ok) return { ok: false, json: async () => ({ error: 'Ce lien est invalide.' }) };
      return { ok: true, json: async () => viewPayload };
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
});
