import { useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/ui/empty-state';
import { LazyRoute, RouteFallback } from '@/components/ui/route-error';
import { routeChunkLoaders } from './route-preload';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppShell } from './app-shell';
import { signOut, useIsAuthenticated, useSessionUser } from '@/hooks/use-auth';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import { Forbidden } from '@/components/ui/forbidden';
import { data } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { ProfileRow } from '@/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  }
  return <RequireAttestation>{children}</RequireAttestation>;
}

/**
 * Barrage « 15 ans et plus » (CGU art. 3), UNIQUE et post-connexion : il couvre
 * tous les providers et les deux modes (une case pré-inscription serait
 * contournée en SSO resté en mode « connexion »). Horodaté dans
 * `profiles.age_attested_at`, une seule fois par compte. Refus = déconnexion.
 * En démo (backend absent), rien à attester : passage direct.
 */
export function RequireAttestation({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['profile', 'attestation', user?.id ?? ''],
    enabled: Boolean(user?.id) && isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await data.list<ProfileRow>('profiles', { id: user!.id });
      return rows[0] ?? null;
    },
  });

  if (!isSupabaseConfigured || !user) return <>{children}</>;
  if (profileQuery.isLoading) return <RouteFallback />;
  if (profileQuery.data?.age_attested_at) return <>{children}</>;

  const confirm = () => {
    if (!checked || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    void data
      .update('profiles', user.id, { age_attested_at: new Date().toISOString() })
      .then(() => queryClient.invalidateQueries({ queryKey: ['profile', 'attestation', user.id] }))
      .catch((updateError: unknown) =>
        setSaveError(updateError instanceof Error ? updateError.message : 'Enregistrement impossible.'),
      )
      .finally(() => setIsSaving(false));
  };

  const refuse = () => {
    void signOut().then(() => {
      toast('Compte déconnecté.');
      navigate('/connexion', { replace: true });
    });
  };

  return (
    <>
      {children}
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <p className="eyebrow mb-2">Première connexion</p>
            <DialogTitle>Une dernière étape avant de commencer</DialogTitle>
            <DialogDescription>
              L’utilisation du service est réservée aux personnes de 15 ans et plus (CGU, article 3). En dessous de
              15 ans, un parent doit créer un profil « enfant » depuis son propre compte.
            </DialogDescription>
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(change) => setChecked(change.target.checked)}
              className="mt-0.5 accent-accent"
            />
            Je certifie avoir 15 ans ou plus.
          </label>
          {saveError ?? profileQuery.isError ? (
            <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
              {saveError ?? 'Profil introuvable, reconnectez-vous.'}
            </p>
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={refuse}>
              Refuser et se déconnecter
            </Button>
            <Button onClick={confirm} disabled={!checked || isSaving}>
              {isSaving ? 'Enregistrement…' : 'Confirmer'}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Un utilisateur connecté sans foyer est redirigé vers le choix créer/rejoindre. */
function RequireHousehold({ children }: { children: ReactNode }) {
  const householdId = useHouseholdStore((state) => state.householdId);
  if (!householdId) {
    return <Navigate to="/foyer" replace />;
  }
  return <>{children}</>;
}

/**
 * Un utilisateur qui a déjà un foyer n'a rien à faire sur le choix
 * créer/rejoindre : la page y affirme « Vous n'avez pas encore de foyer »,
 * et l'y laisser croire fait créer des foyers en double. `/foyer/nouveau` et
 * `/foyer/rejoindre` restent accessibles (second foyer légitime).
 */
function RequireNoHousehold({ children }: { children: ReactNode }) {
  const householdId = useHouseholdStore((state) => state.householdId);
  if (householdId) {
    return <Navigate to="/accueil" replace />;
  }
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return <span key={pathname} className="sr-only" aria-live="polite" />;
}

/**
 * Garde « réservé aux grands » (phase 14, D-06) : un accès direct à l'URL
 * d'un des 5 modules hors périmètre enfant rend la page « non autorisé »
 * sobre — jamais une 404 mensongère, jamais une redirection silencieuse. Le
 * serveur refuse de toute façon (14-01) : contourner le masquage ne donne
 * rien. Les parcours d'invitation anonymes (`/invitation/*`, hors shell)
 * restent ouverts à tous par construction.
 */
function RequireGrownUp({ children }: { children: ReactNode }) {
  const currentMember = useCurrentMember();
  if (currentMember?.role === 'enfant') {
    return <Forbidden />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LazyRoute load={routeChunkLoaders.landing} />
        }
      />
      <Route
        path="/connexion"
        element={
          <LazyRoute load={routeChunkLoaders.signIn} />
        }
      />
      <Route
        path="/foyer"
        element={
          <RequireAuth>
            <RequireNoHousehold>
              <LazyRoute load={routeChunkLoaders.welcome} />
            </RequireNoHousehold>
          </RequireAuth>
        }
      />
      <Route
        path="/foyer/nouveau"
        element={
          <LazyRoute load={routeChunkLoaders.createHousehold} />
        }
      />
      <Route
        path="/foyer/rejoindre"
        element={
          <LazyRoute load={routeChunkLoaders.joinHousehold} />
        }
      />
      <Route
        path="/invitation/ardoise"
        element={
          <LazyRoute load={routeChunkLoaders.guestArdoise} />
        }
      />
      <Route
        path="/invitation/cadeau"
        element={
          <LazyRoute load={routeChunkLoaders.guestCadeau} />
        }
      />
      <Route
        path="/invitation/voyage"
        element={
          <LazyRoute load={routeChunkLoaders.guestVoyage} />
        }
      />
      <Route
        path="/confidentialite"
        element={
          <LazyRoute load={routeChunkLoaders.privacy} />
        }
      />
      <Route
        path="/conditions-utilisation"
        element={
          <LazyRoute load={routeChunkLoaders.terms} />
        }
      />
      <Route
        element={
          <RequireAuth>
            <RequireHousehold>
              <AppShell />
            </RequireHousehold>
          </RequireAuth>
        }
      >
        <Route
          path="/accueil"
          element={
            <LazyRoute load={routeChunkLoaders.dashboard} />
          }
        />
        <Route
          path="/taches"
          element={
            <LazyRoute load={routeChunkLoaders.taches} />
          }
        />
        <Route
          path="/calendrier"
          element={
            <LazyRoute load={routeChunkLoaders.calendrier} />
          }
        />
        <Route
          path="/notes"
          element={
            <LazyRoute load={routeChunkLoaders.notes} />
          }
        />
        <Route
          path="/courses"
          element={
            <LazyRoute load={routeChunkLoaders.courses} />
          }
        />
        <Route
          path="/courses/catalogue"
          element={
            <LazyRoute load={routeChunkLoaders.productCatalog} />
          }
        />
        <Route
          path="/routines"
          element={
            <LazyRoute load={routeChunkLoaders.routines} />
          }
        />
        <Route
          path="/recettes"
          element={
            <LazyRoute load={routeChunkLoaders.recettes} />
          }
        />
        <Route
          path="/recettes/:id"
          element={
            <LazyRoute load={routeChunkLoaders.recetteDetail} />
          }
        />
        <Route
          path="/ardoise"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.ardoise} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/ardoise/:id"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.ardoiseDetail} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/cadeaux"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.cadeaux} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/anniversaires"
          element={
            <LazyRoute load={routeChunkLoaders.anniversaires} />
          }
        />
        <Route
          path="/contacts"
          element={
            <LazyRoute load={routeChunkLoaders.contacts} />
          }
        />
        <Route
          path="/animaux"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.animaux} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/prestataires"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.prestataires} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/fidelite"
          element={
            <RequireGrownUp>
              <LazyRoute load={routeChunkLoaders.fidelite} />
            </RequireGrownUp>
          }
        />
        <Route
          path="/adresses"
          element={
            <LazyRoute load={routeChunkLoaders.adresses} />
          }
        />
        <Route
          path="/cercle"
          element={
            <LazyRoute load={routeChunkLoaders.cercle} />
          }
        />
        <Route
          path="/voyages"
          element={
            <LazyRoute load={routeChunkLoaders.voyages} />
          }
        />
        <Route
          path="/voyages/:tripId"
          element={
            <LazyRoute load={routeChunkLoaders.voyageDetail} />
          }
        />
        <Route
          path="/messages"
          element={
            <LazyRoute load={routeChunkLoaders.messages} />
          }
        />
        <Route
          path="/parametres"
          element={
            <LazyRoute load={routeChunkLoaders.parametres} />
          }
        />
      </Route>
      <Route
        path="*"
        element={
          <LazyRoute load={routeChunkLoaders.notFound} />
        }
      />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/*
          Navigation synchrone (15-04) : sans `useTransitions={false}`,
          React Router enveloppe la mise à jour de localisation dans une
          transition qui suspend sur le morceau paresseux de destination —
          et cette transition ne se résout jamais (la page reste figée sur
          l'ancienne route malgré l'URL à jour : création de voyage qui
          n'ouvre pas sa fiche, tuiles d'accueil inertes). En synchrone, la
          suspension affiche le repli de chargement prévu (`RouteFallback`)
          puis la page — le régime dessiné par `LazyRoute`.
        */}
        <BrowserRouter useTransitions={false}>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export { ErrorState };
