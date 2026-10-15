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
