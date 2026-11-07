import { onlineManager } from '@tanstack/react-query';
import { isSupabaseConfigured, supabaseUrl } from '@/lib/supabase/client';

/**
 * Sonde de joignabilité du backend — la couche correctrice de `navigator.onLine`.
 *
 * POURQUOI UNE SONDE. `navigator.onLine` ment en mode avion Android 16 (H1,
 * confirmé on-device : diagnostic dlnk02-android-cold-start-offline.md) —
 * il proclame `onLine = true` pendant que le réseau est mort. Le seed
 * optimiste de `online-status.ts` croit au mensonge, et les requêtes partent
 * vers un backend injoignable (« TypeError: Failed to fetch » au lieu du
 * chemin « cache + bandeau » prouvé sur Desktop). Cette sonde interroge un
 * endpoint racine du backend et reflète le résultat dans `onlineManager` :
 * échec observé → hors ligne (le repli foyer persisté de `loadHousehold` et
 * le bandeau s'activent, sans attendre les 10 s du gardien 35-06 qui reste
 * le filet) ; succès observé → en ligne.
 *
 * D-11 — la règle des deux directions. Ne JAMAIS proclamer en ligne sans
 * preuve : l'upgrade exige un succès OBSERVÉ de la sonde (site unique de
 * `setOnline(true)` ci-dessous). Le downgrade, lui, est permis sur preuve
 * d'échec (rejet du fetch ou échéance du délai) et sur l'événement `offline`
 * du navigateur (source fiable, immédiat). L'événement `online` seul ne
 * prouve RIEN : TanStack re-bascule `onlineManager` à true tout seul sur cet
 * événement — c'est exactement le trou que cette sonde referme — donc notre
 * listener repose l'état à false PROVISOIREMENT et relance une sonde ; le
 * succès remettra true si le backend répond vraiment.
 *
 * T-35-12 (limite honnête) : si la sonde de boot échoue alors que le réseau
 * revient sans bascule navigateur (blip backend), aucun événement `online`
 * ne se produira — l'app reste en mode cache+bandeau jusqu'à une bascule
 * réseau réelle ou un reload. Aucun retry en boucle ni timer périodique : la
 * sonde ne re-tourne qu'à chaque événement `online`/`offline`, y compris la
 * sortie du mode avion.
 *
 * T-35-14 : la réponse est OPAQUE (mode no-cors) et volontairement ignorée —
 * seul le succès/échec du fetch compte, le corps n'est jamais lu, le status
 * n'entre pas en compte. Aucune donnée utilisateur dans la requête.
 */

/** Délai d'abandon de la sonde, bien sous le gardien de 10 s de 35-06. */
export const DELAI_SONDE_MS = 4000;

/**
 * Démarre la sonde au boot : première interrogation immédiate, puis re-sonde
 * à chaque événement `online`/`offline` du navigateur. Retourne une fonction
 * de nettoyage (désabonnement + annulation de la sonde en vol) — symétrie
 * avec les minuteurs appariés de 35-06, et prise de contrôle par les tests.
 *
 * `options.delai` n'existe QUE pour les tests ; en production, le défaut
 * `DELAI_SONDE_MS` s'applique.
 */
export function demarrerSondeJoignabilite(options?: { delai?: number }): () => void {
  // D-08 / mode démo : sans Supabase configuré (build e2e, démo locale), le
  // backend n'existe pas — sonder échouerait à coup sûr et basculerait
  // l'application hors ligne à tort. No-op total : ni fetch, ni listener.
  if (!isSupabaseConfigured) return () => {};

  const delai = options?.delai ?? DELAI_SONDE_MS;
  let sondeEnVol = false;
  let annulee = false;
  let controleur: AbortController | null = null;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  const poserHorsLigne = () => {
    onlineManager.setOnline(false);
  };

  const sonder = async (): Promise<void> => {
    // Une seule sonde en vol : un second événement pendant le vol ne lance
    // PAS une seconde requête — la sonde en cours tranche pour les deux.
    if (sondeEnVol) return;
    sondeEnVol = true;
    controleur = new AbortController();
    minuteur = undefined;
    try {
      // Course entre la réponse (succès) et l'échéance du délai (échec) :
      // le tranchet ne dépend JAMAIS du rejet éventuel du fetch à l'abandon.
      await Promise.race([
        fetch(`${supabaseUrl}/auth/v1/health`, {
          method: 'GET',
          mode: 'no-cors',
          // 35-07 (hypothèse résiduelle H-A') : un succès servi par le cache
          // HTTP du navigateur ferait croire à un backend joignable en mode
          // avion. La sonde exige une preuve RÉSEAU : jamais le cache.
          cache: 'no-store',
          signal: controleur.signal,
        }).then(() => {
          // SUCCÈS OBSERVÉ : le seul site d'upgrade de tout le module.
          onlineManager.setOnline(true);
        }),
        new Promise<never>((_, rejeter) => {
          minuteur = setTimeout(() => {
            controleur?.abort();
            rejeter(new Error(`Sonde injoignable après ${delai} ms`));
          }, delai);
        }),
      ]);
    } catch {
      // ÉCHEC OBSERVÉ (rejet du fetch OU échéance) : downgrade permis sur
      // preuve. Garde `annulee` : une annulation par le nettoyage n'est pas
      // une preuve d'échec du backend — elle ne mutera pas l'état.
      if (!annulee) poserHorsLigne();
    } finally {
      // Hygiène minuteurs de 35-06 : clearTimeout apparié, toujours.
      if (minuteur !== undefined) clearTimeout(minuteur);
      minuteur = undefined;
      controleur = null;
      sondeEnVol = false;
    }
  };

  const surOnline = () => {
    // L'événement seul ne prouve rien (D-11) : l'état repart false le temps
    // de la preuve — TanStack l'aurait remonté à true sans contrôle.
    poserHorsLigne();
    void sonder();
  };

  const surOffline = () => {
    // Source fiable : bascule immédiate, sans sonde, sans délai.
    poserHorsLigne();
  };

  window.addEventListener('online', surOnline);
  window.addEventListener('offline', surOffline);

  void sonder();

  return () => {
    annulee = true;
    window.removeEventListener('online', surOnline);
    window.removeEventListener('offline', surOffline);
    if (minuteur !== undefined) clearTimeout(minuteur);
    minuteur = undefined;
    controleur?.abort();
    controleur = null;
    sondeEnVol = false;
  };
}
