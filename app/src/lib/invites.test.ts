import { describe, expect, it } from 'vitest';
import { forgetInviteToken, isRecallValid, recallInviteToken, rememberInviteToken } from './invites';
import type { InviteTokenSummary } from '@/types';

const summary = (overrides: Partial<InviteTokenSummary> = {}): InviteTokenSummary => ({
  householdId: 'foyer-a',
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

    rememberInviteToken({ token: 'token-secret', householdId: 'foyer-a', createdAt: '2026-09-30T10:00:00.000Z' });
    expect(recallInviteToken()).toEqual({
      token: 'token-secret',
      householdId: 'foyer-a',
      createdAt: '2026-09-30T10:00:00.000Z',
    });

    forgetInviteToken();
    expect(recallInviteToken()).toBeNull();
  });

  it('ignore une valeur corrompue plutôt que de casser le panneau', () => {
    localStorage.setItem('ensemble-organises-invite-token', 'pas-du-json{');
    expect(recallInviteToken()).toBeNull();
    localStorage.setItem('ensemble-organises-invite-token', JSON.stringify({ token: '', householdId: 'foyer-a' }));
    expect(recallInviteToken()).toBeNull();
    forgetInviteToken();
  });

  it('ne vaut que pour le token actif désigné par le résumé', () => {
    const saved = { token: 'token-secret', householdId: 'foyer-a', createdAt: '2026-09-30T10:00:00.000Z' };
    expect(isRecallValid(saved, summary())).toBe(true);
    expect(isRecallValid(saved, null)).toBe(false);
    expect(isRecallValid(null, summary())).toBe(false);
    // Révoqué, expiré côté résumé ou régénéré ailleurs : le rappel se tait.
    expect(isRecallValid(saved, summary({ isActive: false }))).toBe(false);
    expect(isRecallValid(saved, summary({ householdId: 'foyer-b' }))).toBe(false);
    expect(isRecallValid(saved, summary({ createdAt: '2026-09-30T11:00:00.000Z' }))).toBe(false);
    // Les utilisations, elles, évoluent : le rappel reste valable.
    expect(isRecallValid(saved, summary({ useCount: 3 }))).toBe(true);
  });
});
