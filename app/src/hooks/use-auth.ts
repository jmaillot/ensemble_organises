import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { useSessionStore } from '@/stores/session-store';
import { DEMO_HOUSEHOLD_ID, demoMembers, demoProfile } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdMemberRow, HouseholdRow, SessionUser } from '@/types';

export function useIsAuthenticated() {
  const status = useSessionStore((state) => state.status);
  return status === 'authenticated';
}

export function useSessionUser(): SessionUser | null {
  return useSessionStore((state) => state.user);
}

/** Traduit un utilisateur Supabase Auth en utilisateur de session. */
function toSessionUser(user: User): SessionUser {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: (metadata.full_name as string | undefined) ?? (user.email ?? 'Membre du foyer'),
    avatarUrl: (metadata.avatar_url as string | undefined) ?? null,
    provider: ((user.app_metadata?.provider as SessionUser['provider'] | undefined) ?? 'email') as SessionUser['provider'],
  };
}

/**
 * Établit la session dans le store à partir d'un utilisateur Auth.
 *
 * `signIn` est le SEUL chemin qui passe le statut à `authenticated` et charge
 * le foyer. L'événement `SIGNED_IN` de supabase-js appelait `refreshUser`, qui
 * ne pose que l'utilisateur : le statut restait celui d'un invité, la garde de
 * route redirigeait vers `/connexion`, et l'inscription comme la connexion
 * semblaient ne rien faire. Ce chemin n'avait jamais été exercé — l'application
 * tournait jusqu'ici en mode démo, où le bootstrap pose le statut directement.
 *
 * Une session déjà établie n'est que rafraîchie : un renouvellement de jeton ne
 * doit pas recharger le foyer.
 */
export async function applySession(user: User): Promise<void> {
  const sessionUser = toSessionUser(user);
  const store = useSessionStore.getState();
  if (store.status === 'authenticated' && store.user?.id === sessionUser.id) {
    store.refreshUser(sessionUser);
    return;
  }
  await store.signIn(sessionUser);
}

/** Restaure la session Supabase au chargement et le foyer de l'utilisateur. */
export function useAuthBootstrap() {
  const setStatus = useSessionStore((state) => state.setStatus);
  // Tant que la session n'est pas restaurée, l'application affiche un état de
  // chargement : sinon une route protégée redirigerait vers la connexion.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      const persisted = useSessionStore.getState().user;
      if (persisted) {
        // Mode local : on rétablit le foyer de démonstration associé.
        const store = useHouseholdStore.getState();
        if (!store.householdId || store.members.length === 0) {
          store.setHousehold(
            { id: DEMO_HOUSEHOLD_ID, name: 'Foyer Martin', avatar_color: 'accent' } as HouseholdRow,
            demoMembers as HouseholdMemberRow[],
          );
        }
        setStatus('authenticated');
        setReady(true);
      } else {
        setStatus('guest');
        setReady(true);
      }
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      if (!session) {
        setStatus('guest');
        setReady(true);
        return;
      }
      void applySession(session.user);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void useSessionStore.getState().signOut();
        return;
      }
      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED : tous portent
      // la session courante, et tous doivent pouvoir l'établir. Seuls SIGNED_OUT
      // et l'absence de session ont un traitement propre.
      if (session?.user) {
        void applySession(session.user);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [setStatus]);

  return ready;
}

export async function signInWithProvider(provider: 'google' | 'facebook') {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/accueil`, scopes: provider === 'facebook' ? 'email,public_profile' : undefined },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await applySession(data.user);
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // Sans session, GoTrue a créé le compte mais attend la confirmation de
  // l'adresse. Naviguer quand même mènerait à une redirection de la garde, et
  // l'utilisateur comprendrait que l'inscription a échoué alors que son compte
  // existe : c'est exactement le symptôme décrit, dans sa version SMTP.
  if (!data.session || !data.user) {
    throw new Error(
      'Compte créé. Consultez votre boîte de réception pour confirmer votre adresse, puis connectez-vous.',
    );
  }
  await applySession(data.user);
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  await useSessionStore.getState().signOut();
}

export const demoUser: SessionUser = {
  id: demoProfile.id,
  email: demoProfile.email,
  displayName: demoProfile.display_name,
  avatarUrl: demoProfile.avatar_url,
  provider: 'email',
};
