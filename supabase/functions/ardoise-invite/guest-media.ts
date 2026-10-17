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
 * Verdict de lecture : `true` si et seulement si la valeur est un chemin du
 * foyer `householdId` ET ne remonte pas hors de ce foyer.
 *
 * La BARRE FINALE est ce qui ferme le cas « foyer homonyme » : `household_ab`
 * n'accepte pas `household_abc/…`. `startsWith`, jamais un motif `like` :
 * `household_id` est un texte `household_<uuid>` qui contient `_`, métacaractère
 * `like` (`0126:22-31`). Un segment `..` est refusé par `includes` : les noms
 * déposés sont `file_<uuid>.<ext>` et ne contiennent jamais deux points
 * consécutifs, donc le refus ne touche aucune valeur légitime (`0127:42-47`).
 */
export function isHouseholdBoundedPath(value: string, householdId: string): boolean {
  return value.startsWith(`${householdId}/`) && !value.includes('..');
}

/**
 * Résout la valeur brute `cover_url` de la colonne en URL servable.
 *
 * Ordre, à ne pas inverser : la valeur est normalisée par `asTextOrNull`,
 * jugée par `isHouseholdBoundedPath` — un refus rend `null` SANS appeler le
 * signeur —, puis la CHAÎNE EXACTE qui a passé le verdict est signée, sans
 * normalisation intermédiaire : un verdict prononcé sur une forme et une
 * signature portant sur une autre forme pourraient diverger. Un `http(s)`
 * hérité ne satisfait pas le préfixe de foyer et tombe donc dans l'échec fermé
 * (D-03).
 */
export async function resolveGuestCoverUrl(
  signer: GuestMediaSigner,
  raw: unknown,
  householdId: string,
): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (!isHouseholdBoundedPath(value, householdId)) return null;
  try {
    const { data, error } = await signer.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(value, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
