import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';

/**
 * 19-16 — le lien partagé `/foyer/rejoindre?token=…` (émis par
 * `parametres/components/invitations-panel.tsx`, ce qu'un administrateur copie
 * ou fait scanner en QR) portait son jeton sans que la page le lise : l'invité
 * arrivait sur le bon écran et devait retaper 22 caractères à la main. Le
 * paramètre préremplit désormais le champ ; la saisie manuelle reste le repli.
 *
 * D-10 — la page de jonction sondait `import.meta.env.VITE_SUPABASE_URL` SEUL,
 * alors que tout le reste de l'application sonde `isSupabaseConfigured` (URL
 * **et** clé). Une URL sans clé faisait donc croire à un backend présent, la
 * branche locale n'était pas prise, et le client Supabase n'existant pas,
 * l'appel serveur échouait au lieu de tourner en mode démonstration.
 */
const { redeemInviteTokenMock, joinHouseholdLocalMock, loadHouseholdMock, supabaseClient } = vi.hoisted(() => ({
  redeemInviteTokenMock: vi.fn(),
  joinHouseholdLocalMock: vi.fn(),
  loadHouseholdMock: vi.fn(),
  // Drapeau mutable : `vi.mock` est hissé et son résultat est mis en cache, donc
  // les deux cas (clé absente / configuration complète) ne peuvent pas se
  // contenter d'une valeur figée à la fabrique.
  supabaseClient: { configured: false },
}));

vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return { ...actual, redeemInviteToken: redeemInviteTokenMock };
});

vi.mock('@/stores/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/session-store')>();
  return { ...actual, joinHouseholdLocal: joinHouseholdLocalMock, loadHousehold: loadHouseholdMock };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: null,
  // Accesseur, et non valeur : la page lit l'export au moment de la soumission,
  // donc le cas peut le faire basculer dans le corps du test.
  get isSupabaseConfigured() {
    return supabaseClient.configured;
  },
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

import { redeemInviteToken } from '@/lib/invites';
import JoinHouseholdPage from './join-household-page';

// 25 caractères, distinct de tout identifiant de la graine : une valeur codée
// en dur ne peut pas satisfaire le cas (a) par hasard.
const TOKEN_DU_LIEN = 'jeton-lien-19-16-abcdefgh';

beforeEach(() => {
  vi.clearAllMocks();
  supabaseClient.configured = false;
  redeemInviteTokenMock.mockResolvedValue('household-rejoint');
  joinHouseholdLocalMock.mockResolvedValue({ id: 'household-demo' });
  loadHouseholdMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const champToken = () => screen.getByLabelText(/Token d’invitation/) as HTMLInputElement;

describe('JoinHouseholdPage — le lien d’invitation préremplit le champ (19-16)', () => {
  it('(a) le paramètre ?token= devient la valeur initiale du champ, sans rien consommer', () => {
    renderWithProviders(<JoinHouseholdPage />, {
      route: `/foyer/rejoindre?token=${TOKEN_DU_LIEN}`,
      withHousehold: false,
    });

    expect(champToken()).toHaveValue(TOKEN_DU_LIEN);
    // Le geste de l'utilisateur reste requis : un aperçu de lien ne consomme
    // pas un token à usage compté (T-19-51).
    expect(redeemInviteToken).not.toHaveBeenCalled();
  });

  it('(b) sans paramètre, le champ est vide et la saisie manuelle reste possible', async () => {
    const user = userEvent.setup();
    renderWithProviders(<JoinHouseholdPage />, { route: '/foyer/rejoindre', withHousehold: false });

    const champ = champToken();
    expect(champ).toHaveValue('');

    await user.type(champ, TOKEN_DU_LIEN);
    expect(champ).toHaveValue(TOKEN_DU_LIEN);
    await user.click(screen.getByRole('button', { name: /Rejoindre le foyer/ }));

    await waitFor(() => expect(redeemInviteToken).toHaveBeenCalledWith(TOKEN_DU_LIEN));
  });
});

describe('JoinHouseholdPage — la sonde de configuration est celle de l’application (D-10)', () => {
  it('(a) URL présente mais clé absente ⇒ la branche locale est prise', async () => {
    // Le stub d'URL est INDISPENSABLE au cas : sans lui, l'ancienne sonde
    // (`import.meta.env.VITE_SUPABASE_URL`) aurait elle aussi pris la branche
    // locale, et le test serait vert sur le code fautif — c'est exactement le
    // piège que ce cas doit fermer.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://api.exemple.fr');
    supabaseClient.configured = false;

    const user = userEvent.setup();
    renderWithProviders(<JoinHouseholdPage />, { route: '/foyer/rejoindre', withHousehold: false });

    await user.type(champToken(), TOKEN_DU_LIEN);
    await user.click(screen.getByRole('button', { name: /Rejoindre le foyer/ }));

    try {
      await waitFor(() => expect(joinHouseholdLocalMock).toHaveBeenCalledTimes(1));
      expect(loadHouseholdMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('(b) configuration complète ⇒ la branche locale n’est PAS prise (verrou de non-régression)', async () => {
    supabaseClient.configured = true;

    const user = userEvent.setup();
    renderWithProviders(<JoinHouseholdPage />, { route: '/foyer/rejoindre', withHousehold: false });

    await user.type(champToken(), TOKEN_DU_LIEN);
    await user.click(screen.getByRole('button', { name: /Rejoindre le foyer/ }));

    await waitFor(() => expect(loadHouseholdMock).toHaveBeenCalled());
    // La branche Supabase reste la branche nominale : la correction de sonde ne
    // doit pas la court-circuiter.
    expect(joinHouseholdLocalMock).not.toHaveBeenCalled();
  });
});
