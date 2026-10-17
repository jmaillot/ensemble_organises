/**
 * Résolution de la couverture invitée de l'ardoise (phase 23, R2/R3) — logique
 * PURE : aucun import Deno ni `npm:`, donc exécutable par la suite Vitest du
 * dépôt (`guest-media.test.ts`, dont l'`include` couvre
 * `../supabase/functions/**`). Même doctrine que `recipe-invite/guest-steps.ts:1-17`
 * et `child-guard.ts:1-15`.
 *
 * Un seul endroit signe, un seul endroit décide du TTL. Un invité anonyme n'a
 * pas de session et le bucket `household-media` est privé (AGENTS.md §2.6) : il
 * ne peut pas signer lui-même, c'est le serveur qui le fait, avec le client
 * service-role — donc HORS de la politique du bucket
 * `(storage.foldername(name))[1]`. D'où le verdict prononcé ICI, avant la
 * signature : la valeur rendue à l'invité est `null` si elle n'est pas un
 * chemin borné au foyer de l'ardoise (R2).
 *
 * La forme `http(s)` n'est PAS relayée (D-03) : elle ne satisfait pas le
 * préfixe de foyer et tombe dans l'échec fermé. Le formulaire n'offre qu'un
 * dépôt (galerie/appareil), donc aucune valeur légitime n'est perdue.
 *
 * Échec fermé : une valeur absente, une forme inconnue, une erreur de signature
 * ou une exception rendent `null`, sans erreur remontée et sans journaliser ni
 * le chemin ni l'URL — rien de sensible ne fuite dans les logs (T-23-05). Un
 * chemin brut de bucket ne quitte jamais l'Edge : la valeur signée REMPLACE le
 * chemin, elle ne l'accompagne pas.
 *
 * Asymétrie de D-05, écrite comme un RÉSIDU COSMÉTIQUE et jamais présentée
 * comme une protection : trois signeurs subsistent dans le dépôt
 * (`gift-list-invite`, cette surface, `recipe-invite`), et un seul —
 * `recipe-invite/guest-steps.ts:65` — porte encore un relais `http(s)` désormais
 * INATTEIGNABLE, puisque `0127` n'émet plus cette forme. Ce module ne le
 * reprend pas ; `guest-steps.ts` est laissé intact.
 */

/** Bucket privé des fichiers du foyer : seul nom que les politiques connaissent. */
export const HOUSEHOLD_MEDIA_BUCKET = 'household-media';

/** Validité des URL photo invitées : courte (une heure), forgée par requête. */
export const GUEST_PHOTO_TTL_SECONDS = 3600;

/** Chaîne non vide telle quelle, sinon null (échec fermé, jamais ''). */
export function asTextOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Type STRUCTUREL décrivant seulement ce qui est consommé par la signature —
 * jamais `SupabaseClient`, sinon ce module dépendrait de
 * `npm:@supabase/supabase-js@2` et cesserait d'être exécutable par Vitest. Le
 * client privilégié de l'Edge le satisfait par structure.
 */
export interface GuestMediaSigner {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

/**
 * Résout la valeur brute `cover_url` de la colonne en URL servable.
 *
 * État d'avant 23-01 (vérification à venir) : la valeur est signée telle quelle
 * sans verdict — c'est l'extraction fidèle du code en ligne de
 * `ardoise-invite/index.ts:637-651`, où un chemin d'un autre foyer, un segment
 * `..` et une forme `http(s)` héritée traversaient tous.
 */
export async function resolveGuestCoverUrl(
  signer: GuestMediaSigner,
  raw: unknown,
  householdId: string,
): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await signer.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
