import type { User } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/supabase/client';

/**
 * Marge de validité d'une session persistée consultée hors-ligne (plan 35-08,
 * gap G-35-5) : une session qui expire dans la minute est morte hors-ligne —
 * le rafraîchissement du jeton exige le réseau et a déjà échoué. supabase-js
 * utilise EXPIRY_MARGIN (~90 s) pour des décisions en vol ; ici la décision
 * engage toute la durée du mode avion, d'où une marge explicitement nommée.
 */
export const MARGE_EXPIRATION_S = 60;

/**
 * Dérive la clé de stockage GoTrue (`sb-<ref>-auth-token`) depuis l'URL
 * Supabase — même dérivation que supabase-js v2 : le premier segment du
 * hostname est la référence projet (`https://stub.example.fr` → `stub`).
 * Retourne null sans configuration (le helper n'a alors rien à lire).
 */
export function cleStockageSession(): string | null {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const reference = hostname.split('.')[0];
    return reference ? `sb-${reference}-auth-token` : null;
  } catch {
    // URL malformée : pas de clé dérivable, donc pas de session consultable.
    return null;
  }
}

/**
 * Lit la session GoTrue persistée, SANS réseau et SANS écriture.
 *
 * D-08 (décision enregistrée : « aucun stockage de cible au-delà de
 * state.from ») : ce helper est en LECTURE SEULE du stockage GoTrue existant
 * — il n'ajoute aucune écriture, il ne consulte que ce que supabase-js y a
 * déjà déposé.
 *
 * Format CHUNKÉ d'abord (plan 35-08) : supabase-js v2 fragmente la session
 * au-delà de sa garde de taille localStorage en `sb-<ref>-auth-token.0`,
 * `.1`… jusqu'au fragment terminal, et retire la clé de base — le cas le
 * plus probable pour les sessions Google OAuth volumineuses. Les fragments
 * sont lus dans l'ordre tant qu'ils existent, joints, puis parsés. Sans
 * fragment, la clé de base non chunkée est lue.
 *
 * Parse DÉFENSIF (T-35-15) : tout échec de JSON.parse, l'absence d'un
 * `expires_at` numérique ou d'un `user.id` string rend null — et l'appelant
 * retombe sur la purge T-35-06. La validité cryptographique du jeton reste
 * prouvée au premier contact serveur ; ici seul le format est jugé.
 */
export function lireSessionPersistee(): { user: User; expiresAtSeconds: number } | null {
  const cle = cleStockageSession();
  if (!cle || typeof localStorage === 'undefined') return null;

  // Fragments `.0`, `.1`… lus dans l'ordre tant qu'ils existent ; le premier
  // index absent termine la séquence (le fragment terminal est le dernier).
  const fragments: string[] = [];
  for (let index = 0; ; index++) {
    const fragment = localStorage.getItem(`${cle}.${index}`);
    if (fragment === null) break;
    fragments.push(fragment);
  }
  const texte = fragments.length > 0 ? fragments.join('') : localStorage.getItem(cle);
  if (!texte) return null;

  let parse: unknown;
  try {
    parse = JSON.parse(texte);
  } catch {
    // Texte corrompu ou format inconnu : traité comme absent (purge T-35-06).
    return null;
  }
  // Objet session direct ; par prudence documentée, la forme enveloppée en
  // tableau (premier élément) est acceptée aussi, si un format multi-clés se
  // présentait.
  const session = Array.isArray(parse) ? parse[0] : parse;
  if (!session || typeof session !== 'object') return null;
  const candidat = session as { expires_at?: unknown; user?: { id?: unknown } };
  if (typeof candidat.expires_at !== 'number') return null;
  if (!candidat.user || typeof candidat.user.id !== 'string') return null;
  return { user: candidat.user as User, expiresAtSeconds: candidat.expires_at };
}

/**
 * Validité d'une session persistée pour la durée du mode avion : au-delà de
 * la marge uniquement. Une session déjà morte (ou mourante) retombe sur la
 * purge T-35-06 — jamais de jeton derrière un statut « authenticated ».
 */
export function sessionPersisteeValide(expiresAtSeconds: number): boolean {
  return expiresAtSeconds > Date.now() / 1000 + MARGE_EXPIRATION_S;
}
