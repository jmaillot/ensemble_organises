/**
 * Lecture d'une réponse Nominatim, sans aucune dépendance.
 *
 * Ce module est le code PUR de la fonction `place-search` : il est testé par
 * la suite Vitest du frontend (`nominatim.test.ts`, motif `web-push.ts` de
 * `push-notify`), tandis que `index.ts` porte tout ce qui demande le runtime
 * Deno (`withSupabase`, `npm:zod`, `fetch` avec en-têtes).
 */

/** Un lieu suggéré, prêt à remplir le formulaire. Champs tronqués aux bornes
 * du formulaire (`place-form-dialog.tsx`) : une valeur trop longue serait
 * rejetée à la soumission pour une raison que l'utilisateur ne verrait pas. */
export interface PlaceHit {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  /** Ligne complète lisible, telle que Nominatim la présente. */
  label: string;
}

function clamp(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

function optional(value: unknown, max: number): string | null {
  return typeof value === 'string' ? clamp(value, max) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Transforme la réponse `format=jsonv2&addressdetails=1` de Nominatim en
 * hits exploitables. `null` = réponse de forme inattendue (panne, HTML
 * d'erreur) : l'appelant répond « indisponible » plutôt que de servir du
 * bruit. Un élément sans `display_name` est écarté, pas fatal.
 */
export function parseNominatimSearch(body: unknown): PlaceHit[] | null {
  if (!Array.isArray(body)) return null;
  const hits: PlaceHit[] = [];
  for (const raw of body) {
    if (!isRecord(raw)) continue;
    const displayName = raw.display_name;
    if (typeof displayName !== 'string' || displayName.trim() === '') continue;
    const address = isRecord(raw.address) ? raw.address : {};
    const streetParts = [address.house_number, address.road ?? address.pedestrian ?? address.footway]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '');
    // Nominatim place le numéro après la rue dans certains pays ; la forme
    // française est « 12 rue des Tilleuls », pas « rue des Tilleuls 12 ».
    const street =
      streetParts.length === 2 && /^\d+$/.test(streetParts[1]) ? `${streetParts[1]} ${streetParts[0]}` : streetParts.join(' ');
    const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : displayName.split(',')[0];
    hits.push({
      name: clamp(name, 80),
      street: street !== '' ? clamp(street, 120) : null,
      postalCode: optional(address.postcode, 10),
      city: optional(address.city ?? address.town ?? address.village ?? address.municipality ?? address.commune, 80),
      label: clamp(displayName, 200),
    });
  }
  return hits;
}
