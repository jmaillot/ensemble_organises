import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import GuestRecipePage from './guest-recipe-page';
import RecetteDetailPage from './recette-detail-page';
import { fetchGuestRecipeView } from './api';

/**
 * `isSupabaseConfigured` est lu UNE fois à l'import par `lib/data/index.ts`
 * pour figer l'adaptateur : `false` ici (évalué avant les imports via
 * `vi.hoisted`), donc la fiche membre utilise l'adaptateur local comme
 * `recette-cuisine.test.tsx`. Les describes invités le repassent à `true`
 * en `beforeEach` — la page invitée le lit à chaque rendu.
 */
const clientConfig = vi.hoisted(() => ({ configured: false }));
vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return clientConfig.configured;
  },
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

/**
 * La page invitée ne parle qu'à l'Edge via `fetchGuestRecipeView` :
 * on la moque pour prouver que le toggle et les cases ne déclenchent
 * AUCUN appel supplémentaire (piège Pitfall 7 : le `link-view` initial
 * est légitime, tout le reste est interdit).
 */
vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, fetchGuestRecipeView: vi.fn() };
});

const mockedFetchView = vi.mocked(fetchGuestRecipeView);

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

const keyOf = (recipeId: string): string => `eo:recette:cuisine:${recipeId}`;

function renderGuest(code: string | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/invitation/recette" element={<GuestRecipePage />} />
    </Routes>,
    { route: code ? `/invitation/recette?code=${code}` : '/invitation/recette', withHousehold: false },
  );
}

/** Aucun bouton d'édition, d'ajout, de suppression, de partage ni d'export. */
function expectNoEdit() {
  expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Partager/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Exporter|Imprimer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nouvelle recette/ })).not.toBeInTheDocument();
}

const STEP_CONTENTS = ['Éplucher les pommes de terre.', 'Les couper en rondelles.', 'Enfourner 45 minutes.'];

/** Fiche membre + 3 étapes aux ids déterministes (même idiome que `recette-cuisine.test.tsx`). */
async function seedFiche(title: string): Promise<{ recipeId: string; stepIds: string[] }> {
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
  const stepIds: string[] = [];
  for (let index = 0; index < STEP_CONTENTS.length; index += 1) {
    const id = `${recipeId}-s${index + 1}`;
    stepIds.push(id);
    await adapter.create('recipe_steps', {
      id,
      recipe_id: recipeId,
      household_id: DEMO_HOUSEHOLD_ID,
      content: STEP_CONTENTS[index],
      position: index,
    });
  }
  return { recipeId, stepIds };
}

describe('Mode cuisine — parité invitée (R5, D-16, D-17)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    clientConfig.configured = true;
    mockedFetchView.mockReset();
    mockedFetchView.mockResolvedValue(viewPayload);
  });

  it('toggle OFF par défaut, vue invitée inchangée', async () => {
    renderGuest(CODE);

    const toggle = await screen.findByRole('button', { name: 'Mode cuisine' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Glissez la pastille numérotée pour réordonner.')).toBeInTheDocument();
    // Vue lecture seule invitée : étapes visibles, pas de vue cuisine.
    expect(screen.getByText('Éplucher les pommes de terre.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expectNoEdit();
    expect(mockedFetchView).toHaveBeenCalledTimes(1);
  });

  it('ON : mêmes cases + compteur + barre + resets, zéro édition', async () => {
    const user = userEvent.setup();
    renderGuest(CODE);
    await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));

    expect(screen.getByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Cochez au fur et à mesure. Progression mémorisée sur cet appareil.')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Étapes de la recette' });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' })).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tout réinitialiser' })).toBeInTheDocument();
    // Prohibition SPEC côté invité : aucun handler d'écriture câblé en ON.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expectNoEdit();
  });

  it('cocher persiste sous la même clé, reprise à la réouverture', async () => {
    const user = userEvent.setup();
    const first = renderGuest(CODE);
    await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));

    expect(screen.getByText('1/2')).toBeInTheDocument();
    // Même clé mémoire que la fiche membre, sur l'appareil de l'invité.
    expect(JSON.parse(window.localStorage.getItem(keyOf('recipe-1')) ?? '[]')).toEqual(['s1']);
    first.unmount();

    renderGuest(CODE);
    await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' })).not.toBeChecked();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('zéro réseau au toggle et aux cases (au-delà du link-view initial)', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        calls.push(url);
        throw new Error('réseau interdit en mode cuisine invité');
      }),
    );
    const user = userEvent.setup();
    renderGuest(CODE);
    await screen.findByRole('button', { name: 'Mode cuisine' });

    // Le chargement initial `link-view` est légitime : on réarme le piège
    // après (Pitfall 7), puis tout doit rester silencieux.
    mockedFetchView.mockClear();

    await user.click(screen.getByRole('button', { name: 'Mode cuisine' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' }));
    await user.click(screen.getByRole('button', { name: 'Tout réinitialiser' }));
    const prompt = screen.getByText('Tout effacer ?');
    await user.click(within(prompt.parentElement as HTMLElement).getByRole('button', { name: 'Réinitialiser' }));

    expect(mockedFetchView).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('changer de lien remet le mode à OFF', async () => {
    const user = userEvent.setup();
    const rendered = renderGuest(CODE);
    await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));
    expect(screen.getByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'true');

    rendered.unmount();
    renderGuest('autre-code-partage-recette-7890');
    expect(await screen.findByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Mode cuisine — enfant (D-18, readOnly cohérent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    // Fiche membre via l'adaptateur local (même idiome que
    // `recette-cuisine.test.tsx` : pas de Supabase configuré en test).
    clientConfig.configured = false;
  });

  it('enfant : toggle visible, cases seules cochables, ni ajout ni drag ni édition', async () => {
    const { recipeId } = await seedFiche('Enfant cuisine');
    renderWithProviders(
      <Routes>
        <Route path="/recettes/:id" element={<RecetteDetailPage />} />
      </Routes>,
      { route: `/recettes/${recipeId}` },
    );
    act(() => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    });

    const toggle = await screen.findByRole('button', { name: 'Mode cuisine' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // OFF enfant : pas de formulaire d'ajout (lecture seule conservée, D-12).
    expect(screen.queryByRole('button', { name: 'Ajouter une étape' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'true');

    // Cases seules : cochables, compteur suit.
    const first = screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' });
    await user.click(first);
    expect(first).toBeChecked();
    expect(screen.getByText('1/3')).toBeInTheDocument();

    // Rien d'autre : ni ajout, ni drag, ni édition, ni actions foyer.
    expect(screen.queryByRole('button', { name: 'Ajouter une étape' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réordonner/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier l’étape/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer l’étape/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });
});
