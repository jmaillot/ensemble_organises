import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import { LinkedAccountsPanel } from './linked-accounts-panel';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
  supabaseFunctionsBase: null,
}));

describe('Comptes liés', () => {
  it('annonce la fusion indisponible en démonstration locale', () => {
    renderWithProviders(<LinkedAccountsPanel />);

    expect(screen.getByText('Comptes liés')).toBeInTheDocument();
    expect(screen.getByText(/une fois connecté à Supabase/)).toBeInTheDocument();
  });
});
