import { describe, expect, it } from 'vitest';
import { isUnseen, latestRead } from './notification-reads';

describe('fusion des lectures', () => {
  it('retient le plus récent des deux, local ou serveur', () => {
    expect(latestRead(undefined, undefined)).toBe('');
    expect(latestRead('', '2026-09-30T10:00:00.000Z')).toBe('2026-09-30T10:00:00.000Z');
    expect(latestRead('2026-09-30T12:00:00.000Z', '')).toBe('2026-09-30T12:00:00.000Z');
    // Marque locale postérieure (hors ligne) : elle gagne.
    expect(latestRead('2026-09-30T12:00:00.000Z', '2026-09-30T10:00:00.000Z')).toBe('2026-09-30T12:00:00.000Z');
    // Marque d'un autre appareil postérieure : elle gagne.
    expect(latestRead('2026-09-30T10:00:00.000Z', '2026-09-30T12:00:00.000Z')).toBe('2026-09-30T12:00:00.000Z');
  });

  it('compare chronologiquement, pas lexicographiquement', () => {
    // Régression : une marque UTC restait « antérieure » à un message en
    // heure locale sans fuseau (`10:42` > `09:52Z` en chaînes), et le non-lu
    // ne se soldait jamais.
    expect(isUnseen('2026-10-01T10:42:00', '2026-10-01T09:52:49.146Z')).toBe(false);
    expect(isUnseen('2026-10-01T18:10:00', '2026-10-01T09:52:49.146Z')).toBe(true);
    expect(isUnseen('2026-10-01T10:42:00+00:00', '')).toBe(true);
    expect(isUnseen(undefined, '2026-10-01T09:52:49.146Z')).toBe(false);
    expect(isUnseen('n-importe-quoi', '2026-10-01T09:52:49.146Z')).toBe(false);
  });
});
