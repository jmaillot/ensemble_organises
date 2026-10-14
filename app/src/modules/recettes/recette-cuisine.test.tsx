import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { CuisineToggle } from './components/cuisine-toggle';
import { RecipeCuisineView } from './components/recipe-cuisine-view';
import RecetteDetailPage from './recette-detail-page';
import GuestRecipePage from './guest-recipe-page';
import { fetchGuestRecipeView, type GuestRecipeView } from './api';
import type { RecipeStep } from './types';

/**
 * `isSupabaseConfigured` est lu UNE fois à l’import par `lib/data/index.ts`
 * pour figer l’adaptateur : `false` ici (évalué avant les imports via
 * `vi.hoisted`), donc la fiche membre utilise l’adaptateur local. Seul le
 * test invité G-17-1 repasse le flag à `true` (la page invitée le lit à
 * chaque rendu) puis le restaure — même idiome que
 * `guest-recipe-cuisine.test.tsx`.
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

/**
 * La page invitée ne parle qu’à l’Edge via `fetchGuestRecipeView` : moqué
 * pour le seul test invité G-17-1 (la fiche membre ne l’appelle jamais).
 */
vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return { ...original, fetchGuestRecipeView: vi.fn() };
});

const mockedFetchView = vi.mocked(fetchGuestRecipeView);

const STEP_CONTENTS = ['Éplucher les pommes de terre.', 'Les couper en rondelles.', 'Enfourner 45 minutes.'];

const keyOf = (recipeId: string): string => `eo:recette:cuisine:${recipeId}`;

/** Fiche + 3 étapes aux ids déterministes (`<recipeId>-s1..s3`). */
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

function DetailShell() {
  return (
    <Routes>
      <Route path="/recettes/:id" element={<RecetteDetailPage />} />
    </Routes>
  );
}

/** Expose la navigation pour simuler fiche A → fiche B sans démonter la page. */
let go: (to: string) => void = () => {};
function NavProbe() {
  const navigate = useNavigate();
  go = navigate;
  return null;
}

function renderDetail(recipeId: string) {
  return renderWithProviders(<DetailShell />, { route: `/recettes/${recipeId}` });
}

async function openCuisine() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));
  return user;
}

const VIEW_STEPS: RecipeStep[] = [
  { id: 'v-1', content: 'Éplucher les pommes de terre.', position: 0 },
  { id: 'v-2', content: 'Les couper en rondelles.', position: 1 },
  { id: 'v-3', content: 'Enfourner 45 minutes.', position: 2 },
];

