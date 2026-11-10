import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// L'enregistrement du SW (mode prompt, D-09) est extrait dans sw-register :
// il pousse le bandeau de mise à jour via le store, accessible hors-React.
import '@/lib/sw-register';
// Les bornes de démarrage (phase 42, COLD-01) sont importées STATIQUEMENT et
// posées au niveau module : le mark `boot:entry:debut` doit être la PREMIÈRE
// chose que le bundle évalue — un import dynamique décalerait la borne
// commune des segments SW et auth, et donc toute la mesure.
import { marquerSegmentDebut, marquerSegmentFin } from '@/lib/boot-marks';
import { AppRouter } from '@/app/router';
import { Button } from '@/components/ui/button';
import { useAuthBootstrap } from '@/hooks/use-auth';
import { seedOnlineStatus } from '@/lib/online-status';
// La sonde est la couche correctrice du seed optimiste : navigator.onLine
// ment en mode avion Android (H1, dlnk02-android-cold-start-offline.md).
import { demarrerSondeJoignabilite } from '@/lib/reachability';
import '@fontsource-variable/fraunces';
// L'italique est le geste typographique signature de melimelo (la seconde
// ligne du héro) — il était resté au paquet, jamais embarqué (critique UI
// 2026-10-23). Même famille variable, style italic : aucun nom de police
// nouveau dans les jetons.
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/inter-tight';
import '@/styles/app.css';

// L'instrumentation de démarrage (phase 42, COLD-01) pose ici la borne
// commune de TOUT le démarrage — `boot:entry:debut` — au niveau module, avant
// le moindre travail de démarrage : les segments « activation SW » et « auth
// bootstrap » démarrent avec le bundle, leur borne de début EST celle-ci.
// PD-03 : le mark est TOUJOURS posé — aucun flag de build ne le conditionne,
// le panneau offline doit rester lisible dans un build prod réel, là où la
// décision CACHE-01 est tranchée.
marquerSegmentDebut('entry');

// L'état réseau est amorcé ICI, au niveau module, avant le premier rendu : le
// bandeau hors ligne doit dire la vérité dès la première peinture, et l'état
// doit être juste avant que `QueryClientProvider` ne monte le client — c'est
// `mount()` qui pose `onlineManager.subscribe`, donc seulement au rendu, après
// ce point. C'est ce qui rend le retour du réseau notifiable (une seule fois,
// au démarrage : ensuite, les événements `online`/`offline` prennent le relais).
seedOnlineStatus();

// La sonde de joignabilité démarre ICI, en parallèle du bootstrap : le seed
// optimiste ci-dessus peint navigator.onLine (honnête sur Desktop), la sonde
// le CORRIGE dès qu'elle a une preuve — si le backend est injoignable (mode
// avion Android, H1), onlineManager bascule false pendant que
// getSession/loadHousehold sont en cours, et le repli foyer persisté + le
// bandeau s'activent sans attendre les 10 s du gardien 35-06.
// PIRE CAS ASSUMÉ : si la première lecture d'onlineManager du bootstrap
// précède l'échéance de la sonde (4 s), le comportement reste celui de
// 35-06 (chemin invité à 10 s) — la sonde ne peut jamais DÉGRADER le
// parcours, elle le corrige au plus tôt.
demarrerSondeJoignabilite();

/**
 * Attend la restauration de session avant d'afficher l'application, afin de
 * ne pas rediriger vers la connexion un utilisateur déjà connecté — et, si
 * cette restauration échoue, affiche une erreur rejouable au lieu de laisser
 * l'écran de chargement pour toujours (WR-04).
 */
export function Root() {
  const { ready, error, retry } = useAuthBootstrap();
  if (error) {
    // Le message rendu est fixe : un message réseau peut transporter une URL,
    // un jeton ou un détail serveur. L'objet d'erreur reste dans l'état React.
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center" role="status" aria-live="polite">
        <div className="grid max-w-[420px] justify-items-center gap-4">
          <p className="m-0 text-sm text-muted">Votre foyer n’a pas pu être chargé.</p>
          <Button onClick={retry}>Réessayer</Button>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center" role="status" aria-live="polite">
        <span className="text-sm text-muted">Chargement de votre foyer…</span>
      </div>
    );
  }
  return <AppRouter />;
}

const container = document.getElementById('root');
if (!container) throw new Error('Élément racine introuvable.');

// Harnais e2e de la gate SW (phase 41, GATE-01) : chargé SEULEMENT quand la
// variable de build `VITE_E2E_SW_HARNESS` vaut '1'. Aucune chaîne de
// production ne pose cette variable (compose.app.yaml et le Dockerfile §8.2
// ne passent que les deux VITE_* Supabase) : le tree-shaking Rollup sur la
// constante d'environnement élimine l'import dynamique des autres builds —
// preuve exigée par le wrapper (`scripts/test-sw-gate.sh`) par grep du bundle
// du build standard (A2), jamais supposée. La logique de gate dans
// `sw-register.ts` reste inchangée : le harnais n'ouvre pas la porte.
if (import.meta.env.VITE_E2E_SW_HARNESS === '1') {
  void import('@/lib/e2e-sw-harness');
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
// La borne de fin de l'entry chunk se pose APRÈS l'appel `render()` : la
// durée du segment « entry chunk » couvre l'évaluation complète du bundle
// (imports, exécution module-scope) jusqu'au démarrage du premier rendu —
// c'est la définition du segment pour le protocole de mesure (COLD-01).
marquerSegmentFin('entry');
