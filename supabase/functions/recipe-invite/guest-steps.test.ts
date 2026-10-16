/**
 * Preuves de la projection des étapes invitées (phase 21, R4/D-15/D-16) côté
 * Edge `recipe-invite`.
 *
 * Ces assertions portent sur le CONTRAT, pas sur l'auto-cohérence : le module
 * `guest-steps.ts` est PUR (aucun import Deno ni `npm:`), donc exécutable ici.
 * Le comportement de l'Edge DÉPLOYÉE reste vérifié manuellement (VALIDATION.md,
 * « Manual-Only ») : aucun test du dépôt n'importe un `index.ts` d'Edge (deno
 * absent).
 *
 * Le signeur factice est écrit à la main (aucun mock de module) : il enregistre
 * `(bucket, path, expiresIn)` et rend une `signedUrl` qui NE CONTIENT PAS le
 * chemin d'entrée — de sorte qu'un signeur qui rendrait le chemin tel quel
 * ferait réellement tomber l'assertion « aucun chemin brut ne sort ».
 */

import { describe, expect, it } from 'vitest';
import {
  GUEST_PHOTO_TTL_SECONDS,
  asTextOrNull,
  resolveGuestMediaUrl,
  toGuestSteps,
} from './guest-steps';
import type { GuestMediaSigner } from './guest-steps';

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
  /** URL rendue ; par défaut `https://signe.example/<chemin>`. */
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
            const signedUrl = options.signedUrl?.(path) ?? `https://signe.example/${path}`;
            return { data: { signedUrl }, error: null };
          },
        };
      },
    },
  };
  return { signer, calls };
}

const RAW_PATH = 'foyer-1/recipes/r-1/steps/s-1/file-a7f3.jpg';
const SIGNED = 'https://signe.example/step-a7f3';

describe('asTextOrNull', () => {
  it('ne garde qu’une chaîne non vide, sinon null', () => {
    expect(asTextOrNull('foyer-1/recipes/r-1/file.jpg')).toBe('foyer-1/recipes/r-1/file.jpg');
    expect(asTextOrNull('  espaces  ')).toBe('espaces');
    expect(asTextOrNull('')).toBeNull();
    expect(asTextOrNull('   ')).toBeNull();
    expect(asTextOrNull(null)).toBeNull();
    expect(asTextOrNull(undefined)).toBeNull();
    expect(asTextOrNull(42)).toBeNull();
    expect(asTextOrNull({})).toBeNull();
  });
});