describe('Mode cuisine — tracer fiche membre (R1, R2, R3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fiche ouverte : toggle OFF avec la vue édition inchangée', async () => {
    const { recipeId } = await seedFiche('Tracer OFF');
    renderDetail(recipeId);

    const toggle = await screen.findByRole('button', { name: 'Mode cuisine' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('type', 'button');
    // Un seul tab stop, aucun `switch` exposé (visuel `asChild`, piège Pitfall 1).
    expect(screen.getAllByRole('button', { name: 'Mode cuisine' })).toHaveLength(1);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    // Vue édition : ajout + drag + description d'origine.
    expect(screen.getByRole('button', { name: 'Ajouter une étape' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réordonner : étape 1' })).toBeInTheDocument();
    expect(screen.getByText('Glissez la pastille numérotée pour réordonner.')).toBeInTheDocument();
    // Pas de vue cuisine : ni compteur, ni barre, ni section dédiée
    // (les cases visibles sont celles de cuisson de la vue édition, D-12).
    expect(screen.queryByRole('region', { name: 'Mode cuisine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('toggle ON : numeros + textes + cases seules, compteur 0/3 + barre, sans édition', async () => {
    const { recipeId } = await seedFiche('Tracer ON');
    renderDetail(recipeId);
    await openCuisine();

    const toggle = screen.getByRole('button', { name: 'Mode cuisine' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Cochez au fur et à mesure. Progression mémorisée sur cet appareil.')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(list).getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeInTheDocument();
    for (const content of STEP_CONTENTS) expect(within(list).getByText(content)).toBeInTheDocument();

    // Zéro affordance d'édition : ni ajout, ni drag, ni boutons ligne.
    expect(screen.queryByRole('button', { name: 'Ajouter une étape' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réordonner/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier l’étape/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer l’étape/ })).not.toBeInTheDocument();

    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('cocher 2 étapes donne 2/3 + barre 2/3, OFF/ON conserve les cases', async () => {
    const { recipeId } = await seedFiche('Tracer compteur');
    renderDetail(recipeId);
    const user = await openCuisine();

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' }));

    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');

    // OFF → édition, ON → cuisine avec les cases conservées.
    await user.click(screen.getByRole('button', { name: 'Mode cuisine' }));
    expect(screen.getByRole('button', { name: 'Ajouter une étape' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mode cuisine' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 3 comme faite' })).not.toBeChecked();
  });

  it('fermer puis rouvrir restaure 2 cases et 2/3 (mémoire par fiche)', async () => {
    const { recipeId } = await seedFiche('Tracer mémoire');
    const first = renderDetail(recipeId);
    const user = await openCuisine();

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 3 comme faite' }));
    first.unmount();

    // « Fermer puis rouvrir » = nouveau montage, même fiche, même appareil.
    renderDetail(recipeId);
    await openCuisine();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 3 comme faite' })).toBeChecked();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('ids orphelins purgés silencieusement, mémoire isolée par fiche (T-17-01)', async () => {
    const first = await seedFiche('Tracer purge A');
    const second = await seedFiche('Tracer purge B');
    window.localStorage.setItem(keyOf(first.recipeId), JSON.stringify([first.stepIds[0], 'etape-supprimee']));
    window.localStorage.setItem(keyOf(second.recipeId), JSON.stringify([second.stepIds[1]]));

    renderDetail(first.recipeId);
    await openCuisine();

    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(keyOf(first.recipeId)) ?? '[]')).toEqual([first.stepIds[0]]);
    // La clé de l'autre fiche n'est jamais lue ni touchée ici.
    expect(JSON.parse(window.localStorage.getItem(keyOf(second.recipeId)) ?? '[]')).toEqual([second.stepIds[1]]);
  });

  it('reset inline : Annuler restaure le bouton, Réinitialiser remet à zéro', async () => {
    const { recipeId } = await seedFiche('Tracer reset');
    renderDetail(recipeId);
    const user = await openCuisine();
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));

    // En-tête discret.
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByText('Tout effacer ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();

    // Bas de vue explicite (l'en-tête garde son propre rappel discret).
    await user.click(screen.getByRole('button', { name: 'Tout réinitialiser' }));
    const prompt = screen.getByText('Tout effacer ?');
    await user.click(within(prompt.parentElement as HTMLElement).getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).not.toBeChecked();
    expect(window.localStorage.getItem(keyOf(recipeId))).toBeNull();
  });

  it('changer de fiche remet le mode à OFF (route réutilisée, piège Pitfall 3)', async () => {
    const first = await seedFiche('Tracer nav A');
    const second = await seedFiche('Tracer nav B');
    renderWithProviders(
      <>
        <NavProbe />
        <DetailShell />
      </>,
      { route: `/recettes/${first.recipeId}` },
    );
    await openCuisine();
    expect(screen.getByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      go(`/recettes/${second.recipeId}`);
    });

    expect(await screen.findByRole('button', { name: 'Mode cuisine' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ajouter une étape' })).toBeInTheDocument();
  });

  it('vue isolée : pastilles 1-2-3 statiques, texte entier 18px, coché réduit 14px sans barré', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeCuisineView steps={VIEW_STEPS} recipeId="r-vue-1" wakeLockSupported />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réordonner/ })).not.toBeInTheDocument();

    const unchecked = screen.getByText('Éplucher les pommes de terre.');
    expect(unchecked.className).toContain('text-[18px]');
    expect(unchecked.className).not.toContain('line-clamp-2');

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    const collapsed = screen.getByText('Éplucher les pommes de terre.');
    expect(collapsed.className).toContain('line-clamp-2');
    expect(collapsed.className).toContain('text-[14px]');
    expect(collapsed.className).not.toContain('line-through');
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('recette à 1 étape : 0/1 puis 1/1', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RecipeCuisineView steps={[{ id: 'solo', content: 'Saler.', position: 0 }]} recipeId="r-vue-solo" wakeLockSupported />,
    );
    expect(screen.getByText('0/1')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('état vide : copie reprise, compteur et reset masqués', () => {
    renderWithProviders(<RecipeCuisineView steps={[]} recipeId="r-vue-vide" wakeLockSupported />);
    expect(screen.getByText('Aucune étape pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /initialiser/ })).not.toBeInTheDocument();
  });

  it('stockage corrompu : Set vide, sans crash (backstop UI-SPEC)', async () => {
    window.localStorage.setItem('eo:recette:cuisine:r-vue-corrompu', '{oops');
    renderWithProviders(<RecipeCuisineView steps={VIEW_STEPS} recipeId="r-vue-corrompu" wakeLockSupported />);
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).not.toBeChecked();
  });

  it('stockage bloqué : cases 100 % opérables en session seule, sans erreur UI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeCuisineView steps={VIEW_STEPS} recipeId="r-vue-bloque" wakeLockSupported />);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota plein');
    });

    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    expect(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(setItem).toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('Mode cuisine — prohibitions et robustesse (SPEC, plan 17-01 tâche 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Faisceau toggle + vue, comme câblé sur la fiche, mais isolé du réseau. */
  function CuisineHarness() {
    const [cuisine, setCuisine] = useState(false);
    return (
      <>
        <CuisineToggle active={cuisine} onToggle={() => setCuisine((current) => !current)} />
        {cuisine ? <RecipeCuisineView steps={VIEW_STEPS} recipeId="r-reseau" wakeLockSupported /> : null}
      </>
    );
  }

  it('prohibition 1 : zéro appel réseau en vue isolée (cases + toggle + resets)', async () => {
    // Vue isolée (pas la page entière, piège Pitfall 7 : coverQuery et les
    // refetch TanStack fausseraient la preuve).
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        calls.push(url);
        throw new Error('réseau interdit en mode cuisine');
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CuisineHarness />);

    await user.click(screen.getByRole('button', { name: 'Mode cuisine' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marquer l’étape 2 comme faite' }));
    await user.click(screen.getByRole('button', { name: 'Tout réinitialiser' }));
    const prompt = screen.getByText('Tout effacer ?');
    await user.click(within(prompt.parentElement as HTMLElement).getByRole('button', { name: 'Réinitialiser' }));

    expect(calls).toEqual([]);
  });

  it('prohibition 3 : aucun handler d’écriture câblé, zéro affordance d’édition en ON', () => {
    // La vue ne reçoit que steps + état de cases : sa signature exclut
    // onAdd/onUpdate/onDelete/onReorder (vérifié au typage), et le DOM ON
    // ne contient ni formulaire ni bouton d’édition/suppression/drag.
    renderWithProviders(<RecipeCuisineView steps={VIEW_STEPS} recipeId="r-ecriture" wakeLockSupported />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.sort()).toEqual(['Réinitialiser', 'Tout réinitialiser']);
  });

  it('edge : étape très longue non cochée rendue entière, jamais tronquée', () => {
    const long = `Faire fondre le beurre à feu doux, ajouter la farine en pluie, remuer sans cesse pendant dix minutes, verser le lait petit à petit, laisser épaissir, assaisonner, goûter, rectifier, réserver au chaud.`;
    renderWithProviders(
      <RecipeCuisineView steps={[{ id: 'longue', content: long, position: 0 }]} recipeId="r-longue" wakeLockSupported />,
    );
    const text = screen.getByText(long);
    expect(text.className).not.toContain('line-clamp-2');
    expect(text.className).not.toContain('truncate');
    expect(text.className).toContain('text-[18px]');
  });
});

const GUEST_CODE = 'code-partage-recette-123456';

const GUEST_STICKY_VIEW: GuestRecipeView = {
  recipeId: 'recipe-sticky-invite',
  title: 'Gratin dauphinois',
  servings: 4,
  prepMinutes: 30,
  cookMinutes: 45,
  coverPhotoUrl: null,
  category: 'Recettes du foyer',
  ingredients: [],
  steps: [
    { id: 's1', content: 'Éplucher les pommes de terre.', position: 0 },
    { id: 's2', content: 'Enfourner 45 minutes.', position: 1 },
  ],
  tags: ['Plat'],
};

describe('Mode cuisine — offset sticky sous-topbar (G-17-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    clientConfig.configured = false;
    mockedFetchView.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clientConfig.configured = false;
  });

  /** En-tête sticky = le `div.sticky` parent du compteur N/M. */
  function stickyHeaderOf(counterText: string): HTMLElement {
    const counter = screen.getByText(counterText, { selector: 'p' });
    const header = counter.closest('div.sticky');
    if (!(header instanceof HTMLElement)) throw new Error('en-tête sticky introuvable');
    return header;
  }

  it('défaut : l’en-tête colle à top-0 (page invitée hors shell, zéro topbar)', () => {
    renderWithProviders(<RecipeCuisineView steps={VIEW_STEPS} recipeId="r-sticky-defaut" wakeLockSupported />);

    const header = stickyHeaderOf('0/3');
    expect(header.classList.contains('top-0')).toBe(true);
    expect(header.classList.contains('top-[76px]')).toBe(false);
  });

  it('prop : l’en-tête colle sous la topbar, fond surface-blur et z intacts (UI-SPEC Color)', () => {
    renderWithProviders(
      <RecipeCuisineView
        steps={VIEW_STEPS}
        recipeId="r-sticky-offset"
        wakeLockSupported
        stickyTopClass="top-[76px] max-[650px]:top-14"
      />,
    );

    const header = stickyHeaderOf('0/3');
    expect(header.classList.contains('top-[76px]')).toBe(true);
    expect(header.classList.contains('max-[650px]:top-14')).toBe(true);
    expect(header.classList.contains('top-0')).toBe(false);
    expect(header.classList.contains('z-10')).toBe(true);
    expect(header.classList.contains('bg-surface/95')).toBe(true);
    expect(header.classList.contains('backdrop-blur')).toBe(true);
  });

  it('fiche membre : toggle-ON colle l’en-tête sous la topbar (topbar cliquable)', async () => {
    const { recipeId } = await seedFiche('Sticky membre');
    renderDetail(recipeId);
    await openCuisine();

    const header = stickyHeaderOf('0/3');
    expect(header.classList.contains('top-[76px]')).toBe(true);
    expect(header.classList.contains('max-[650px]:top-14')).toBe(true);
    expect(header.classList.contains('top-0')).toBe(false);
  });

  it('page invitée : toggle-ON colle l’en-tête à top-0, sans vide parasite', async () => {
    clientConfig.configured = true;
    mockedFetchView.mockResolvedValue(GUEST_STICKY_VIEW);
    renderWithProviders(
      <Routes>
        <Route path="/invitation/recette" element={<GuestRecipePage />} />
      </Routes>,
      { route: `/invitation/recette?code=${GUEST_CODE}`, withHousehold: false },
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mode cuisine' }));

    const header = stickyHeaderOf('0/2');
    expect(header.classList.contains('top-0')).toBe(true);
    expect(header.classList.contains('top-[76px]')).toBe(false);
  });
});
