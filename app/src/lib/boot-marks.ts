/**
 * Instrumentation de démarrage (phase 42, COLD-01) : marques
 * `performance.mark`/`performance.now` aux quatre segments (entry chunk,
 * activation SW, restore IndexedDB, auth bootstrap), agrégées dans un store
 * zustand de SESSION — patron `sw-register.ts` (store hors-React accessible
 * par `getState()`/`setState()` depuis du code non-composant).
 *
 * PD-02 : ce module n'écrit RIEN dans IndexedDB — ajouter de l'I/O au
 * démarrage fausserait la mesure par l'instrumentation elle-même. Le store
 * vit en mémoire de session ; la référence de mesure reste le doc mesures
 * versionné (PM-03), jamais une persistance dans l'app.
 *
 * PD-03 : les marques sont TOUJOURS actives — aucun flag de build ne les
 * conditionne (le harnais `VITE_E2E_SW_HARNESS` de main.tsx est le
 * contre-exemple assumé, pas un patron à copier).
 */
import { create } from 'zustand';

/** Les quatre segments de démarrage mesurés (COLD-01). */
export type SegmentAmorcage = 'entry' | 'sw' | 'idb' | 'auth';

interface BootMarksState {
  /** Durée du segment en ms, `null` = non mesuré sur ce démarrage. */
  entry: number | null;
  sw: number | null;
  idb: number | null;
  auth: number | null;
  /**
   * Total du démarrage, borne à borne : `boot:done − boot:entry:debut` —
   * JAMAIS la somme des quatre segments (les segments se chevauchent : le
   * restore IndexedDB est imbriqué dans le bootstrap auth, et l'activation
   * SW partage la borne de début de l'entry chunk).
   */
  totalMs: number | null;
}

const ETAT_VIERGE: BootMarksState = { entry: null, sw: null, idb: null, auth: null, totalMs: null };

// D-12 (même discipline que le SW) : le panneau offline est le SEUL
// consommateur React. Le store est lu au montage du panneau uniquement
// (Pitfall 1) — aucune subscription active pendant le démarrage : un
// abonnement React qui réagirait aux mesures ajouterait du travail de rendu
// au moment même où l'on mesure.
export const useBootMarks = create<BootMarksState>()(() => ({ ...ETAT_VIERGE }));

// Bornes de début du passage courant, HORS store : elles ne sont jamais
// affichées (D-11 — la section n'expose que des durées), et les garder hors
// du state évite qu'un rendu ne réagisse à leur pose.
const bornesDebut: Partial<Record<SegmentAmorcage, number>> = {};

/** Pose un `performance.mark` et renvoie l'horodatage `performance.now()`. */
function poserMark(nom: string): number {
  const horodatage = performance.now();
  try {
    performance.mark(nom);
  } catch {
    // Environnement sans API User Timing : la mesure continue (les durées
    // du store restent justes), seules les marques devtools sont absentes.
  }
  return horodatage;
}

/**
 * Pose la borne de DÉBUT d'un segment.
 *
 * Convention de bornes (convention du protocole COLD-01) : les segments `sw`
 * et `auth` n'ont PAS de début propre — leur borne de début est la borne
 * commune posée par `marquerSegmentDebut('entry')`, car l'enregistrement du
 * service worker et le bootstrap auth démarrent avec le bundle lui-même
 * (`main.tsx` pose le mark entry au niveau module, avant tout travail).
 * Seul `idb` porte un début explicite : le restore IndexedDB démarre au
 * milieu du bootstrap auth, à l'appel de `connectOfflineCache` dans
 * `use-auth.ts`.
 *
 * `marquerSegmentDebut('entry')` réinitialise tout le store : le DERNIER
 * passage gagne (Pitfall 2 — StrictMode double-monte en dev, et une reprise
 * d'amorçage rejoue l'effet ; garder les valeurs d'un passage précédent
 * afficherait des durées d'un autre démarrage que celui en cours).
 */
export function marquerSegmentDebut(segment: SegmentAmorcage): void {
  if (segment === 'entry') {
    bornesDebut.entry = undefined;
    bornesDebut.sw = undefined;
    bornesDebut.idb = undefined;
    bornesDebut.auth = undefined;
    useBootMarks.setState({ ...ETAT_VIERGE });
  }
  bornesDebut[segment] = poserMark(`boot:${segment}:debut`);
}

/**
 * Pose la borne de FIN d'un segment et enregistre sa durée dans le store.
 *
 * Sans début propre posé (segments `sw` et `auth`, ou appel d'un `fin` sans
 * `debut`), la durée se mesure depuis la borne entry du passage courant —
 * c'est la convention voulue, PAS une anomalie (Pitfall 3) : au cold start
 * hors ligne, le callback `onRegisteredSW` peut ne JAMAIS se déclencher ou
 * se déclencher à ~0 ms ; l'ÉCART entre runs est un fait à consigner dans le
 * doc mesures, jamais lissé ni masqué. Un segment absent reste `null` et le
 * panneau affiche son repli honnête.
 *
 * La fin du segment `auth` pose aussi le mark `boot:done` et calcule le
 * total borne à borne (`boot:done − boot:entry:debut`).
 */
export function marquerSegmentFin(segment: SegmentAmorcage): void {
  const debut = bornesDebut[segment] ?? bornesDebut.entry;
  const fin = poserMark(`boot:${segment}:fin`);
  const duree = performance.now() - (debut ?? fin);
  useBootMarks.setState({ [segment]: duree } as Partial<BootMarksState>);
  if (segment === 'auth') {
    // Total borne à borne (Pattern 2) : la fenêtre réelle du démarrage, pas
    // la somme de segments qui se chevauchent. Sans borne entry (passage
    // partiel), le total reste `null` — afficher un total dérivé d'une borne
    // manquante serait une valeur fausse avec assurance.
    useBootMarks.setState({ totalMs: bornesDebut.entry === undefined ? null : performance.now() - bornesDebut.entry });
  }
}
