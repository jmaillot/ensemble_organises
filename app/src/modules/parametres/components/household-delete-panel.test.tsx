import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { HouseholdDeletePanel } from './household-delete-panel';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

function renderPanel() {
  return renderWithProviders(
    <Routes>
      <Route path="/parametres" element={<HouseholdDeletePanel />} />
      <Route path="/foyer" element={<p>Choisissez votre foyer</p>} />
    </Routes>,
    { route: '/parametres' },
  );
}

describe('HouseholdDeletePanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      data: { household_id: DEMO_HOUSEHOLD_ID, expenses: 2, storage_objects: 3, storage_cleanup: 'ok' },
      error: null,
    });
  });

  it('supprime après confirmation, réinitialise le foyer et redirige', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Supprimer le foyer' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Oui, tout supprimer' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('household-delete', { body: { householdId: DEMO_HOUSEHOLD_ID } });
    });
    expect(useHouseholdStore.getState().householdId).toBeNull();
    expect(await screen.findByText('Choisissez votre foyer')).toBeInTheDocument();
  });

  it('ne rend rien pour un membre non administrateur', async () => {
    renderPanel();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Supprimer le foyer' })).not.toBeInTheDocument();
    });
  });

  it('affiche l’erreur serveur sans rien effacer', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ data: null, error: new Error('raté'), response: undefined });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Supprimer le foyer' }));
    await user.click(screen.getByRole('button', { name: 'Oui, tout supprimer' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(useHouseholdStore.getState().householdId).toBe(DEMO_HOUSEHOLD_ID);
  });
});
