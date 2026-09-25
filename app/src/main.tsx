import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppRouter } from '@/app/router';
import { useAuthBootstrap } from '@/hooks/use-auth';
import '@/styles/app.css';

registerSW({ immediate: true });

/**
 * Attend la restauration de session avant d'afficher l'application, afin de
 * ne pas rediriger vers la connexion un utilisateur déjà connecté.
 */
function Root() {
  const ready = useAuthBootstrap();
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
