import { describe, expect, it } from 'vitest';
import {
  createInviteToken,
  defaultInviteExpiry,
  forgetInviteToken,
  isRecallValid,
  recallInviteToken,
  rememberInviteToken,
} from './invites';
import { addDays, todayIso } from '@/lib/utils';
import type { InviteTokenSummary } from '@/types';

const summary = (overrides: Partial<InviteTokenSummary> = {}): InviteTokenSummary => ({
  tokenId: 'tok-1',
  isActive: true,
  expiresAt: null,
  maxUses: 10,
  useCount: 0,
  createdAt: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

describe('rappel local du token d’invitation', () => {
  it('retient puis restitue le dernier token généré', () => {
    forgetInviteToken();
    expect(recallInviteToken()).toBeNull();

    rememberInviteToken({ token: 'token-secret', householdId: 'foyer-a', tokenId: 'tok-1' });
    expect(recallInviteToken()).toEqual({
      token: 'token-secret',
      householdId: 'foyer-a',
      tokenId: 'tok-1',
    });

    forgetInviteToken();
    expect(recallInviteToken()).toBeNull();
  });

  it('ignore une valeur corrompue plutôt que de casser le panneau', () => {
    localStorage.setItem('ensemble-organises-invite-token', 'pas-du-json{');
    expect(recallInviteToken()).toBeNull();
    localStorage.setItem('ensemble-organises-invite-token', JSON.stringify({ token: '', householdId: 'foyer-a' }));
    expect(recallInviteToken()).toBeNull();
    localStorage.setItem('ensemble-organises-invite-token', JSON.stringify({ token: 'x', householdId: 'foyer-a' }));
    expect(recallInviteToken()).toBeNull();
    forgetInviteToken();
  });

  it('ne vaut que pour un token actif présent dans la liste (modèle liste, Pitfall 5)', () => {
    const saved = { token: 'token-secret', householdId: 'foyer-a', tokenId: 'tok-1' };
    expect(isRecallValid(saved, [summary()])).toBe(true);
    expect(isRecallValid(saved, [])).toBe(false);
    expect(isRecallValid(null, [summary()])).toBe(false);
    // Révoqué, épuisé de la liste active, ou régénéré ailleurs : le rappel se tait.
    expect(isRecallValid(saved, [summary({ isActive: false })])).toBe(false);
    expect(isRecallValid(saved, [summary({ tokenId: 'tok-2' })])).toBe(false);
    // Les utilisations, elles, évoluent : le rappel reste valable.
    expect(isRecallValid(saved, [summary({ useCount: 3 })])).toBe(true);
  });
});

describe('expiration par défaut de createInviteToken (B-1)', () => {
  // L'environnement vitest n'a ni VITE_SUPABASE_URL ni clé : les tests 1 et 2
  // couvrent la branche démo. Le mode Supabase partage la même valeur
  // effective (calculée AVANT la branche) ; son helper est vérifié
  // directement au test 3, sans jamais emballer la logique de la lib.
  it('fournit un expiresAt non nul à +30 jours quand l’appelant n’en passe pas', async () => {
    const expected = `${addDays(todayIso(), 30)}T23:59:00.000Z`;
    const preview = await createInviteToken({ maxUses: 10 });
    expect(preview.expiresAt).not.toBeNull();
    expect(preview.expiresAt).toBe(expected);
  });

  it('conserve la date explicite fournie par l’appelant', async () => {
    const expected = new Date('2027-01-15T23:59:59').toISOString();
    const preview = await createInviteToken({ expiresAt: '2027-01-15', maxUses: 10 });
    expect(preview.expiresAt).toBe(expected);
  });

  it('le défaut du helper est l’instant +30 j du panneau d’invitations (31-04)', () => {
    expect(defaultInviteExpiry()).toBe(`${addDays(todayIso(), 30)}T23:59:00.000Z`);
  });
});
