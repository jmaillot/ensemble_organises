import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revokeGlobalSessions } from './revoke-sessions';

/**
 * Contrat CR-01 (phase 27, plan 05) : le kill global des sessions GoTrue
 * transmet le scope en CHAÎNE ('global') — auth-js lance SIGN_OUT_SCOPES.indexOf
 * AVANT toute requête HTTP, donc un argument objet ({ scope: 'global' }) throw
 * sans rien tuer. Le helper absorbe tout échec (erreur ou throw) et rend un
 * verdict booléen honnête : { revoked: true } seulement si signOut a réellement
 * résolu sans erreur.
 */
function adminAvecSignOut(implementation: (...args: unknown[]) => Promise<unknown>) {
  return {
    auth: { signOut: vi.fn(implementation) },
  } as unknown as SupabaseClient;
}

describe('revokeGlobalSessions', () => {
  it('appelle signOut avec le scope en CHAÎNE (jwt, "global") et rend revoked:true', async () => {
    const admin = adminAvecSignOut(() => Promise.resolve({ data: null, error: null }));

    const result = await revokeGlobalSessions(admin, 'jwt-1');

    expect(result).toEqual({ revoked: true });
    // Le contrat CR-01 exact : deux arguments, le second est la chaîne
    // 'global' — JAMAIS l'objet { scope: 'global' } que auth-js refuse.
    expect(admin.auth.signOut).toHaveBeenCalledTimes(1);
    const call = admin.auth.signOut.mock.calls[0];
    expect(call).toEqual(['jwt-1', 'global']);
    expect(call[1]).toBe('global');
    expect(call[1]).not.toBeTypeOf('object');
  });

  it('rend revoked:false quand signOut résout avec une erreur (aucune exception propagée)', async () => {
    const admin = adminAvecSignOut(() =>
      Promise.resolve({ data: null, error: { message: 'session introuvable' } }),
    );

    const result = await revokeGlobalSessions(admin, 'jwt-2');

    expect(result).toEqual({ revoked: false });
  });

  it('absorbe un throw de signOut (le cas CR-01) et rend revoked:false', async () => {
    const admin = adminAvecSignOut(() => Promise.reject(new Error('scope invalide')));

    const result = await revokeGlobalSessions(admin, 'jwt-3');

    expect(result).toEqual({ revoked: false });
  });
});
