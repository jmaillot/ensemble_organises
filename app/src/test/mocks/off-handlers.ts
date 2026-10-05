import { http, HttpResponse } from 'msw';

/**
 * Premiers intercepteurs MSW du depot (phase Courses scan) : reponses
 * OpenFoodFacts v2 pour le client `off-client.ts`.
 *
 * - `3017620422003` : produit connu (Nutella, corps observe en sondes live).
 * - `2999999999991` : EAN valide mais inconnu → 404 + `status: 0`
 *   (le 404 est le discriminant, pas le corps).
 * - `0000000000017` : code invalide → 200 + `status: 0`.
 */

export const KNOWN_EAN = '3017620422003';
export const UNKNOWN_EAN = '2999999999991';
export const INVALID_EAN = '0000000000017';

const NUTELLA_BODY = {
  code: KNOWN_EAN,
  status: 1,
  status_verbose: 'product found',
  product: {
    code: KNOWN_EAN,
    product_name: 'Nutella',
    brands: 'Nutella, Ferrero',
    image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
    image_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
    lang: 'fr',
    categories_tags: ['en:spreads', 'fr:Pâtes à tartiner'],
  },
};

export const offHandlers = [
  http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', ({ params }) => {
    const ean = String(params.ean ?? '');
    if (ean === KNOWN_EAN) return HttpResponse.json(NUTELLA_BODY, { status: 200 });
    if (ean === UNKNOWN_EAN) {
      return HttpResponse.json(
        { code: UNKNOWN_EAN, status: 0, status_verbose: 'product not found' },
        { status: 404 },
      );
    }
    if (ean === INVALID_EAN) {
      return HttpResponse.json(
        { code: '00000017', status: 0, status_verbose: 'no code or invalid code' },
        { status: 200 },
      );
    }
    return HttpResponse.json(
      { code: ean, status: 0, status_verbose: 'product not found' },
      { status: 404 },
    );
  }),
  http.get('https://world.openfoodfacts.org/api/v2/search', ({ request }) => {
    const terms = new URL(request.url).searchParams.get('search_terms') ?? '';
    if (/comt/i.test(terms)) {
      return HttpResponse.json(
        {
          count: 1,
          page: 1,
          page_size: 5,
          products: [
            {
              code: '3017620422003',
              product_name_fr: 'Comté affiné',
              brands: 'Fruitière',
              image_front_url:
                'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
              categories_tags: ['en:cheeses', 'fr:comtes'],
              lang: 'fr',
            },
          ],
        },
        { status: 200 },
      );
    }
    return HttpResponse.json({ count: 0, page: 1, page_size: 5, products: [] }, { status: 200 });
  }),
];
