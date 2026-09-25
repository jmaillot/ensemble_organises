import { supabase, supabaseFunctionsBase, isSupabaseConfigured } from '@/lib/supabase/client';
import { data } from '@/lib/data';
import { generateInviteToken, randomId } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdInviteTokenRow, InviteTokenPreview, InviteTokenSummary } from '@/types';

/**
 * Les tokens d'invitation ne sont jamais lisibles ni comparables depuis le
 * client : la base ne stocke que le HMAC calculé avec
 * `INVITE_TOKEN_HMAC_SECRET`. En mode Supabase, la création et la validation
 * passent par l'Edge Function `household-invite`.
 */

const INVITE_SECRET_HEADER = 'x-invite-token';

async function callInviteFunction<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/household-invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Opération impossible.');
  }
  return (await response.json()) as T;
}

/** Une date `yyyy-mm-dd` de l'interface devient un instant ISO exploitable. */
function toInstant(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T23:59:59` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createInviteToken(options?: {
  expiresAt?: string | null;
  maxUses?: number;
}): Promise<InviteTokenPreview> {
  const activeHouseholdId = useHouseholdStore.getState().householdId;
  if (isSupabaseConfigured) {
    return callInviteFunction<InviteTokenPreview>({
      action: 'create',
      householdId: activeHouseholdId ?? undefined,
      expiresAt: toInstant(options?.expiresAt),
      maxUses: options?.maxUses ?? undefined,
    });
  }
  const householdId = useSessionStore.getState().user ? await currentHouseholdId() : activeHouseholdId;
  const token = generateInviteToken();
  if (householdId) {
    await data.create<HouseholdInviteTokenRow>('household_invite_tokens', {
      id: randomId('invite'),
      household_id: householdId,
      token_hash: `local:${token}`,
      created_by: useSessionStore.getState().user?.id ?? '',
      expires_at: options?.expiresAt ?? null,
      max_uses: options?.maxUses ?? 10,
      use_count: 0,
      is_active: true,
    } as Partial<HouseholdInviteTokenRow>);
  }
  return { token, expiresAt: toInstant(options?.expiresAt), maxUses: options?.maxUses ?? 10, householdId: householdId ?? '' };
}

export async function revokeInviteToken(): Promise<void> {
  if (isSupabaseConfigured) {
    await callInviteFunction({ action: 'revoke', householdId: useHouseholdStore.getState().householdId ?? undefined });
    return;
  }
  const householdId = await currentHouseholdId();
  if (!householdId) return;
  const tokens = await data.list<HouseholdInviteTokenRow>('household_invite_tokens', { household_id: householdId });
  await Promise.all(
    tokens.map((token) => data.update<HouseholdInviteTokenRow>('household_invite_tokens', token.id, { is_active: false })),
  );
}

export async function getInviteTokenSummary(): Promise<InviteTokenSummary | null> {
  if (isSupabaseConfigured) {
    return callInviteFunction<InviteTokenSummary | null>({
      action: 'summary',
      householdId: useHouseholdStore.getState().householdId ?? undefined,
    });
  }
  const householdId = await currentHouseholdId();
  if (!householdId) return null;
  const [token] = await data.list<HouseholdInviteTokenRow>('household_invite_tokens', { household_id: householdId });
  if (!token) return null;
  return {
    householdId: token.household_id,
    isActive: token.is_active,
    expiresAt: token.expires_at,
    maxUses: token.max_uses,
    useCount: token.use_count,
    createdAt: token.created_at,
  };
}

export async function redeemInviteToken(token: string): Promise<string> {
  const normalized = token.trim();
  if (normalized.length < 16) {
    throw new Error('Ce token semble incomplet. Il fait au moins 22 caractères.');
  }
  if (isSupabaseConfigured) {
    const result = await callInviteFunction<{ household_id: string }>({ action: 'redeem', token: normalized });
    return result.household_id;
  }
  const stored = await data.list<HouseholdInviteTokenRow>('household_invite_tokens', {});
  const match = stored.find((row) => row.token_hash === `local:${normalized}`);
  if (!match || !match.is_active) throw new Error('Ce token n’est plus valide.');
  return match.household_id;
}

export const inviteHeaders = (token: string) => ({ [INVITE_SECRET_HEADER]: token });

async function currentHouseholdId() {
  const user = useSessionStore.getState().user;
  if (!user) return null;
  const memberships = await data.list<{ id: string; household_id: string }>('household_members', { user_id: user.id });
  return memberships[0]?.household_id ?? null;
}
