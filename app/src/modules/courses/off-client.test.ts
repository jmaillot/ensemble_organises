import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  fetchOffProduct,
  isQueryableEan,
  OFF_TIMEOUT_MS,
  OFF_USER_AGENT,
} from './off-client';
import { offCategoriesToRayon } from './off-rayon';
import { INVALID_EAN, KNOWN_EAN, offHandlers, UNKNOWN_EAN } from '@/test/mocks/off-handlers';

const server = setupServer(...offHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('isQueryableEan', () => {
  it('accepte les EAN a 8-14 chiffres', () => {
    expect(isQueryableEan('3017620422003')).toBe(true);
    expect(isQueryableEan('12345678')).toBe(true);
  });

  it('refuse le reste vers la creation manuelle', () => {
    expect(isQueryableEan('')).toBe(false);
    expect(isQueryableEan('ABC123')).toBe(false);
    expect(isQueryableEan('1234567')).toBe(false);
    expect(isQueryableEan('123456789012345')).toBe(false);
  });
});

describe('fetchOffProduct', () => {
  it('enrichit un EAN connu (nom, marque, image, categories)', async () => {
    const product = await fetchOffProduct(KNOWN_EAN);
    expect(product).not.toBeNull();
    expect(product?.name).toBe('Nutella');
    expect(product?.brand).toContain('Ferrero');
    expect(product?.imageUrl).toContain('openfoodfacts.org');
    expect(product?.categoriesTags).toContain('en:spreads');
  });

  it('retourne null sans lever sur EAN inconnu (404)', async () => {
    await expect(fetchOffProduct(UNKNOWN_EAN)).resolves.toBeNull();
  });

  it('retourne null sur code invalide (200 + status 0)', async () => {
    await expect(fetchOffProduct(INVALID_EAN)).resolves.toBeNull();
  });

  it('retourne null sur EAN non interrogeable sans appeler le reseau', async () => {
    await expect(fetchOffProduct('promo-caisse')).resolves.toBeNull();
  });

  it('retourne null apres timeout (repli manuel, pas d\'attente de 8 s)', async () => {
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ status: 0 }, { status: 200 });
      }),
    );
    await expect(fetchOffProduct(KNOWN_EAN, { timeoutMs: 50 })).resolves.toBeNull();
  }, 10000);

  it('retourne null sur erreur reseau persistante (un unique retry)', async () => {
    let calls = 0;
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    await expect(fetchOffProduct(KNOWN_EAN, { timeoutMs: 1000 })).resolves.toBeNull();
    // Appel initial + un unique retry (T-04-04 : pas de retry storm).
    expect(calls).toBe(2);
  });

  it('envoie fields= et X-User-Agent sur chaque requete', async () => {
    let seenUrl = '';
    let seenAgent: string | null = null;
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', ({ request }) => {
        seenUrl = request.url;
        seenAgent = request.headers.get('X-User-Agent');
        return HttpResponse.json({ status: 0, status_verbose: 'product not found' }, { status: 404 });
      }),
    );
    await fetchOffProduct(UNKNOWN_EAN);
    expect(seenUrl).toContain('fields=');
    expect(seenUrl).toContain('product_name');
    expect(seenAgent).toBe(OFF_USER_AGENT);
  });

  it('le delai par defaut vaut 8 s', () => {
    expect(OFF_TIMEOUT_MS).toBe(8000);
  });
});

describe('offCategoriesToRayon', () => {
  it('mappe les tartinades vers le garde-manger (Divers par defaut de table)', () => {
    // `en:spreads` n'a pas de rayon dedie : repli Divers, jamais invente.
    expect(offCategoriesToRayon(['en:spreads', 'fr:Pâtes à tartiner'])).toBe('Divers');
  });

  it('mappe les familles connues', () => {
    expect(offCategoriesToRayon(['en:dairies'])).toBe('Frais');
    expect(offCategoriesToRayon(['en:breads'])).toBe('Boulangerie');
    expect(offCategoriesToRayon(['en:beverages'])).toBe('Boissons');
    expect(offCategoriesToRayon(['en:frozen-foods'])).toBe('Surgelés');
    expect(offCategoriesToRayon(['fr:Hygiène'])).toBe('Hygiène');
  });

  it('replie vers Divers sur vide ou inconnu', () => {
    expect(offCategoriesToRayon([])).toBe('Divers');
    expect(offCategoriesToRayon(['en:unmapped-category'])).toBe('Divers');
    expect(offCategoriesToRayon(null)).toBe('Divers');
  });
});
