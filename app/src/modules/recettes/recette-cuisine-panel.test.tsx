import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { Panel } from '@/components/shared/module-shell';
import RecetteDetailPage from './recette-detail-page';
import GuestRecipePage from './guest-recipe-page';
import { fetchGuestRecipeView } from './api';

/**
 * Gap G-17-2 (D-12) : le toggle Mode cuisine doit rester sur la ligne du
 * titre Étapes en haut à droite du panneau sur mobile. Cause : l'en-tête
 * partagé `Panel` s'empilait en colonne sous 650px
 * (`max-[650px]:flex-col`), faisant tomber le slot action sous la
 * description. Fix : prop opt-in `headerInlineOnMobile` (défaut faux,
 * rendu strictement identique sans prop — T-17-06), consommée par les
 * deux seuls panneaux Étapes (membre + invité).
 *
 * `isSupabaseConfigured` est lu UNE fois à l'import par
 * `lib/data/index.ts` pour figer l'adaptateur : `false` ici (évalué avant
 * les imports via `vi.hoisted`), donc la fiche membre utilise l'adaptateur
 * local. Le describe invité le repasse à `true` (la page invitée le lit à
 * chaque rendu) puis le restaure — même idiome que
 * `guest-recipe-cuisine.test.tsx` et `recette-cuisine.test.tsx`.
 */
const clientConfig = vi.hoisted(() => ({ configured: false }));
vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return clientConfig.configured;
  },
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
  supabaseFunctionsBase: 'http://localhost/functions/v1',
}));

/** La page invitée ne parle qu'à l'Edge via `fetchGuestRecipeView`. */
vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, fetchGuestRecipeView: vi.fn() };
});

const mockedFetchView = vi.mocked(fetchGuestRecipeView);

const STEP_CONTENTS = ['Éplucher les pommes de terre.', 'Les couper en rondelles.', 'Enfourner 45 minutes.'];

/** Fiche + 3 étapes aux ids déterministes (même idiome que `recette-cuisine.test.tsx`). */
async function seedFiche(title: string): Promise<string> {
  const adapter = getLocalAdapter();
  const created = await adapter.create('recipes', {
    household_id: DEMO_HOUSEHOLD_ID,
    title,
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    category_id: null,
    created_at: new Date().toISOString(),
  });
  const recipeId = String((created as unknown as { id: unknown }).id);
  for (let index = 0; index < STEP_CONTENTS.length; index += 1) {
    await adapter.create('recipe_steps', {
      id: `${recipeId}-s${index + 1}`,
      recipe_id: recipeId,
      household_id: DEMO_HOUSEHOLD_ID,
      content: STEP_CONTENTS[index],
      position: index,
    });
  }
  return recipeId;
}

const CODE = 'code-partage-recette-123456';

const viewPayload = {
  recipeId: 'recipe-1',
  title: 'Gratin dauphinois',
  servings: 4,
  prepMinutes: 30,
  cookMinutes: 45,
  coverPhotoUrl: null,
  category: 'Recettes du foyer',
  ingredients: [{ id: 'i1', name: 'Pommes de terre', quantity: 500, unit: 'g', position: 0 }],
  steps: [
    { id: 's1', content: 'Éplucher les pommes de terre.', position: 0 },
    { id: 's2', content: 'Enfourner 45 minutes.', position: 1 },
  ],
  tags: ['Plat'],
};

function headerOf(toggle: HTMLElement): HTMLElement {
  // En-tête = le div porteur des classes `max-[650px]:…` au-dessus du toggle.
  const header = toggle.closest('div[class*="max-[650px]"]');
  if (!(header instanceof HTMLElement)) throw new Error('en-tête Panel introuvable');
  return header;
}

describe('Panel — en-tête inline opt-in (G-17-2)', () => {
  it('défaut sans prop : l’en-tête garde la colonne mobile, rendu inchangé', () => {
    const { container } = render(
      <Panel title="Étapes" description="Une description." action={<button type="button">Mode cuisine</button>}>
        <p>Contenu</p>
      </Panel>,
    );
    const header = container.querySelector('section > div');
    if (!(header instanceof HTMLElement)) throw new Error('en-tête Panel absent');
    expect(header.classList.contains('max-[650px]:flex-col')).toBe(true);
    expect(header.classList.contains('max-[650px]:flex-row')).toBe(false);
    // Bloc titre sans `flex-1`, action rendue nue (zéro wrapper ajouté).
    expect(header.firstElementChild?.className ?? '').not.toContain('flex-1');
  });

  it('opt-in : l’en-tête garde la rangée titre-à-gauche/action-à-droite sous 650px', () => {
    const { container } = render(
      <Panel title="Étapes" description="Une description." headerInlineOnMobile action={<button type="button">Mode cuisine</button>}>
        <p>Contenu</p>
      </Panel>,
    );
    const header = container.querySelector('section > div');
    if (!(header instanceof HTMLElement)) throw new Error('en-tête Panel absent');
    expect(header.classList.contains('max-[650px]:flex-row')).toBe(true);
    expect(header.classList.contains('max-[650px]:flex-col')).toBe(false);
    // Titre rétrécissable prioritaire, action insécable à droite (T-17-07).
    const titleBlock = header.firstElementChild;
    if (!(titleBlock instanceof HTMLElement)) throw new Error('bloc titre absent');
    expect(titleBlock.classList.contains('min-w-0')).toBe(true);
    expect(titleBlock.classList.contains('flex-1')).toBe(true);
    const actionWrapper = header.lastElementChild;
    if (!(actionWrapper instanceof HTMLElement)) throw new Error('wrapper action absent');
    expect(actionWrapper.classList.contains('shrink-0')).toBe(true);
    expect(actionWrapper.textContent).toContain('Mode cuisine');
  });
});

describe('Panneaux Étapes — toggle inline membre + invité (G-17-2, D-12)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    clientConfig.configured = false;
    mockedFetchView.mockReset();
  });

  it('fiche membre : toggle aria-pressed sur la rangée inline du titre Étapes', async () => {
    const recipeId = await seedFiche('Panel inline membre');
    renderWithProviders(
      <Routes>
        <Route path="/recettes/:id" element={<RecetteDetailPage />} />
      </Routes>,
      { route: `/recettes/${recipeId}` },
    );

    const toggle = await screen.findByRole('button', { name: 'Mode cuisine' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const header = headerOf(toggle);
    expect(header.classList.contains('max-[650px]:flex-row')).toBe(true);
    expect(header.classList.contains('max-[650px]:flex-col')).toBe(false);

    // Le toggle reste intact : un clic bascule aria-pressed sans toucher l'en-tête.
    const user = userEvent.setup();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(header.classList.contains('max-[650px]:flex-row')).toBe(true);
  });

  it('page invitée : même toggle inline, même aria-pressed', async () => {
    clientConfig.configured = true;
    mockedFetchView.mockResolvedValue(viewPayload);
    try {
      renderWithProviders(
        <Routes>
          <Route path="/invitation/recette" element={<GuestRecipePage />} />
        </Routes>,
        { route: `/invitation/recette?code=${CODE}`, withHousehold: false },
      );

      const toggle = await screen.findByRole('button', { name: 'Mode cuisine' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      const header = headerOf(toggle);
      expect(header.classList.contains('max-[650px]:flex-row')).toBe(true);
      expect(header.classList.contains('max-[650px]:flex-col')).toBe(false);
    } finally {
      clientConfig.configured = false;
    }
  });
});
