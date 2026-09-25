import type { HouseholdInviteTokenRow } from './database';

export type * from './database';

/** Ligne générique stockée par l'adaptateur. */
export type Row = { id: string } & Record<string, unknown>;

export type RowFilter = Record<string, string | number | boolean | null | undefined | readonly (string | number | boolean)[]>;

/** Session applicative, alignée sur `auth.users` quand Supabase est configuré. */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  provider: 'google' | 'facebook' | 'email';
}

export type SessionStatus = 'initialising' | 'guest' | 'authenticated';

/** Jeton d'invitation renvoyé par l'Edge Function ; le HMAC reste côté serveur. */
export interface InviteTokenPreview {
  token: string;
  expiresAt: string | null;
  maxUses: number;
  householdId: string;
}

export interface InviteTokenSummary {
  householdId: string;
  isActive: boolean;
  expiresAt: string | null;
  maxUses: number;
  useCount: number;
  createdAt: string;
}

export type { HouseholdInviteTokenRow };
