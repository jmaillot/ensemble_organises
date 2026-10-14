import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RecipeShareDialog } from './recipe-share-dialog';

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
function stubRecipeInvite(summary: unknown, seen: SeenCall[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seen.push({ url, body });
      if (body.action === 'summary') return { ok: true, json: async () => summary };
      if (body.action === 'create') {
        return {
          ok: true,
          json: async () => ({ code: CODE, expiresAt: null, maxUses: 20, recipeId: 'recipe-1' }),
        };
      }
      if (body.action === 'revoke') return { ok: true, json: async () => ({ recipe_id: 'recipe-1', revoked: 1 }) };
      return { ok: false, json: async () => ({ error: 'action inconnue' }) };
    }),
  );
  return seen;
}

function renderShare() {
  return renderWithProviders(
    <RecipeShareDialog open onOpenChange={() => {}} recipe={{ id: 'recipe-1', title: 'Gratin' }} />,
    { withHousehold: false },
  );
}

describe('RecipeShareDialog — lien mémorisé comme ardoise/voyage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test');
  });

  it('sans lien : invite à générer, puis affiche code + lien + QR et mémorise', async () => {
    const user = userEvent.setup();
    const seen = stubRecipeInvite({
      recipeId: 'recipe-1',
      isActive: false,
      hasCode: false,
      expiresAt: null,
      maxUses: 20,
      useCount: 0,
    });
    try {
      renderShare();

      expect(await screen.findByText('Aucun lien actif. Générez-en un pour inviter.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Générer un lien' }));

      expect(await screen.findByText(CODE)).toBeInTheDocument();
      expect(screen.getByText(/Lien à partager/)).toBeInTheDocument();
      expect(window.localStorage.getItem('eo:recipe:code:recipe-1')).toBe(CODE);
      expect(seen.some((call) => call.body.action === 'create')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien mémorisé : QR + lien réaffichés sans régénérer', async () => {
    stubRecipeInvite({
      recipeId: 'recipe-1',
      isActive: true,
      hasCode: true,
      expiresAt: null,
      maxUses: 20,
      useCount: 2,
    });
    try {
      window.localStorage.setItem('eo:recipe:code:recipe-1', CODE);
      renderShare();

      expect(await screen.findByText(CODE)).toBeInTheDocument();
      expect(screen.getByText(/Lien à partager/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lien actif créé ailleurs : régénérer l’affiche, arrêter le partage révoque et purge', async () => {
    const user = userEvent.setup();
    const seen = stubRecipeInvite({
      recipeId: 'recipe-1',
      isActive: true,
      hasCode: true,
      expiresAt: null,
      maxUses: 20,
      useCount: 2,
    });
    try {
      renderShare();

      expect(await screen.findByText(/créé ailleurs/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Arrêter le partage' }));
      expect(await screen.findByText('Partage arrêté : le lien ne passe plus.')).toBeInTheDocument();
      expect(window.localStorage.getItem('eo:recipe:code:recipe-1')).toBeNull();
      expect(seen.some((call) => call.body.action === 'revoke')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
