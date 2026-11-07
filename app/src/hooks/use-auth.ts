import { useCallback, useEffect, useState } from 'react';
import type { User, UserIdentity } from '@supabase/supabase-js';
import { onlineManager } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { lireSessionPersistee, sessionPersisteeValide, MARGE_EXPIRATION_S } from '@/lib/supabase/session-cache';
import { data } from '@/lib/data';
import { useSessionStore, assertSignOutAllowed } from '@/stores/session-store';
import { DEMO_HOUSEHOLD_ID, demoMembers, demoProfile } from '@/lib/data/seed';
import { useHouseholdStore } from '@/stores/household-store';
import { connectOfflineCache } from '@/lib/offline/query-persistence';
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
 * Une session **déjà établie et dont le foyer est chargé** n'est que rafraîchie :
 * un renouvellement de jeton ne doit pas recharger le foyer. Le témoin est
 * `householdLoaded`, pas le statut : `signIn` passe le statut à `authenticated`
 * avant d'attendre `loadHousehold`, donc un échec de cette lecture laissait
 * `status === 'authenticated'` avec un foyer jamais posé. La reprise
 * (`TOKEN_REFRESHED`, `SIGNED_IN`) sortait alors par ce raccourci et le foyer
 * n'était jamais relu (`deferred-items.md` §4). Tant que le foyer n'est pas
 * chargé, on repasse par le chemin complet.
 */
