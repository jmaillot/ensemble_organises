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
import { useHouseholdStore } from '@/stores/household-store';
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
          path="/ardoise"
          element={
            <LazyRoute load={routeChunkLoaders.ardoise} />
          }
        />
        <Route
          path="/ardoise/:id"
          element={
            <LazyRoute load={routeChunkLoaders.ardoiseDetail} />
          }
        />
        <Route
          path="/cadeaux"
          element={
            <LazyRoute load={routeChunkLoaders.cadeaux} />
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
            <LazyRoute load={routeChunkLoaders.animaux} />
          }
        />
        <Route
          path="/prestataires"
          element={
            <LazyRoute load={routeChunkLoaders.prestataires} />
          }
        />
        <Route
          path="/fidelite"
          element={
            <LazyRoute load={routeChunkLoaders.fidelite} />
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
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export { ErrorState };
