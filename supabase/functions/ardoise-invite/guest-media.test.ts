/**
 * Preuves du verdict média de la couverture invitée de l'ardoise (phase 23,
 * R2/R3) côté Edge `ardoise-invite`.
 *
 * Ces assertions portent sur le CONTRAT, pas sur l'auto-cohérence : le module
 * `guest-media.ts` est PUR (aucun import Deno ni `npm:`), donc exécutable ici
 * (`app/vite.config.ts` inclut `../supabase/functions/**\/*.test.ts`). Le
 * comportement de l'Edge DÉPLOYÉE reste vérifié par lecture : aucun test du
 * dépôt n'importe un `index.ts` d'Edge (`deno` absent).
 *
 * Le signeur factice est écrit à la main (aucun mock de module) : il enregistre
 * `(bucket, path, expiresIn)` et rend une `signedUrl` qui NE CONTIENT PAS le
 * chemin d'entrée — de sorte qu'un signeur qui rendrait le chemin tel quel
 * ferait réellement tomber l'assertion « aucun chemin brut ne sort ».
 *
 * Les refus portent sur le DOUBLE autant que sur le retour : `calls` doit être
 * VIDE. Un verdict qui rend `null` après avoir signé aurait quand même exposé
 * une URL d'un autre foyer — c'est l'appel qu'on interdit, pas seulement sa
 * valeur de retour.
 */

import { describe, expect, it } from 'vitest';
import {
  GUEST_PHOTO_TTL_SECONDS,
  HOUSEHOLD_MEDIA_BUCKET,
  asTextOrNull,
  resolveGuestCoverUrl,
} from './guest-media';
import type { GuestMediaSigner } from './guest-media';

interface SignCall {
  bucket: string;
  path: string;
  expiresIn: number;
}

interface SignerOptions {
  /** Rend `{ data: null, error }` pour ces chemins (échec de signature). */
  fail?: (path: string) => boolean;
  /** Lève pour ces chemins (le signeur lui-même est indisponible). */
  throwOn?: (path: string) => boolean;
  /** URL rendue ; par défaut une URL opaque qui ne porte PAS le chemin. */
  signedUrl?: (path: string) => string;
}

/** Signeur factice enregistrant ses appels ; aucune dépendance à Supabase. */
function makeSigner(options: SignerOptions = {}): { signer: GuestMediaSigner; calls: SignCall[] } {
  const calls: SignCall[] = [];
  const signer: GuestMediaSigner = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({ bucket, path, expiresIn });
            if (options.throwOn?.(path)) throw new Error('signature indisponible');
            if (options.fail?.(path)) return { data: null, error: { message: 'refus' } };
            const signedUrl = options.signedUrl?.(path) ?? 'https://signe.example/objet-3f8a';
            return { data: { signedUrl }, error: null };
          },
        };
      },
    },
  };
  return { signer, calls };
}

const HOME_A = 'household_a1b2c3d4';
const HOME_B = 'household_e5f6a7b8';
const OWN_PATH = `${HOME_A}/ardoises/plage.webp`;

describe('asTextOrNull', () => {
  it('ne garde qu’une chaîne non vide, sinon null', () => {
    expect(asTextOrNull(OWN_PATH)).toBe(OWN_PATH);
    expect(asTextOrNull('  espaces  ')).toBe('espaces');
    expect(asTextOrNull('')).toBeNull();
    expect(asTextOrNull('   ')).toBeNull();
    expect(asTextOrNull(null)).toBeNull();
    expect(asTextOrNull(undefined)).toBeNull();
    expect(asTextOrNull(42)).toBeNull();
    expect(asTextOrNull({})).toBeNull();
  });
});

describe('resolveGuestCoverUrl (R2, R3)', () => {
  it('signe un chemin du foyer de l’ardoise, avec le bucket et le TTL uniques', async () => {
    const { signer, calls } = makeSigner();
    const url = await resolveGuestCoverUrl(signer, OWN_PATH, HOME_A);

    expect(url).toBe('https://signe.example/objet-3f8a');
    expect(calls).toEqual([
      { bucket: HOUSEHOLD_MEDIA_BUCKET, path: OWN_PATH, expiresIn: GUEST_PHOTO_TTL_SECONDS },
    ]);
  });

  it('signe la CHAÎNE EXACTE qui a passé le verdict, sans normalisation', async () => {
    const { signer, calls } = makeSigner();
    const value = `${HOME_A}/ardoises/sous-dossier/couverture.png`;

    await resolveGuestCoverUrl(signer, value, HOME_A);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe(value);
  });

  it('rend null SANS appeler le signeur pour un chemin d’un autre foyer', async () => {
    const { signer, calls } = makeSigner();

    expect(await resolveGuestCoverUrl(signer, `${HOME_B}/ardoises/plage.webp`, HOME_A)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rend null SANS appeler le signeur pour un chemin qui remonte par `..`', async () => {
    const { signer, calls } = makeSigner();
    const escaping = `${HOME_A}/../${HOME_B}/ardoises/x.webp`;

    expect(await resolveGuestCoverUrl(signer, escaping, HOME_A)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rend null SANS appeler le signeur pour une forme http(s) héritée (D-03)', async () => {
    const { signer, calls } = makeSigner();

    expect(await resolveGuestCoverUrl(signer, 'https://externe.example/photo.jpg', HOME_A)).toBeNull();
    expect(await resolveGuestCoverUrl(signer, 'http://externe.example/photo.jpg', HOME_A)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rend null SANS appeler le signeur sur une valeur absente, vide ou non-chaîne', async () => {
    const { signer, calls } = makeSigner();

    expect(await resolveGuestCoverUrl(signer, null, HOME_A)).toBeNull();
    expect(await resolveGuestCoverUrl(signer, '', HOME_A)).toBeNull();
    expect(await resolveGuestCoverUrl(signer, '   ', HOME_A)).toBeNull();
    expect(await resolveGuestCoverUrl(signer, undefined, HOME_A)).toBeNull();
    expect(await resolveGuestCoverUrl(signer, 42, HOME_A)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('n’accepte pas un foyer homonyme : la barre finale est exigée', async () => {
    const { signer, calls } = makeSigner();

    expect(
      await resolveGuestCoverUrl(signer, 'household_abc/ardoises/a.webp', 'household_ab'),
    ).toBeNull();
    expect(await resolveGuestCoverUrl(signer, 'household_ab', 'household_ab')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('échec fermé : une erreur de signeur ou une exception rend null', async () => {
    const failing = makeSigner({ fail: () => true });
    expect(await resolveGuestCoverUrl(failing.signer, OWN_PATH, HOME_A)).toBeNull();

    const throwing = makeSigner({ throwOn: () => true });
    expect(await resolveGuestCoverUrl(throwing.signer, OWN_PATH, HOME_A)).toBeNull();
  });

  it('échec fermé : une réponse sans signedUrl rend null', async () => {
    const empty: GuestMediaSigner = {
      storage: {
        from: () => ({
          async createSignedUrl() {
            return { data: { signedUrl: '' }, error: null };
          },
        }),
      },
    };
    expect(await resolveGuestCoverUrl(empty, OWN_PATH, HOME_A)).toBeNull();
  });

  it('le TTL passé au signeur est exactement la constante exportée', async () => {
    const { signer, calls } = makeSigner();

    await resolveGuestCoverUrl(signer, OWN_PATH, HOME_A);

    // Jamais le littéral 3600 recopié : le test suit la constante, donc un
    // changement de constante se propage sans qu'un autre site ne le décide.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.expiresIn).toBe(GUEST_PHOTO_TTL_SECONDS);
  });
});
