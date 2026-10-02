import { useEffect, useState } from 'react';
import type { User, UserIdentity } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { data } from '@/lib/data';
import { useSessionStore } from '@/stores/session-store';
import { DEMO_HOUSEHOLD_ID, demoMembers, demoProfile } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdMemberRow, HouseholdRow, ProfileRow, SessionUser } from '@/types';

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
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: fullName || email || 'Membre du foyer',
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
    // Le nom de référence vit dans `profiles` (chemin complet ci-dessous) :
    // un renouvellement de jeton n'apporte que les métadonnées Auth et
    // écraserait le nom du profil par l'email. On garde le nom déjà connu ;
    // un nom vide persisté, lui, prend le frais.
    if (store.user.displayName?.trim()) {
      sessionUser.displayName = store.user.displayName;
    }
    store.refreshUser(sessionUser);
    return;
  }
  // Le nom d'affichage de référence vit dans `profiles`, pas dans les
  // métadonnées Auth (email/mot de passe n'en pose aucun : le repli serait
  // l'email). Lecture directe, RLS : son propre profil est lisible. Uniquement
  // sur le chemin complet : le renouvellement de jeton ne recharge rien, pas
  // même le foyer.
  if (supabase) {
    try {
      const [profile] = await data.list<ProfileRow>('profiles', { id: user.id });
      const name = profile?.display_name?.trim();
      if (name) sessionUser.displayName = name;
    } catch {
      // Hors ligne ou profil pas encore créé : le repli par métadonnées reste.
    }
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
        // Une session persistée par une ancienne version peut porter un nom
        // vide : on la répare depuis la ligne membre (miroir du profil en
        // local), sans exiger une resaisie du prénom et du nom.
        if (!persisted.displayName?.trim()) {
          const ownName =
            useHouseholdStore.getState().members.find((member) => member.user_id === persisted.id)?.display_name?.trim() ||
            (persisted.id === demoProfile.id ? demoProfile.display_name : '');
          if (ownName) useSessionStore.getState().refreshUser({ ...persisted, displayName: ownName });
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const session = data.session;
      if (!session) {
        setStatus('guest');
        setReady(true);
        return;
      }
      // La session ET le foyer sont posés avant le premier rendu : `setReady`
      // sans attendre laissait `status` à `initialising` pendant que le
      // routeur affichait déjà les routes, et la garde renvoyait vers
      // `/connexion` un utilisateur pourtant connecté (rechargement).
      // La session ET le foyer sont posés avant le premier rendu : `setReady`
      // sans attendre laissait `status` à `initialising` pendant que le
      // routeur affichait déjà les routes, et la garde renvoyait vers
      // `/connexion` un utilisateur pourtant connecté (rechargement).
      await applySession(session.user);
      if (!active) return;
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

/**
 * Comptes liés (fusion email + OAuth).
 *
 * Supabase Auth ne fusionne jamais deux `auth.users` tout seul : sans liaison,
 * « compte email » puis « Continuer avec Google » sur la même adresse crée un
 * second utilisateur, donc un second profil et des foyers séparés. La voie
 * officielle est la liaison manuelle, en session : `linkIdentity` ajoute une
 * seconde identité au même `auth.users`, et les deux connexions mènent ensuite
 * au même profil. Requiert « Enable Manual Linking » côté Auth.
 */
export type OAuthProvider = 'google' | 'facebook';

export interface LinkedIdentity {
  provider: string;
  identityId: string;
  email?: string;
}

export async function getLinkedIdentities(): Promise<LinkedIdentity[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return (data?.identities ?? []).map((identity: UserIdentity) => ({
    provider: identity.provider,
    identityId: String(identity.identity_id),
    email: typeof identity.identity_data?.email === 'string' ? identity.identity_data.email : undefined,
  }));
}

/** Lie Google/Facebook au compte connecté (redirection OAuth, comme à la connexion). */
export async function linkOAuthProvider(provider: OAuthProvider) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${window.location.origin}/parametres`,
      scopes: provider === 'facebook' ? 'email,public_profile' : undefined,
    },
  });
  if (error) throw error;
}

/** Délie un fournisseur déjà lié. Refuse de retirer le dernier mode de connexion. */
export async function unlinkOAuthProvider(provider: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  const identities = data?.identities ?? [];
  const target = identities.find((identity: UserIdentity) => identity.provider === provider);
  if (!target) throw new Error('Ce compte n’est pas lié.');
  if (identities.length <= 1) throw new Error('Impossible de retirer le dernier mode de connexion.');
  const { error: unlinkError } = await supabase.auth.unlinkIdentity(target);
  if (unlinkError) throw unlinkError;
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
