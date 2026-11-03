import { describe, expect, it } from 'vitest';
import { forgetInviteToken, isRecallValid, recallInviteToken, rememberInviteToken } from './invites';
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
