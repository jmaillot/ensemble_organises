import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Kill global des sessions GoTrue (RGDP-01, correction CR-01).
 *
 * `GoTrueAdminApi.signOut` valide son scope AVANT toute requête HTTP :
 * `SIGN_OUT_SCOPES.indexOf(scope) < 0` → throw. L'ancien appel passait un
 * objet `{ scope: 'global' }`, forme absente de la liste `['global','local',
 * 'others']` : le kill ne partait JAMAIS, le catch avalait l'erreur et la
 * réponse restait 200 (succès mensonger). Le scope est donc transmis en
 * CHAÎNE, et tout échec — erreur résolue ou throw — est consigné et rendu
 * honnêtement `{ revoked: false }` : le client ne voit jamais un succès
 * inventé.
 */
export async function revokeGlobalSessions(
  admin: SupabaseClient,
  jwt: string,
): Promise<{ revoked: boolean }> {
  try {
    const { error } = await admin.auth.signOut(jwt, 'global');
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
