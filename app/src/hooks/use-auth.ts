import { useEffect, useState } from 'react';
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

/** Restaure la session Supabase au chargement et le foyer de l'utilisateur. */
export function useAuthBootstrap() {
  const setStatus = useSessionStore((state) => state.setStatus);
  const signIn = useSessionStore((state) => state.signIn);
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
      const user = session.user;
      const fallbackName = (user.user_metadata?.full_name as string | undefined) ?? (user.email ?? 'Membre du foyer');
      const sessionUser: SessionUser = {
        id: user.id,
        email: user.email ?? '',
        displayName: fallbackName,
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        provider: ((user.app_metadata?.provider as SessionUser['provider'] | undefined) ??
          (user.email ? 'email' : 'email')) as SessionUser['provider'],
      };
      void signIn(sessionUser);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void useSessionStore.getState().signOut();
      } else if (session?.user) {
        const user = session.user;
        void useSessionStore.getState().refreshUser({
          id: user.id,
          email: user.email ?? '',
          displayName: (user.user_metadata?.full_name as string | undefined) ?? (user.email ?? 'Membre du foyer'),
          avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
          provider: 'email',
        });
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [setStatus, signIn]);

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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
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
