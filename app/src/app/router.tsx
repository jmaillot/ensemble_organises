import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorState } from '@/components/ui/empty-state';
import { AppShell } from './app-shell';
import { useIsAuthenticated } from '@/hooks/use-auth';
import { useHouseholdStore } from '@/stores/household-store';

const LandingPage = lazy(() => import('@/modules/landing/landing-page'));
const SignInPage = lazy(() => import('@/modules/landing/sign-in-page'));
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
  return <>{children}</>;
}

/** Un utilisateur connecté sans foyer est redirigé vers le choix créer/rejoindre. */
function RequireHousehold({ children }: { children: ReactNode }) {
  const householdId = useHouseholdStore((state) => state.householdId);
  if (!householdId) {
    return <Navigate to="/foyer" replace />;
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
            <Suspense fallback={<RouteFallback />}>
              <WelcomePage />
            </Suspense>
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
