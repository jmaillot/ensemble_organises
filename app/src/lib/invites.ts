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
  // Même règle que la création : la session absente (démo, tests) retombe sur
  // le foyer actif plutôt que sur aucun résumé.
  const householdId = useSessionStore.getState().user
    ? await currentHouseholdId()
    : (useHouseholdStore.getState().householdId ?? null);
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

/**
 * Rappel local du dernier token généré sur cet appareil.
 *
 * Le serveur ne conserve que l'empreinte HMAC : le brut ne peut pas être
 * relu ensuite. Pour éviter de régénérer un token à chaque visite du
 * panneau, l'aperçu est conservé dans `localStorage`, scoped par foyer, et
 * n'est réaffiché que si le résumé serveur désigne le même token encore
 * actif (même foyer, même `createdAt`). Un autre appareil, un navigateur
 * nettoyé ou un token régénéré ailleurs invalide le rappel : il faut alors
 * générer un nouveau token, jamais le deviner.
 */
export interface RememberedInviteToken {
  token: string;
  householdId: string;
  createdAt: string;
}

const REMEMBER_KEY = 'ensemble-organises-invite-token';

export function rememberInviteToken(input: { token: string; householdId: string; createdAt: string }): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(input));
  } catch {
    // Stockage plein ou refusé : le rappel est un confort, pas un requis.
  }
}

export function recallInviteToken(): RememberedInviteToken | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedInviteToken>;
    if (typeof parsed.token !== 'string' || typeof parsed.householdId !== 'string' || typeof parsed.createdAt !== 'string') {
      return null;
    }
    if (!parsed.token || !parsed.householdId || !parsed.createdAt) return null;
    return { token: parsed.token, householdId: parsed.householdId, createdAt: parsed.createdAt };
  } catch {
    // Valeur corrompue : on l'ignore plutôt que de casser le panneau.
    return null;
  }
}

export function forgetInviteToken(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Sans objet : le rappel est un confort, pas un requis.
  }
}

/** Le rappel ne vaut que pour le token actif désigné par le résumé serveur. */
export function isRecallValid(saved: RememberedInviteToken | null, summary: InviteTokenSummary | null): boolean {
  if (!saved || !summary) return false;
  return (
    summary.isActive &&
    summary.householdId === saved.householdId &&
    summary.createdAt === saved.createdAt
  );
}

async function currentHouseholdId() {
  const user = useSessionStore.getState().user;
  if (!user) return null;
  const memberships = await data.list<{ id: string; household_id: string }>('household_members', { user_id: user.id });
  return memberships[0]?.household_id ?? null;
}
