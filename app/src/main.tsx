import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppRouter } from '@/app/router';
import { Button } from '@/components/ui/button';
import { useAuthBootstrap } from '@/hooks/use-auth';
import '@/styles/app.css';

registerSW({ immediate: true });

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

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
