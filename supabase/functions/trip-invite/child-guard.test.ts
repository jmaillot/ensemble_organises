/**
 * Preuves du refus enfant (phase 15, D-01) côté Edge `trip-invite`.
 *
 * Ces assertions portent sur le CONTRAT, pas sur l'auto-cohérence : chaque
 * message est recopié depuis la sortie correspondante de
 * `translateRpcError` dans `index.ts` (403 gestion, 404 code), et le refus
 * réel (lookup serveur + throw avant tout RPC) est prouvé côté base en
 * 0053 — un miroir qui dériverait casserait ici AVANT de fuir un oracle
 * différent en production.
 */

import { describe, expect, it } from 'vitest';
import { childRefusal, isChildRole } from './child-guard';

describe('isChildRole', () => {
  it('ne reconnaît que le rôle exact `enfant`', () => {
    expect(isChildRole('enfant')).toBe(true);
  });

  it('ne confond ni les autres rôles ni les quasi-homonymes', () => {
    expect(isChildRole('admin')).toBe(false);
    expect(isChildRole('membre')).toBe(false);
    expect(isChildRole(null)).toBe(false);
    expect(isChildRole(undefined)).toBe(false);
    expect(isChildRole('')).toBe(false);
    expect(isChildRole('Enfant')).toBe(false);
    expect(isChildRole('enfant ')).toBe(false);
  });
});

describe('childRefusal', () => {
  it('gestion : même 403 que le refus SQL `gestion réservée`', () => {
    expect(childRefusal('manage')).toEqual({
      status: 403,
      message:
        'Seul un administrateur du foyer ou un participant du voyage peut faire cette opération.',
    });
  });

  it('code : même 404 oracle que tout code inconnu', () => {
    expect(childRefusal('code')).toEqual({
      status: 404,
      message: 'Ce code est invalide.',
    });
  });
});
