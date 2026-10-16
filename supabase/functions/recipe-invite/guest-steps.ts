/**
 * Projection des étapes du lien invité (phase 21, R4/D-15/D-16) — logique
 * PURE : aucun import Deno ni `npm:`, donc exécutable par la suite Vitest du
 * dépôt (`guest-steps.test.ts`, dont l'`include` couvre
 * `../supabase/functions/**`). Même doctrine que `child-guard.ts:1-6`.
 *
 * Un seul endroit signe, un seul endroit décide du TTL. La couverture
 * (`coverPhotoUrl`) et la photo de chaque étape (`steps[].photoUrl`) passent
 * littéralement par le même signeur : le TTL invité ne peut donc pas diverger
 * d'une surface à l'autre (D-16).
 *
 * Échec fermé : une valeur absente, une forme inconnue, une erreur de
 * signature ou une exception rendent `null`, sans erreur remontée et sans
 * journaliser ni le chemin ni l'URL — rien de sensible ne fuite dans les logs
 * (T-21-02). Un chemin brut de bucket ne quitte jamais l'Edge : la valeur
 * signée REMPLACE le chemin, elle ne l'accompagne pas.
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
 * Résout une valeur brute (`cover_photo` ou `photo_path`) en URL servable :
 * une forme `http(s)://` déjà signée est rendue telle quelle ; un chemin
 * relatif au bucket `household-media` reçoit une URL signée courte ; TOUT le
 * reste (absent, vide, forme inconnue, erreur de signature, exception) rend
 * `null` — échec fermé, sans erreur, sans journaliser ni le chemin ni l'URL.
 *
 * Jumelle exacte de l'ancien `resolveGuestCoverUrl` : les deux surfaces
 * partagent désormais ce seul signeur (D-16).
 */
export async function resolveGuestMediaUrl(
  signer: GuestMediaSigner,
  raw: unknown,
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

/** Une étape projetée pour la vue invitée : texte + URL signée ou `null`. */
export interface GuestStep {
  id: string;
  content: string;
  position: number;
  photoUrl: string | null;
}

/**
 * Projette les étapes rendues par le RPC en charge invitée : `id`/`content`
 * normalisés en `String(...)`, `position` numérique ou `0`, et `photoUrl`
 * signée par `resolveGuestMediaUrl` (ou `null` en échec fermé). La signature
 * étant asynchrone, la projection l'est aussi — un échec sur une étape rend
 * `null` pour celle-là seulement, jamais une exception globale.
 */
export async function toGuestSteps(
  signer: GuestMediaSigner,
  steps: readonly {
    id?: unknown;
    content?: unknown;
    position?: unknown;
    photo_path?: unknown;
  }[],
): Promise<GuestStep[]> {
  return Promise.all(
    steps.map(async (step) => ({
      id: String(step.id ?? ''),
      content: String(step.content ?? ''),
      position: typeof step.position === 'number' ? step.position : 0,
      photoUrl: await resolveGuestMediaUrl(signer, step.photo_path),
    })),
  );
}
