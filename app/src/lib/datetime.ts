import { format } from 'date-fns';

/**
 * Point unique de conversion entre un **instant** (ce que la base stocke : une
 * colonne `timestamptz`) et la valeur d'un `<input type="datetime-local">`
 * (ce que l'utilisateur voit et saisit : une heure **locale**). D-05.
 *
 * L'aller et le retour vivent dans le même module : c'est la seule façon de
 * garantir qu'un rappel réaffiché puis réenregistré sans modification reste le
 * même instant. Le défaut d'origine (WR-07) était de faire la relecture par
 * `instant.slice(0, 16)` — la chaîne stockée est en UTC, le champ est en local :
 * un rappel de 18:30 à Paris s'affichait 16:30 et reculait de 2 h à chaque
 * enregistrement. Passer par `format` (et non par un découpage de chaîne) est
 * la correction, et c'est la seule lecture d'un instant qui vive ici.
 */

/**
 * Relecture : instant → valeur de `datetime-local` (`YYYY-MM-DDTHH:mm`), dans le
 * fuseau local du navigateur. Vide ou illisible → `''` (jamais `Invalid Date`).
 */
export function instantToLocalInput(instant: string | Date | null | undefined): string {
  if (instant === null || instant === undefined) return '';
  if (typeof instant === 'string' && instant.trim() === '') return '';
  const value = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(value.getTime())) return '';
  return format(value, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Écriture : valeur de `datetime-local` (interprétée en **local** par `Date`) →
 * instant ISO UTC. Chaîne vide = « aucun rappel » (`taches/types.ts`), tout
 * comme `null` ou une valeur illisible.
 */
export function instantOfDatetimeLocal(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// Semaine lundi → dimanche, arithmétique ISO pure en UTC.
//
// Le défaut d'origine (flake « menu du dimanche ») : le semis de
// démonstration posait ses repas avec `day(0..2)` (relatif au jour, seed.ts)
// alors que la page menu les relit sur une grille lundi → dimanche. Du lundi
// au samedi les trois repas restaient visibles ; le dimanche, ils tombaient
// sur la semaine suivante et disparaissaient de l'écran. Les deux helpers
// ci-dessous (`debutSemaineIso`, `jourSemaine`) sont la SEULE source de cette
// arithmétique : le module menu (`weekStartOf`) et le semis délèguent ici —
// aucune copie (AGENTS.md §2.7 E).
// ---------------------------------------------------------------------------

const toUtcDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};

const isoOfUtc = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Lundi de la semaine contenant la date ISO donnée. Aucune horloge figée :
 * la date est une entrée, le résultat est recalé à chaque appel.
 */
export function debutSemaineIso(isoDate: string): string {
  const date = toUtcDate(isoDate);
  const offset = (date.getUTCDay() + 6) % 7; // lundi = 0 … dimanche = 6
  date.setUTCDate(date.getUTCDate() - offset);
  return isoOfUtc(date);
}

/**
 * Jour d'index `index` (0 = lundi … 6 = dimanche) de la semaine commençant
 * au lundi ISO donné. Forme unidimensionnelle de `weekDatesOf` : le semis
 * n'a besoin que d'un jour précis, pas des sept.
 */
export function jourSemaine(debutSemaineIso: string, index: number): string {
  const date = toUtcDate(debutSemaineIso);
  date.setUTCDate(date.getUTCDate() + index);
  return isoOfUtc(date);
}
