import { useOnlineStatus } from '@/hooks/use-online-status';
import { useRealtimeDegraded } from '@/hooks/use-realtime-health';

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
 *
 * Le bandeau porte aussi la panne du temps réel seul (en ligne, lectures OK,
 * événements interrompus) : un régime ambre, distinct du corail « hors
 * ligne », qui nomme ce qui manque et propose le rechargement.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const realtimeDegraded = useRealtimeDegraded();
  // Coupure réseau totale : le message « hors ligne » prime — il couvre
  // aussi les lectures. Realtime seul en panne : les lectures passent, ce
  // sont les mises à jour en direct qui manquent ; le message dit exactement
  // ça, et propose le rechargement comme voie de rattrapage.
  const message = !isOnline
    ? 'Vous êtes hors ligne : l’application ne peut pas lire les données du foyer pour le moment. Une zone vide peut ne pas être son contenu réel — rétablissez la connexion pour la charger.'
    : realtimeDegraded
      ? 'Mises à jour en direct interrompues : l’affichage peut dater. Rechargez la page pour retrouver les dernières données.'
      : null;
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 border-b px-4 py-2.5 text-center text-[12px] font-semibold ${
        isOnline ? 'border-amber/30 bg-amber-soft/70 text-amber-strong' : 'border-coral/30 bg-coral-soft/70 text-coral-text'
      }`}
    >
      <p className="m-0">{message}</p>
    </div>
  );
}
