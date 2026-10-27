import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kill global des sessions GoTrue (RGDP-01) — état de départ du plan 27-05,
 * reproduisant FIDÈLEMENT le bloc fautif de `index.ts` (CR-01) : le scope est
 * passé en OBJET, forme que `GoTrueAdminApi.signOut` refuse avant toute
 * requête HTTP. Le test `revoke-sessions.test.ts` échoue sur cette forme :
 * c'est la rougeur attendue avant la correction.
 */
export async function revokeGlobalSessions(
  admin: SupabaseClient,
  jwt: string,
): Promise<{ revoked: boolean }> {
  try {
    const { error } = await admin.auth.signOut(jwt, { scope: 'global' });
    if (error) {
      console.error('household-delete: signOut global refusé', { message: error.message });
      return { revoked: false };
    }
    return { revoked: true };
  } catch (signOutUnknown) {
    console.error('household-delete: signOut global impossible', {
      message: signOutUnknown instanceof Error ? signOutUnknown.message : String(signOutUnknown),
    });
    return { revoked: false };
  }
}
