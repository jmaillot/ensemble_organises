import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import CreateHouseholdPage from './create-household-page';

/**
 * WR-09 — le token est le seul second temps de la création (il a besoin du
 * foyer). S'il échoue, le foyer créé doit être retiré et la session remise à
 * vide (D-08) : sans cela, un second foyer naissait à la réédition.
 */
const { createInviteTokenMock } = vi.hoisted(() => ({ createInviteTokenMock: vi.fn() }));

vi.mock('@/lib/invites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invites')>();
  return { ...actual, createInviteToken: createInviteTokenMock };
});

import { createInviteToken } from '@/lib/invites';

const TOKEN = 'token-foyer-19-11-abcdef';

beforeEach(() => {
  vi.clearAllMocks();
  createInviteTokenMock.mockResolvedValue({ token: TOKEN, expiresAt: null, maxUses: 10, householdId: 'household-nouveau' });
  useHouseholdStore.getState().reset();
});

async function submitHousehold(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText(/Nom du foyer/), name);
  await user.click(screen.getByRole('button', { name: /Créer mon foyer/ }));
}

describe('CreateHouseholdPage — le token en échec annule le foyer (WR-09)', () => {
  it('création réussie : affiche « Votre foyer est prêt » et le token', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateHouseholdPage />, { withHousehold: false });

    await submitHousehold(user, 'Foyer Test Succès');

    expect(await screen.findByRole('heading', { name: 'Votre foyer est prêt' })).toBeInTheDocument();
    expect(screen.getByText(TOKEN)).toBeInTheDocument();
    expect(createInviteToken).toHaveBeenCalledWith({ maxUses: 10 });
  });

  it('token en échec : le foyer est retiré, le store remis à vide, l’erreur affichée', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateHouseholdPage />, { withHousehold: false });
    createInviteTokenMock.mockRejectedValueOnce(new Error('Edge indisponible.'));

    await submitHousehold(user, 'Foyer Test Échec');

    // L'écran d'erreur, jamais « Votre foyer est prêt ».
    expect(await screen.findByRole('alert')).toHaveTextContent('Edge indisponible.');
    expect(screen.queryByRole('heading', { name: 'Votre foyer est prêt' })).not.toBeInTheDocument();

    // Le foyer créé a disparu, et la session ne pointe vers aucun foyer.
    const rows = await data.list<{ id: string }>('households', { name: 'Foyer Test Échec' });
    expect(rows).toHaveLength(0);
    expect(useHouseholdStore.getState().householdId).toBeNull();
  });
});
