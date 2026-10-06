import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { searchOffCatalog } from './api';
import { offHandlers } from '@/test/mocks/off-handlers';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const server = setupServer(...offHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const PROXY_HITS = [
  { ean: '3017620422003', name: 'Nutella', brand: 'Ferrero', imageUrl: null, categoriesTags: [], lang: 'fr' },
];

function mockProxy(handler: (call: { url: string; body: unknown }) => Response) {
  const calls: { url: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/functions/v1/off-search')) {
        calls.push({ url: href, body: init?.body ? JSON.parse(init.body as string) : null });
        return handler(calls[calls.length - 1]);
      }
      return realFetch(String(url), init);
    }),
  );
  return calls;
}

describe('searchOffCatalog', () => {
  it('passe par le proxy et renvoie ses résultats', async () => {
    const calls = mockProxy(() => HttpResponse.json({ hits: PROXY_HITS }));
    try {
      await expect(searchOffCatalog('nutella')).resolves.toEqual(PROXY_HITS);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('/functions/v1/off-search');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('repli direct quand le proxy est injoignable', async () => {
    const calls = mockProxy(() => {
      throw new TypeError('Edge down');
    });
    try {
      const hits = await searchOffCatalog('comté affiné');
      expect(hits.map((hit) => hit.name)).toContain('Comté affiné');
      expect(calls.filter((call) => call.url.includes('/off-search'))).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('401 : session expirée, message explicite, sans repli direct', async () => {
    let engineCalls = 0;
    server.use(
      http.get('https://search.openfoodfacts.org/search', () => {
        engineCalls += 1;
        return HttpResponse.json({ hits: [] });
      }),
    );
    mockProxy(() => new HttpResponse(JSON.stringify({ code: 'MISSING_CREDENTIALS' }), { status: 401 }));
    try {
      await expect(searchOffCatalog('comté')).rejects.toThrow(/reconnectez-vous/);
      expect(engineCalls).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('pas de repli sur quota proxy (429)', async () => {
    let engineCalls = 0;
    server.use(
      http.get('https://search.openfoodfacts.org/search', () => {
        engineCalls += 1;
        return HttpResponse.json({ hits: [] });
      }),
    );
    mockProxy(() => new HttpResponse(JSON.stringify({ error: 'quota' }), { status: 429 }));
    try {
      await expect(searchOffCatalog('comté')).rejects.toThrow();
      expect(engineCalls).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
