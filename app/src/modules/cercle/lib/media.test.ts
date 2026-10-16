import { describe, expect, it, vi } from 'vitest';
import { compressImage } from './media';

// jsdom n'expose pas `URL.createObjectURL` : le repli sans `createImageBitmap`
// en a besoin pour son aperçu local. On le remplace, sans toucher au code de
// production.
URL.createObjectURL = () => 'blob:apercu-test';
URL.revokeObjectURL = () => {};

/**
 * Constat (a) des `deferred-items` de la phase 19 : `compressImage` refusait un
 * fichier dont le `type` est VIDE, alors que son nom porte l'extension — la
 * forme des JPEG et HEIC de mobile. Le garde ne disqualifie plus qu'un type
 * DÉCLARÉ non-image ; le refus d'un vrai non-image tombe au décodage, avec le
 * même message.
 *
 * jsdom n'expose pas `createImageBitmap` : `compressImage` rend alors le
 * fichier d'origine tel quel, ce qui est exactement le chemin à prouver ici —
 * aucune image réelle n'est nécessaire.
 */
describe('compressImage — le type déclaré n’est pas la seule preuve', () => {
  it('accepte une image reconnue par sa seule extension (type vide)', async () => {
    const file = new File(['pixels'], 'IMG_2048.HEIC', { type: '' });
    const image = await compressImage(file);
    expect(image.originalName).toBe('IMG_2048.HEIC');
    // Repli de type : la colonne ne reçoit jamais un type vide.
    expect(image.mime).toBe('image/jpeg');
    expect(image.size).toBe(file.size);
  });

  it('accepte toujours un type image déclaré', async () => {
    const file = new File(['pixels'], 'gratin.jpg', { type: 'image/jpeg' });
    expect((await compressImage(file)).mime).toBe('image/jpeg');
  });

  it('refuse un type déclaré qui n’est pas une image', async () => {
    const file = new File(['%PDF-1.7'], 'contrat.pdf', { type: 'application/pdf' });
    await expect(compressImage(file)).rejects.toThrow('Sélectionnez une image');
  });

  it('garde le message d’invitation quand l’image ne se décode pas', async () => {
    // jsdom n'implémente pas `createImageBitmap`, donc le repli sans décodage
    // est pris par défaut : les trois cas ci-dessus ne peuvent pas atteindre le
    // chemin du décodage. On l'installe pour y arriver — un fichier qui se
    // déclare `image/jpeg` mais ne se décode pas (corrompu, tronqué, format non
    // reconnu) doit porter le MÊME message que le refus de type, jamais la
    // `DOMException` brute de `createImageBitmap` (must-have (a)).
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('décodage impossible')));
    try {
      const file = new File(['pas une image'], 'photo.jpg', { type: 'image/jpeg' });
      await expect(compressImage(file)).rejects.toThrow('Sélectionnez une image');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
