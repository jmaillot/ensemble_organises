import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  cleanOffImageUrl,
  fetchOffProduct,
  fetchOffResult,
  isQueryableEan,
  rankSearchHits,
  searchOffProducts,
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

  it('retourne null sur erreur reseau persistante (bascule puis echec franc)', async () => {
    let calls = 0;
    const boom = () => {
      calls += 1;
      return HttpResponse.error();
    };
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', boom),
      http.get('https://api.openfoodfacts.org/api/v2/product/:ean.json', boom),
      http.get('https://fr.openfoodfacts.org/api/v2/product/:ean.json', boom),
    );
    await expect(fetchOffProduct(KNOWN_EAN, { timeoutMs: 1000 })).resolves.toBeNull();
    // world tenté une fois, puis bascule api puis fr : pas de retry storm.
    expect(calls).toBe(3);
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

describe('cleanOffImageUrl (CR-01)', () => {
  it("accepte l'hote officiel en https", () => {
    expect(
      cleanOffImageUrl('https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg'),
    ).toContain('images.openfoodfacts.org');
  });

  it('rejette hote tiers, http, data: et valeurs non-texte', () => {
    expect(cleanOffImageUrl('https://evil.example/p.jpg')).toBeNull();
    expect(cleanOffImageUrl('http://images.openfoodfacts.org/p.jpg')).toBeNull();
    expect(cleanOffImageUrl('data:image/svg+xml,<svg/>')).toBeNull();
    expect(cleanOffImageUrl('javascript:alert(1)')).toBeNull();
    expect(cleanOffImageUrl(null)).toBeNull();
    expect(cleanOffImageUrl(42)).toBeNull();
  });
});

describe('fetchOffResult (WR-04)', () => {
  it('found / unknown / error sont distincts', async () => {
    expect(await fetchOffResult(KNOWN_EAN)).toMatchObject({ status: 'found' });
    expect(await fetchOffResult(UNKNOWN_EAN)).toEqual({ status: 'unknown' });
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', () => HttpResponse.error()),
      http.get('https://api.openfoodfacts.org/api/v2/product/:ean.json', () => HttpResponse.error()),
      http.get('https://fr.openfoodfacts.org/api/v2/product/:ean.json', () => HttpResponse.error()),
    );
    expect(await fetchOffResult(KNOWN_EAN, { timeoutMs: 1000 })).toEqual({ status: 'error' });
  });

  it('bascule sur le miroir quand world répond 503', async () => {
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', () => new HttpResponse(null, { status: 503 })),
      http.get('https://api.openfoodfacts.org/api/v2/product/:ean.json', () =>
        HttpResponse.json(
          {
            code: KNOWN_EAN,
            status: 1,
            product: { code: KNOWN_EAN, product_name: 'Nutella', brands: 'Ferrero', lang: 'fr' },
          },
          { status: 200 },
        ),
      ),
    );
    const result = await fetchOffResult(KNOWN_EAN);
    expect(result).toMatchObject({ status: 'found' });
  });
});

describe('searchOffProducts', () => {
  it('mappe les résultats (nom FR, marque, photo, rayon)', async () => {
    const hits = await searchOffProducts('comté affiné');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ name: 'Comté affiné', brand: 'Fruitière' });
    expect(hits[0].imageUrl).toContain('images.openfoodfacts.org');
  });

  it('tableau vide sans résultat, erreur levée sur panne réseau', async () => {
    await expect(searchOffProducts('xyzintrouvable')).resolves.toEqual([]);
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/search', () => HttpResponse.error()),
    );
    await expect(searchOffProducts('comté', { timeoutMs: 1000 })).rejects.toThrow();
  });

  it('503 (quota/incident) : message dédié, sans retry', async () => {
    let calls = 0;
    const down = () => {
      calls += 1;
      return new HttpResponse(null, { status: 503 });
    };
    server.use(
      http.get('https://world.openfoodfacts.org/api/v2/search', down),
      http.get('https://api.openfoodfacts.org/api/v2/search', down),
      http.get('https://fr.openfoodfacts.org/api/v2/search', down),
    );
    await expect(searchOffProducts('comté')).rejects.toThrow(/patientez une minute/);
    expect(calls).toBe(3);
  });

  it('n’interroge pas sous 2 caractères', async () => {
    await expect(searchOffProducts('x')).resolves.toEqual([]);
  });
});

describe('rankSearchHits', () => {
  const hit = (name: string, brand: string | null = null) => ({
    ean: 'x',
    name,
    brand,
    imageUrl: null,
    categoriesTags: [],
    lang: 'fr' as const,
  });

  it('écarte le bruit quand un résultat pertinent existe (snickers ≠ eau)', () => {
    const hits = [
      hit('Eau minérale naturelle'),
      hit('Snickers barre chocolatée', 'Mars'),
    ];
    expect(rankSearchHits(hits, 'snickers').map((entry) => entry.name)).toEqual([
      'Snickers barre chocolatée',
    ]);
  });

  it('renvoie vide quand rien ne correspond (bruit écarté, création manuelle)', () => {
    const hits = [hit('Eau minérale naturelle', 'sidi ali'), hit('Fromage Blanc Nature')];
    expect(rankSearchHits(hits, 'snickers')).toEqual([]);
  });

  it('classe l’exact avant le partiel, insensible aux accents', () => {
    const hits = [hit('Comte râpé'), hit('Comté affiné 12 mois')];
    const ranked = rankSearchHits(hits, 'comté affiné');
    expect(ranked[0].name).toBe('Comté affiné 12 mois');
  });

  it('vide en entrée, vide en sortie', () => {
    expect(rankSearchHits([], 'snickers')).toEqual([]);
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
