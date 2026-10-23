import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * Bandeau global d'état hors ligne.
 *
 * Monté une seule fois dans `AppRouter` (sous `BrowserRouter`, à côté de
 * `ScrollToTop`), il ne dépend d'aucune route : il couvre donc aussi bien le
 * shell connecté que les pages hors shell — l'accueil compris.
 *
 * POURQUOI LE TEXTE DIT TOUT. L'accueil n'a **aucune** gestion d'erreur propre
 * (arbitrage explicite de l'utilisateur, `09-CONTEXT`/`261019-dw6-CONTEXT`) :
 * ses widgets continuent d'afficher « rien » quand une lecture échoue. Ce
 * bandeau est donc le SEUL endroit qui porte l'explication de la coupure, et il
 * doit la porter à lui seul : il nomme la coupure, dit que l'application ne
 * peut pas lire les données du foyer, et prévient qu'une zone vide peut ne pas
 * être son contenu réel — sans jamais laisser croire que l'affichage est à
 * jour. C'est la contrepartie assumée de l'arbitrage : pas d'état d'erreur par
 * widget, mais une explication globale honnête.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-coral/30 bg-coral-soft/70 px-4 py-2.5 text-center text-[12px] font-semibold text-coral-text"
    >
      <p className="m-0">
        Vous êtes hors ligne : l’application ne peut pas lire les données du foyer pour le moment. Une zone vide
        peut ne pas être son contenu réel — rétablissez la connexion pour la charger.
      </p>
    </div>
  );
}
