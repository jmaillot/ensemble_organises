import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { TripShareDialog } from './components/trip-share-dialog';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) } },
}));

const CODE = 'JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj';

type SeenCall = { url: string; body: Record<string, unknown> };

/** Faux serveur à la frontière HTTP : résumé, création, révocation. */
function stubTripInvite(summary: unknown, seen: SeenCall[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seen.push({ url, body });
      if (body.action === 'summary') return { ok: true, json: async () => summary };
      if (body.action === 'create') {
        return {
          ok: true,
          json: async () => ({ code: CODE, expiresAt: null, maxUses: 20, tripId: 'trip-1' }),
        };
      }
      if (body.action === 'revoke') return { ok: true, json: async () => ({ trip_id: 'trip-1', revoked: 1 }) };
      return { ok: false, json: async () => ({ error: 'action inconnue' }) };
    }),
  );
  return seen;
}

function renderShare() {
  return renderWithProviders(
    <TripShareDialog open onOpenChange={() => {}} tripId="trip-1" tripName="Week-end à Lisbonne" />,
    { withHousehold: false },
  );
}

describe('TripShareDialog — partage par code (D-09, motif cadeau)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test');
  });

  it('sans code : invite à générer, puis affiche code + lien + QR', async () => {
    const user = userEvent.setup();
    const seen = stubTripInvite({ tripId: 'trip-1', isActive: false, hasCode: false, expiresAt: null, maxUses: 20, useCount: 0 });
    try {
      renderShare();

      expect(await screen.findByText('Aucun code actif. Générez-en un pour inviter.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Générer un code' }));

      // Le code brut s'affiche une fois, avec le lien et les actions.
      expect(await screen.findByText(CODE)).toBeInTheDocument();
      expect(screen.getByText(/Lien à partager/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument();
      expect(seen.some((call) => call.body.action === 'create')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code actif créé ailleurs : régénérer l’affiche, arrêter le partage révoque', async () => {
    const user = userEvent.setup();
    const seen = stubTripInvite({ tripId: 'trip-1', isActive: true, hasCode: true, expiresAt: null, maxUses: 20, useCount: 2 });
    try {
      renderShare();

      expect(await screen.findByText(/Code actif créé ailleurs/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Arrêter le partage' }));
      expect(await screen.findByText('Partage arrêté : le code ne passe plus.')).toBeInTheDocument();
      expect(seen.some((call) => call.body.action === 'revoke')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('backend indisponible : l’avoue au lieu d’un dialogue mort', async () => {
    const user = userEvent.setup();
    void user;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'hors ligne' }) })),
    );
    try {
      renderShare();

      expect(
        await screen.findByText('Le partage par code exige le backend (Edge Function) : indisponible dans ce mode.'),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('code mémorisé : QR + lien réaffichés sans régénérer (0121)', async () => {
    stubTripInvite({ tripId: 'trip-1', isActive: true, hasCode: true, expiresAt: null, maxUses: 20, useCount: 2 });
    try {
      window.localStorage.setItem('eo:trip:code:trip-1', CODE);
      renderShare();

      // Ni Générer ni attente : le QR et le lien reviennent tout seuls.
      expect(await screen.findByText(CODE)).toBeInTheDocument();
      expect(screen.getByText(/Lien à partager/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
