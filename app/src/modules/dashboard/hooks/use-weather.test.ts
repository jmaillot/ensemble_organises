import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchForecast, fetchGeocode, weatherCodeToFr } from './use-weather';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('weatherCodeToFr', () => {
  it.each([
    [0, 'Dégagé', 'sun'],
    [1, 'Peu nuageux', 'sun'],
    [2, 'Partiellement nuageux', 'cloud'],
    [3, 'Couvert', 'cloud'],
    [45, 'Brouillard', 'cloud'],
    [51, 'Bruine', 'cloud'],
    [63, 'Pluie', 'cloud'],
    [71, 'Neige', 'cloud'],
    [95, 'Orage', 'cloud'],
  ] as const)('code %i -> %s', (code, label, icon) => {
    expect(weatherCodeToFr(code)).toEqual({ label, icon });
  });

  it('ne propose que des icônes du design', () => {
    for (let code = 0; code <= 99; code += 1) {
      expect(['sun', 'cloud']).toContain(weatherCodeToFr(code).icon);
    }
  });
});

describe('fetchGeocode', () => {
  it('renvoie les coordonnées du premier résultat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [{ latitude: 45.76, longitude: 4.83, name: 'Lyon' }] })),
    );
    await expect(fetchGeocode('Lyon')).resolves.toEqual({ latitude: 45.76, longitude: 4.83, name: 'Lyon' });
  });

  it('refuse une ville introuvable plutôt que de renvoyer du vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(fetchGeocode('Xyz')).rejects.toThrow('Ville introuvable');
  });

  it('remonte les erreurs HTTP du service', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)));
    await expect(fetchGeocode('Lyon')).rejects.toThrow('500');
  });
});

describe('fetchForecast', () => {
  it('lit la mesure courante', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ current: { temperature_2m: 18.4, weather_code: 1, time: '2026-09-29T14:00' } })),
    );
    await expect(fetchForecast(45.76, 4.83)).resolves.toEqual({ temperature: 18.4, code: 1, time: '2026-09-29T14:00' });
  });

  it('refuse une réponse sans mesure plutôt que d\'afficher du vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(fetchForecast(45.76, 4.83)).rejects.toThrow('incomplète');
  });
});
