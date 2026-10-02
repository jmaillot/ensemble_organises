import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppShell } from './app-shell';
import { signOut, useIsAuthenticated, useSessionUser } from '@/hooks/use-auth';
import { useHouseholdStore } from '@/stores/household-store';
import { data } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { ProfileRow } from '@/types';

const LandingPage = lazy(() => import('@/modules/landing/landing-page'));
const SignInPage = lazy(() => import('@/modules/landing/sign-in-page'));
const PrivacyPage = lazy(() => import('@/modules/landing/privacy-page'));
const TermsPage = lazy(() => import('@/modules/landing/terms-page'));
const GuestArdoisePage = lazy(() => import('@/modules/ardoise/guest-ardoise-page'));
const WelcomePage = lazy(() => import('@/modules/landing/welcome-page'));
const CreateHouseholdPage = lazy(() => import('@/modules/landing/create-household-page'));
const JoinHouseholdPage = lazy(() => import('@/modules/landing/join-household-page'));
const DashboardPage = lazy(() => import('@/modules/dashboard/dashboard-page'));
const TachesPage = lazy(() => import('@/modules/taches/taches-page'));
const CalendrierPage = lazy(() => import('@/modules/calendrier/calendrier-page'));
const NotesPage = lazy(() => import('@/modules/notes/notes-page'));
const CoursesPage = lazy(() => import('@/modules/courses/courses-page'));
const RoutinesPage = lazy(() => import('@/modules/routines/routines-page'));
const RecettesPage = lazy(() => import('@/modules/recettes/recettes-page'));
const ArdoisePage = lazy(() => import('@/modules/ardoise/ardoise-page'));
const ArdoiseDetailPage = lazy(() => import('@/modules/ardoise/ardoise-detail-page'));
const CadeauxPage = lazy(() => import('@/modules/cadeaux/cadeaux-page'));
const AnniversairesPage = lazy(() => import('@/modules/anniversaires/anniversaires-page'));
const AnimauxPage = lazy(() => import('@/modules/animaux/animaux-page'));
const PrestatairesPage = lazy(() => import('@/modules/prestataires/prestataires-page'));
const FidelitePage = lazy(() => import('@/modules/fidelite/fidelite-page'));
const AdressesPage = lazy(() => import('@/modules/adresses/adresses-page'));
const CerclePage = lazy(() => import('@/modules/cercle/cercle-page'));
const VoyagesPage = lazy(() => import('@/modules/voyages/voyages-page'));
const MessagesPage = lazy(() => import('@/modules/messages/messages-page'));
const ParametresPage = lazy(() => import('@/modules/parametres/parametres-page'));
const NotFoundPage = lazy(() => import('./not-found-page'));

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

function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-[38px] py-9 max-[650px]:px-[15px]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la page…</span>
      <div className="mb-6 h-9 w-64 animate-pulse rounded-[11px] bg-accent-faint" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-[16px] bg-accent-faint" />
        <div className="h-44 animate-pulse rounded-[16px] bg-accent-faint" />
      </div>
    </div>
  );
}

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
          <Suspense fallback={<RouteFallback />}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route
        path="/connexion"
        element={
          <Suspense fallback={<RouteFallback />}>
            <SignInPage />
          </Suspense>
        }
      />
      <Route
        path="/foyer"
        element={
          <RequireAuth>
            <RequireNoHousehold>
              <Suspense fallback={<RouteFallback />}>
                <WelcomePage />
              </Suspense>
            </RequireNoHousehold>
          </RequireAuth>
        }
      />
      <Route
        path="/foyer/nouveau"
        element={
          <Suspense fallback={<RouteFallback />}>
            <CreateHouseholdPage />
          </Suspense>
        }
      />
      <Route
        path="/foyer/rejoindre"
        element={
          <Suspense fallback={<RouteFallback />}>
            <JoinHouseholdPage />
          </Suspense>
        }
      />
      <Route
        path="/invitation/ardoise"
        element={
          <Suspense fallback={<RouteFallback />}>
            <GuestArdoisePage />
          </Suspense>
        }
      />
      <Route
        path="/confidentialite"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PrivacyPage />
          </Suspense>
        }
      />
      <Route
        path="/conditions-utilisation"
        element={
          <Suspense fallback={<RouteFallback />}>
            <TermsPage />
          </Suspense>
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
            <Suspense fallback={<RouteFallback />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/taches"
          element={
            <Suspense fallback={<RouteFallback />}>
              <TachesPage />
            </Suspense>
          }
        />
        <Route
          path="/calendrier"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CalendrierPage />
            </Suspense>
          }
        />
        <Route
          path="/notes"
          element={
            <Suspense fallback={<RouteFallback />}>
              <NotesPage />
            </Suspense>
          }
        />
        <Route
          path="/courses"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CoursesPage />
            </Suspense>
          }
        />
        <Route
          path="/routines"
          element={
            <Suspense fallback={<RouteFallback />}>
              <RoutinesPage />
            </Suspense>
          }
        />
        <Route
          path="/recettes"
          element={
            <Suspense fallback={<RouteFallback />}>
              <RecettesPage />
            </Suspense>
          }
        />
        <Route
          path="/ardoise"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ArdoisePage />
            </Suspense>
          }
        />
        <Route
          path="/ardoise/:id"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ArdoiseDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/cadeaux"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CadeauxPage />
            </Suspense>
          }
        />
        <Route
          path="/anniversaires"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AnniversairesPage />
            </Suspense>
          }
        />
        <Route
          path="/animaux"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AnimauxPage />
            </Suspense>
          }
        />
        <Route
          path="/prestataires"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PrestatairesPage />
            </Suspense>
          }
        />
        <Route
          path="/fidelite"
          element={
            <Suspense fallback={<RouteFallback />}>
              <FidelitePage />
            </Suspense>
          }
        />
        <Route
          path="/adresses"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AdressesPage />
            </Suspense>
          }
        />
        <Route
          path="/cercle"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CerclePage />
            </Suspense>
          }
        />
        <Route
          path="/voyages"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VoyagesPage />
            </Suspense>
          }
        />
        <Route
          path="/messages"
          element={
            <Suspense fallback={<RouteFallback />}>
              <MessagesPage />
            </Suspense>
          }
        />
        <Route
          path="/parametres"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ParametresPage />
            </Suspense>
          }
        />
      </Route>
      <Route
        path="*"
        element={
          <Suspense fallback={<RouteFallback />}>
            <NotFoundPage />
          </Suspense>
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
