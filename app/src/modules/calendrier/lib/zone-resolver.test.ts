import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveZoneFromPostcode, suggestZoneForCity } from './zone-resolver';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveZoneFromPostcode', () => {
  it('couvre les trois zones', () => {
    expect(resolveZoneFromPostcode('69001')).toBe('A'); // Lyon
    expect(resolveZoneFromPostcode('33000')).toBe('A'); // Bordeaux
    expect(resolveZoneFromPostcode('59000')).toBe('B'); // Lille
    expect(resolveZoneFromPostcode('44000')).toBe('B'); // Nantes
    expect(resolveZoneFromPostcode('75011')).toBe('C'); // Paris
    expect(resolveZoneFromPostcode('31000')).toBe('C'); // Toulouse
  });
  it('tolère espaces, tirets et casse', () => {
    expect(resolveZoneFromPostcode(' 69-001 ')).toBe('A');
  });
  it('Corse, outre-mer et inconnu : pas de suggestion', () => {
    expect(resolveZoneFromPostcode('2A004')).toBeNull(); // Ajaccio
    expect(resolveZoneFromPostcode('2B033')).toBeNull(); // Bastia
    expect(resolveZoneFromPostcode('97100')).toBeNull(); // Basse-Terre
    expect(resolveZoneFromPostcode('XXXXX')).toBeNull();
    expect(resolveZoneFromPostcode('')).toBeNull();
  });
});

describe('suggestZoneForCity', () => {
  it('retient le premier résultat France avec code postal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            { country_code: 'BE', postcodes: ['59000'] },
            { country_code: 'FR', postcodes: [] },
            { country_code: 'FR', postcodes: ['44100'] },
          ],
        }),
      })),
    );
    await expect(suggestZoneForCity('Nantes')).resolves.toEqual({ zone: 'B', postcode: '44100' });
  });

  it('ville vide, introuvable ou calendrier propre : erreur lisible', async () => {
    await expect(suggestZoneForCity('   ')).rejects.toThrow('profil');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })));
    await expect(suggestZoneForCity('Nullepart')).rejects.toThrow('introuvable');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ country_code: 'FR', postcodes: ['20000'] }] }),
      })),
    );
    await expect(suggestZoneForCity('Ajaccio')).rejects.toThrow('à la main');
  });

  it('géocodage en erreur : erreur lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(suggestZoneForCity('Lyon')).rejects.toThrow('503');
  });
});
