import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import JoinHouseholdPage from './join-household-page';

/**
 * 19-16 — le lien partagé `/foyer/rejoindre?token=…` (émis par
 * `parametres/components/invitations-panel.tsx`, ce qu'un administrateur copie
 * ou fait scanner en QR) portait son jeton sans que la page le lise : l'invité
 * arrivait sur le bon écran et devait retaper 22 caractères à la main. Le
 * paramètre préremplit désormais le champ ; la saisie manuelle reste le repli.
 */
const { redeemInviteTokenMock } = vi.hoisted(() => ({ redeemInviteTokenMock: vi.fn() }));

vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return { ...actual, redeemInviteToken: redeemInviteTokenMock };
});

import { redeemInviteToken } from '@/lib/invites';

// 25 caractères, distinct de tout identifiant de la graine : une valeur codée
// en dur ne peut pas satisfaire le cas (a) par hasard.
const TOKEN_DU_LIEN = 'jeton-lien-19-16-abcdefgh';

beforeEach(() => {
  vi.clearAllMocks();
  redeemInviteTokenMock.mockResolvedValue('household-rejoint');
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