describe('resolveGuestMediaUrl (R4, D-16)', () => {
  it('signe un chemin de bucket avec le bucket et le TTL uniques', async () => {
    const { signer, calls } = makeSigner();
    const url = await resolveGuestMediaUrl(signer, 'foyer-1/recipes/r-1/steps/s-1/file.jpg');

    expect(url).toBe('https://signe.example/foyer-1/recipes/r-1/steps/s-1/file.jpg');
    expect(calls).toEqual([
      {
        bucket: 'household-media',
        path: 'foyer-1/recipes/r-1/steps/s-1/file.jpg',
        expiresIn: 3600,
      },
    ]);
  });

  it('rend une forme http(s) déjà signée telle quelle, sans appeler le signeur', async () => {
    const { signer, calls } = makeSigner();

    expect(await resolveGuestMediaUrl(signer, 'https://externe.example/photo.jpg')).toBe(
      'https://externe.example/photo.jpg',
    );
    expect(await resolveGuestMediaUrl(signer, 'http://externe.example/photo.jpg')).toBe(
      'http://externe.example/photo.jpg',
    );
    expect(calls).toHaveLength(0);
  });

  it('rend null sans appeler le signeur sur une valeur absente ou vide', async () => {
    const { signer, calls } = makeSigner();

    expect(await resolveGuestMediaUrl(signer, null)).toBeNull();
    expect(await resolveGuestMediaUrl(signer, '')).toBeNull();
    expect(await resolveGuestMediaUrl(signer, '   ')).toBeNull();
    expect(await resolveGuestMediaUrl(signer, undefined)).toBeNull();
    expect(await resolveGuestMediaUrl(signer, 42)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('échec fermé : une erreur de signeur ou une exception rend null', async () => {
    const failing = makeSigner({ fail: () => true });
    expect(await resolveGuestMediaUrl(failing.signer, 'foyer-1/recipes/r-1/file.jpg')).toBeNull();

    const throwing = makeSigner({ throwOn: () => true });
    expect(await resolveGuestMediaUrl(throwing.signer, 'foyer-1/recipes/r-1/file.jpg')).toBeNull();
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
    expect(await resolveGuestMediaUrl(empty, 'foyer-1/recipes/r-1/file.jpg')).toBeNull();
  });
});

describe('toGuestSteps (R4, D-15)', () => {
  it('projette chaque étape : photoUrl signée ou null, champs normalisés', async () => {
    const { signer } = makeSigner({ signedUrl: () => SIGNED });

    const steps = await toGuestSteps(signer, [
      { id: 's-1', content: 'Éplucher les pommes de terre.', position: 0, photo_path: RAW_PATH },
      { id: 's-2', content: 'Cuire au four.', position: 1 },
    ]);

    expect(steps).toEqual([
      { id: 's-1', content: 'Éplucher les pommes de terre.', position: 0, photoUrl: SIGNED },
      { id: 's-2', content: 'Cuire au four.', position: 1, photoUrl: null },
    ]);
  });

  it('normalise id/content en String et position en nombre ou 0', async () => {
    const { signer } = makeSigner();

    const steps = await toGuestSteps(signer, [
      { id: 7, content: 3, position: 'première' },
      {},
    ]);

    expect(steps).toEqual([
      { id: '7', content: '3', position: 0, photoUrl: null },
      { id: '', content: '', position: 0, photoUrl: null },
    ]);
  });
});

describe('Contrat de réponse : le chemin brut ne sort jamais (T-21-02, R4)', () => {
  it('la projection ne porte aucune valeur égale au chemin brut, seulement l’URL signée', async () => {
    const { signer } = makeSigner({ signedUrl: () => SIGNED });

    const steps = await toGuestSteps(signer, [
      { id: 's-1', content: 'Éplucher les pommes de terre.', position: 0, photo_path: RAW_PATH },
    ]);

    // Le chemin brut n'apparaît sous AUCUNE clé, et `photo_path` n'est pas
    // recopié : la valeur signée le remplace, elle ne l'accompagne pas.
    expect(steps[0]).not.toHaveProperty('photo_path');
    expect(Object.values(steps[0]!)).not.toContain(RAW_PATH);
    expect(steps[0]!.photoUrl).toBe(SIGNED);
  });

  it('la charge sérialisée ne contient aucune sous-chaîne du chemin brut', async () => {
    const { signer } = makeSigner({ signedUrl: () => SIGNED });

    const steps = await toGuestSteps(signer, [
      { id: 's-1', content: 'Éplucher les pommes de terre.', position: 0, photo_path: RAW_PATH },
    ]);
    const serialized = JSON.stringify(steps);

    expect(serialized).not.toContain(RAW_PATH);
    expect(serialized).not.toContain('recipes/r-1/steps');
  });

  it('un échec de signature sur une étape n’empêche pas les autres d’être projetées', async () => {
    const failingPath = 'foyer-1/recipes/r-1/steps/s-1/file.jpg';
    const { signer } = makeSigner({
      fail: (path) => path === failingPath,
      signedUrl: () => SIGNED,
    });

    const steps = await toGuestSteps(signer, [
      { id: 's-1', content: 'Éplucher.', position: 0, photo_path: failingPath },
      {
        id: 's-2',
        content: 'Cuire.',
        position: 1,
        photo_path: 'foyer-1/recipes/r-1/steps/s-2/file.jpg',
      },
    ]);

    // Un null LOCAL, pas une exception globale : la seconde étape garde son URL.
    expect(steps[0]!.photoUrl).toBeNull();
    expect(steps[1]!.photoUrl).toBe(SIGNED);
  });

  it('le TTL passé au signeur est exactement la constante exportée', async () => {
    const { signer, calls } = makeSigner();

    await resolveGuestMediaUrl(signer, 'foyer-1/recipes/r-1/steps/s-1/file.jpg');

    // Jamais le littéral 3600 recopié : le test suit la constante, donc un
    // changement de constante se propage sans qu'aucun autre site ne le décide.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.expiresIn).toBe(GUEST_PHOTO_TTL_SECONDS);
  });
});