export async function applySession(user: User): Promise<void> {
  const sessionUser = toSessionUser(user);
  const store = useSessionStore.getState();
  if (store.status === 'authenticated' && store.householdLoaded && store.user?.id === sessionUser.id) {
    // Le nom de référence vit dans `profiles` (chemin complet ci-dessous) :
    // un renouvellement de jeton n'apporte que les métadonnées Auth et
    // écraserait le nom du profil par l'email. On garde le nom déjà connu.
    // Règle (énoncée ici, une seule fois dans ce fichier) : un nom vide
    // persisté se répare, on ne redemande pas la saisie.
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

/** Contrat d'amorçage rendu par `useAuthBootstrap`. */
export interface AuthBootstrap {
  /** L'application peut être affichée : l'amorçage a abouti, succès ou échec. */
  ready: boolean;
  /**
   * Échec d'amorçage, ou `null`. L'objet est conservé pour l'observabilité mais
   * n'est jamais rendu : `main.tsx` affiche un message fixe, un message réseau
   * pouvant transporter une URL, un jeton ou un détail serveur.
   */
  error: Error | null;
  /** Relance l'amorçage. */
  retry: () => void;
}

/** Restaure la session Supabase au chargement et le foyer de l'utilisateur. */

/**
 * Échéance du gardien d'amorçage (plan 35-06, gap G-35-3) : 10 s. La fenêtre
 * de backoff du rafraîchissement GoTrue (`AUTO_REFRESH_TICK_DURATION_MS`)
 * monte à 30 s — attendre autant, c'est perdre l'utilisateur devant un
 * spinner. 10 s laissent passer un cold-start Android lent sur un réseau réel
 * dégradé, tout en restant nettement sous cette fenêtre et sous la patience
 * d'un utilisateur. Exportée pour que les tests pilotent la même valeur.
 */
export const DELAI_GARDIEN_AMORCAGE_MS = 10_000;

export function useAuthBootstrap(): AuthBootstrap {
  // Tant que la session n'est pas restaurée, l'application affiche un état de
  // chargement : sinon une route protégée redirigerait vers la connexion.
  const [ready, setReady] = useState(false);
  // Un échec d'amorçage (réseau, backend indisponible, jeton rejeté) était
  // auparavant invisible : `setReady(true)` n'était atteint qu'en cas de
  // succès, et l'application restait sur « Chargement… » indéfiniment (WR-04).
  const [error, setError] = useState<Error | null>(null);
  // La reprise RELANCE l'effet plutôt que de rejouer l'amorçage dans une
  // seconde fonction : deux copies du même chemin divergent — c'est
  // exactement comment la branche d'échec a disparu de la première.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Chaque tentative repart d'un état neutre. `ready` retombe aussi : sinon
    // une reprise laisserait le routeur s'afficher avec le statut laissé par
    // la tentative précédente, et la garde renverrait vers `/connexion`.
    setError(null);
    setReady(false);

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
        // Le miroir local du profil est la ligne membre : c'est de là que se
        // lit le nom à réparer. La règle qui commande cette réparation est
        // énoncée une seule fois, dans `applySession` (cf. ci-dessus).
        if (!persisted.displayName?.trim()) {
          const ownName =
            useHouseholdStore.getState().members.find((member) => member.user_id === persisted.id)?.display_name?.trim() ||
            (persisted.id === demoProfile.id ? demoProfile.display_name : '');
          if (ownName) useSessionStore.getState().refreshUser({ ...persisted, displayName: ownName });
        }
        // Le foyer est posé directement ci-dessus : la lecture « foyer chargé »
        // a bien eu lieu, on le marque explicitement pour que `applySession`
        // (un `TOKEN_REFRESHED` plus tard) n'aille pas le relire.
        useSessionStore.setState({ status: 'authenticated', householdLoaded: true });
        setReady(true);
      } else {
        // Ce n'est pas `setStatus('guest')` : le statut seul laissait
        // l'utilisateur ET le foyer persistés, et les deux stores étant
        // persistés, ils revenaient au rechargement suivant. `signOut()` est le
        // seul chemin qui vide réellement les deux (D-07). Depuis la 33-04,
        // `signOut` peut rejeter (échec de purge, D-05) : le rejet est
        // journalisé (§2.7 F — un échec muet est un échec inexpliqué), pas
        // avalé ; au bootstrap sans session, il n'y a pas d'utilisateur pour
        // toast.
        void useSessionStore.getState().signOut().catch((cause) => {
          console.error('[auth] purge de déconnexion impossible au bootstrap (mode local) :', cause);
        });
        setReady(true);
      }
      return;
    }

    let active = true;

    // Branche d'échec unique : elle pose l'erreur ET `setReady(true)`, sans
    // quoi l'écran de chargement resterait affiché pour toujours. Le garde
    // `active` est respecté : un démontage ne pose aucun état.
    const fail = (cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause : new Error('Amorçage de session impossible.'));
      setReady(true);
    };

    // Plan 35-04 (gaps §1.4/§1.5 de 35-VERIFICATION.md) : hors-ligne, un rejet
    // du bootstrap (rafraîchissement de jeton impossible, lectures foyer
    // réseau) ne doit jamais bloquer le routeur sur l'écran d'erreur WR-04 —
    // les gardes en aval (RequireAuth, écran « connexion requise » D-07)
    // décident, pas l'écran technique. On passe par le chemin invité exact de
    // la branche « session absente » ci-dessous : purge best-effort des deux
    // stores persistés, puis `setReady(true)` pour laisser le routeur monter.
    const cheminInvite = () => {
      void useSessionStore.getState().signOut().catch((cause) => {
        console.error('[auth] purge de déconnexion impossible au bootstrap (hors ligne) :', cause);
      });
      setReady(true);
    };

    // Plan 35-08 (gap G-35-5) : avant toute purge hors-ligne, consulter la
    // session persistée GoTrue. Une session VALIDE (expires_at > now + marge)
    // rétablit l'état authentifié depuis le cache : le signOut inconditionnel
    // de `cheminInvite` déconnectait de fait un utilisateur dont la session
    // vivante n'était simplement pas consultable (getSession hang H2 en mode
    // avion Android). La validité cryptographique reste prouvée au premier
    // contact serveur (RLS + JWT) ; la décision locale engage la durée du
    // mode avion, d'où la marge de `MARGE_EXPIRATION_S`.
    //
    // `sessionEnMain` : les sites qui possèdent déjà la session (branche
    // expires_at) la transmettent au lieu de forcer une relecture du cache.
    const cheminHorsLigneValide = async (cause: string, sessionEnMain?: { user: User; expires_at: number }) => {
      let utilisateur = sessionEnMain?.user ?? null;
      let expireA = sessionEnMain?.expires_at ?? null;
      if (!utilisateur || expireA === null) {
        const cache = lireSessionPersistee();
        utilisateur = cache?.user ?? null;
        expireA = cache?.expiresAtSeconds ?? null;
      }
      if (!utilisateur || expireA === null || !sessionPersisteeValide(expireA)) {
        // §2.7 F — jamais un succès muet : chaque purge est dite, avec sa cause.
        console.warn(
          `[auth] chemin hors-ligne (${cause}) : session persistée absente, illisible ou expirée — chemin invité`,
        );
        cheminInvite();
        return;
      }
      const sessionUser = toSessionUser(utilisateur);
      // La règle de réparation du nom est énoncée dans `applySession` (branche
      // mode local) : la ligne membre persistée de household-store est la
      // source de référence, jamais les métadonnées Auth seules.
      const nomMembre = useHouseholdStore
        .getState()
        .members.find((member) => member.user_id === sessionUser.id)
        ?.display_name?.trim();
      if (!sessionUser.displayName?.trim() && nomMembre) sessionUser.displayName = nomMembre;
      try {
        // `signIn` passe le statut à `authenticated` avant de charger le foyer
        // ; `loadHousehold` tire alors son repli 35-04 (la sonde 35-07 a posé
        // `onlineManager.setOnLine(false)`), donc le foyer persisté est rendu.
        await useSessionStore.getState().signIn(sessionUser);
      } catch (causeSignIn) {
        // Si `signIn` rejette tout de même (pas de foyer persisté, par
        // exemple), retomber sur la purge : jamais d'écran WR-04 depuis ce
        // chemin — les gardes en aval décident.
        console.error(`[auth] chemin hors-ligne (${cause}) : rétablissement depuis le cache impossible — chemin invité :`, causeSignIn);
        cheminInvite();
        return;
      }
      console.warn(
        `[auth] chemin hors-ligne (${cause}) : session persistée valide rétablie depuis le cache — revalidation serveur au retour du réseau`,
      );
      // Même restore best-effort que la chaîne normale (T-33-09, asymétrie
      // volontaire) : l'identité vient des stores, jamais des arguments de la
      // closure. Import DYNAMIQUE du client : cf. commentaire du même import
      // dans la chaîne d'amorçage (cycle de modules évité).
      try {
        const { queryClient } = await import('@/app/router');
        const userId = useSessionStore.getState().user?.id;
        const householdId = useHouseholdStore.getState().householdId;
        if (userId && householdId) {
          try {
            await connectOfflineCache(queryClient, userId, householdId);
          } catch (causeRestore) {
            console.error('[offline] restore du cache impossible, démarrage avec un cache vide :', causeRestore);
          }
        }
      } catch (causeImport) {
        console.error('[offline] restore du cache impossible, démarrage avec un cache vide :', causeImport);
      }
      if (!active) return;
      setReady(true);
    };

    // Plan 35-06 (gap G-35-3, diagnostic dlnk02) : sous Android cold-start,
    // la promesse `getSession()` peut ne JAMAIS se terminer — GoTrue attend
    // son `initializePromise`, qui tente un rafraîchissement réseau avec
    // backoff (fenêtre jusqu'à 30 s, sans timeout applicatif), et
    // `navigator.onLine` vaut true même en mode avion (H1). Tous les replis
    // aval (conditionnés à un rejet ou à onLine=false) sont alors
    // inatteignables et « Chargement de votre foyer… » reste indéfini.
    // Le témoin `reglee` est posé par le PREMIER point de sortie de la
    // chaîne ou du gardien : une résolution TARDIVE de la chaîne réelle ne
    // doit rien ré-appliquer après le chemin invité (T-35-06). Le témoin ne
    // verrouille PAS le listener `onAuthStateChange` : le verrouiller
    // supprimerait son rattrapage légitime (TOKEN_REFRESHED/SIGNED_IN
    // pendant que l'app tourne — `reglee` vaut déjà true à ce moment) ; ce
    // chemin listener reste couvert par la RLS serveur (choix documenté,
    // revue du plan).
    let reglee = false;

    // Le gardien course la chaîne ci-dessous contre une échéance seule. Il ne
    // consulte VOLONTAIREMENT PAS `onlineManager` : `navigator.onLine` vaut
    // true en mode avion Android (H1) — c'est précisément la source
    // trompeuse qui rendait le hang invisible pour tous les replis 35-04.
    const gardien = setTimeout(() => {
      if (reglee || !active) return;
      // Témoin posé AVANT l'effet : la chaîne qui résout après coup est
      // bloquée par les gardes `reglee` de ses branches.
      reglee = true;
      // §2.7 F — jamais un succès muet : chaque déclenchement est dit.
      console.warn(
        "[auth] gardien d'amorçage : la restauration de session n'a pas abouti en 10 s, consultation de la session persistée avant tout chemin invité (réseau probablement indisponible malgré navigator.onLine)",
      );
      void cheminHorsLigneValide('gardien 10 s');
    }, DELAI_GARDIEN_AMORCAGE_MS);

    const chaineAmorcage = supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        // Gardien déjà passé : la session résout trop tard, elle ne doit
        // rien ré-appliquer après le chemin invité (témoin reglee).
        if (reglee) return;
        const session = data.session;
        if (!session) {
          // Même chemin qu'en mode local : `setStatus('guest')` laissait
          // l'utilisateur et le foyer persistés, donc une session expirée ou
          // révoquée côté serveur laissait l'application *paraître* connectée
          // au rechargement suivant. `signOut()` vide les deux stores (D-07).
          // Depuis la 33-04, `signOut` peut rejeter (échec de purge, D-05) :
          // rejet journalisé, pas avalé (§2.7 F).
          void useSessionStore.getState().signOut().catch((cause) => {
            console.error('[auth] purge de déconnexion impossible au bootstrap (session absente) :', cause);
          });
          setReady(true);
          return;
        }
        // T-35-06 (35-08) : hors-ligne, une session dont `expires_at` est
        // dépassé — ou dans la marge de validité, le rafraîchissement exigeant
        // le réseau qui a déjà échoué — ne doit JAMAIS être appliquée comme
        // authentifiée. La session est en main : elle passe par le MÊME chemin
        // hors-ligne que les autres sites (classe corrigée, pas l'instance) —
        // le helper la juge avec la marge commune et retombe sur la purge si
        // invalide. En ligne, le comportement est inchangé : supabase-js
        // tentera le rafraîchissement réseau de lui-même.
        if (
          typeof session.expires_at === 'number' &&
          session.expires_at <= Date.now() / 1000 + MARGE_EXPIRATION_S &&
          !onlineManager.isOnline()
        ) {
          void cheminHorsLigneValide('expires_at dépassé hors-ligne', {
            user: session.user,
            expires_at: session.expires_at,
          });
          return;
        }
        try {
          // `applySession` lit le profil et charge le foyer : il rejette pour
          // les mêmes causes réseau, et doit produire le même écran.
          await applySession(session.user);
        } catch (cause) {
          // Le gardien a déjà basculé pendant l'attente : ne rien ajouter, la
          // décision a déjà été prise (témoin reglee).
          if (reglee) return;
          // Hors-ligne, le rejet d'`applySession` (une lecture foyer que la
          // tolérance de `loadHousehold` n'a pas pu tenir — pas de foyer
          // persisté, par exemple) ne doit pas davantage bloquer le routeur :
          // même chemin hors-ligne que les autres sites (35-08), les gardes
          // en aval décident.
          if (!onlineManager.isOnline()) {
            void cheminHorsLigneValide('rejet applySession hors-ligne');
            return;
          }
          fail(cause);
          return;
        }
        if (!active) return;
        if (reglee) {
          // Contrat reglee redérivé (35-08) : sous 35-06, le gardien
          // n'établissait que l'état INVITÉ, donc purger une session tardive
          // était correct. Désormais, le gardien peut avoir établi un état
          // AUTHENTIFIÉ-HORS-LIGNE (cheminHorsLigneValide) : purger cet état
          // serait la déconnexion de fait exacte que G-35-5 retire —
          // intermittente et inattribuable (V5 prouve la course réelle).
          // Le rappel consulte donc le store AVANT de décider : no-op quand
          // le store est déjà authentifié (l'état vient du même cache, une
          // résolution tardive ne ré-applique rien) ; purge T-35-06 inchangée
          // quand il ne l'est pas (état invité, prémisse 35-06).
          if (useSessionStore.getState().status === 'authenticated') return;
          cheminInvite();
          return;
        }
        // Le cache offline est restauré puis élagué AVANT `setReady(true)`
        // (OFFR-01) : le routeur ne monte jamais sans cache restauré. Les
        // identités viennent des stores, posés par `applySession` juste
        // au-dessus — jamais des arguments de la closure, qui seraient
        // obsolètes à la reprise. Import DYNAMIQUE du client : `router.tsx`
        // importe déjà `use-auth` statiquement, un import statique inverse
        // créerait un cycle de modules ; au runtime, le module est chargé
        // (`main.tsx` importe `AppRouter`) et l'import se résout du cache.
        // ÉCHEC BEST-EFFORT (T-33-09, asymétrie volontaire) : un IndexedDB
        // corrompu ou indisponible NE bloque pas le démarrage — on journalise
        // (§2.7 F : un succès muet est un échec inexpliqué) et on continue
        // avec un cache vide, la source de vérité reste le serveur. Inverse
        // de la purge (D-05), qui, elle, bloque la déconnexion : ici la
        // disponibilité prime sur la lecture offline.
        const { queryClient } = await import('@/app/router');
        const userId = useSessionStore.getState().user?.id;
        const householdId = useHouseholdStore.getState().householdId;
        if (userId && householdId) {
          try {
            await connectOfflineCache(queryClient, userId, householdId);
          } catch (cause) {
            console.error('[offline] restore du cache impossible, démarrage avec un cache vide :', cause);
          }
        }
        if (!active) return;
        // La session ET le foyer sont posés avant le premier rendu : `setReady`
        // sans attendre laissait `status` à `initialising` pendant que le
        // routeur affichait déjà les routes, et la garde renvoyait vers
        // `/connexion` un utilisateur pourtant connecté (rechargement). Le
        // contrat est étendu au cache offline : restore + prune sont faits
        // avant ce point (OFFR-01, commentaire au-dessus).
        setReady(true);
      })
      .catch((cause) => {
        // Le gardien a déjà rétabli le chemin invité : le rejet tardif de la
        // chaîne ne doit ni re-purger ni afficher WR-04 par-dessus.
        if (reglee) return;
        // Plan 35-04 : le rejet de la chaîne `getSession` elle-même (lecture du
        // stockage de session + rafraîchissement réseau) subit le même régime
        // que le reste — hors-ligne, le même chemin hors-ligne que les autres
        // sites (35-08 : session persistée valide rétablie, purge sinon) ;
        // en ligne, écran WR-04.
        if (!onlineManager.isOnline()) {
          void cheminHorsLigneValide('rejet de la chaîne hors-ligne');
          return;
        }
        fail(cause);
      });
    // Le témoin est posé quand la CHAÎNE se termine (après le `setReady`) :
    // tant qu'elle est en vol, seul l'échéancier du gardien peut le poser.
    // La minuterie est annulée en même temps : un amorçage réussi ne doit
    // jamais déclencher le gardien après coup (W3).
    void chaineAmorcage.finally(() => {
      reglee = true;
      clearTimeout(gardien);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Depuis la 33-04, `signOut` peut rejeter (échec de purge, D-05) :
        // le rejet est journalisé (§2.7 F), pas avalé — logger suffit ici,
        // l'utilisateur est déjà parti côté serveur.
        void useSessionStore.getState().signOut().catch((cause) => {
          console.error('[auth] purge de déconnexion impossible (événement SIGNED_OUT) :', cause);
        });
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
      // Le gardien ne doit pas échoir après démontage (reprise : une nouvelle
      // tentative repose un effect, donc un nouveau gardien).
      clearTimeout(gardien);
      listener.subscription.unsubscribe();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { ready, error, retry };
}

export async function signInWithProvider(provider: 'google') {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/accueil` },
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
export type OAuthProvider = 'google';

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

/** Lie Google au compte connecté (redirection OAuth, comme à la connexion). */
export async function linkOAuthProvider(provider: OAuthProvider) {
  if (!supabase) throw new Error('Supabase n’est pas configuré sur cet environnement.');
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${window.location.origin}/parametres`,
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

export async function signOut(options?: { acknowledgePendingWrites?: boolean }) {
  // WR-01 (D-17, classe corrigée) : le scan précède la révocation. Si des
  // écritures pendantes rejettent la déconnexion (OutboxPendingError), le
  // jeton serveur est ENCORE VALIDE — l'utilisateur qui annule la dialog
  // garde une app réellement fonctionnelle, et le rejeu de la file peut
  // partir. Avant ce correctif, la révocation passait d'abord : annuler la
  // dialog laissait un jeton mort derrière un statut « authenticated ».
  // L'acknowledgment est ensuite transmis au goulot tel quel : si le scan a
  // rejeté, on n'atteint jamais la révocation ; sinon le goulot re-scanne
  // sans effet pour les chemins qui n'ont pas scanné (listener SIGNED_OUT…).
  await assertSignOutAllowed(options);
  try {
    if (supabase) await supabase.auth.signOut();
  } finally {
    // La session locale tombe dans tous les cas : un échec réseau ne doit
    // jamais laisser l'utilisateur connecté en apparence seulement.
    // La purge vit dans le goulot `session-store.signOut` (D-05, Pitfall 4) —
    // elle n'est PAS dupliquée ici. Son échec se propage à l'appelant, qui
    // toast la copy UI-SPEC portée par l'erreur et NE déconnecte PAS
    // l'utilisateur localement (profile-form : pas de navigation en cas
    // d'erreur) — jamais de déconnexion « réussie » qui laisserait les
    // données de l'utilisateur derrière elle (T-33-11).
    // D-17 : `options.acknowledgePendingWrites` est transmis tel quel — seul
    // le goulot décide ; le hook `useSignOutWithConfirm` est le canal UI qui
    // pose la question après une `OutboxPendingError`.
    await useSessionStore.getState().signOut(options);
  }
}

export const demoUser: SessionUser = {
  id: demoProfile.id,
  email: demoProfile.email,
  displayName: demoProfile.display_name,
  avatarUrl: demoProfile.avatar_url,
  provider: 'email',
};
