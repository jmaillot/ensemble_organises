import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { DashboardWidgetRow, HouseholdRow, ProfileRow, Role } from '@/types';
import type { HouseholdColor } from './types';

/**
 * Préférences : profil, foyer, membres. Tout passe par l'adaptateur de données,
 * donc par la RLS côté Supabase. Les changements de rôle passent par le RPC
 * serveur `set_member_role` (migration 0036), jamais par une écriture directe :
 * seule la fonction protège le dernier administrateur.
 */

/**
 * Le profil porte la ville (`profiles.city`), source de vérité du widget
 * météo. Les réglages du widget (`dashboard_widgets.settings.city`) restent
 * lus en repli et réécrits à la sauvegarde, le temps que chaque profil ait
 * une ville.
 */
export const DEFAULT_CITY = 'Lyon';

export interface ProfileSettings {
  userId: string;
  displayName: string;
  email: string;
  city: string;
  provider: ProfileRow['provider'];
}

export interface ProfileTarget {
  userId: string;
  memberId: string;
  householdId: string;
}

const cityFromSettings = (settings: Record<string, unknown> | null) =>
  typeof settings?.city === 'string' && settings.city.trim() ? settings.city.trim() : '';

export async function fetchProfile({ userId, memberId, householdId }: ProfileTarget): Promise<ProfileSettings> {
  const [profile] = await data.list<ProfileRow>('profiles', { id: userId });
  const cityFromProfile = profile?.city?.trim() ?? '';
  if (cityFromProfile) {
    return {
      userId,
      displayName: profile?.display_name ?? '',
      email: profile?.email ?? '',
      city: cityFromProfile,
      provider: profile?.provider ?? 'email',
    };
  }
  const widgets = await data.list<DashboardWidgetRow>('dashboard_widgets', { household_id: householdId });
  const meteo = widgets.find((widget) => widget.widget_type === 'meteo' && widget.member_id === memberId);
  return {
    userId,
    displayName: profile?.display_name ?? '',
    email: profile?.email ?? '',
    city: cityFromSettings(meteo?.settings ?? null) || DEFAULT_CITY,
    provider: profile?.provider ?? 'email',
  };
}

export async function saveProfile(target: ProfileTarget, values: { displayName: string; city: string }): Promise<void> {
  const city = values.city.trim();
  const displayName = values.displayName.trim();
  await data.update<ProfileRow>('profiles', target.userId, { display_name: displayName, city });

  // La ligne membre porte le nom affiché partout (listes, soldes serveur,
  // avatars) : elle suit le profil. En mode Supabase, seul le RPC y touche —
  // la RLS réserve l'écriture directe aux admins — et il refuse toute ligne
  // qui n'est pas la sienne (un parent renomme un enfant depuis le panneau
  // du foyer, via `renameMember`).
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('rename_own_member_name', {
      p_member_id: target.memberId,
      p_display_name: displayName,
    });
    if (error) throw new Error(error.message || 'Renommage impossible.');
  } else {
    await data.update('household_members', target.memberId, { display_name: displayName });
  }

  const widgets = await data.list<DashboardWidgetRow>('dashboard_widgets', { household_id: target.householdId });
  const meteo = widgets.find((widget) => widget.widget_type === 'meteo' && widget.member_id === target.memberId);
  if (meteo) {
    await data.update<DashboardWidgetRow>('dashboard_widgets', meteo.id, {
      settings: { ...(meteo.settings ?? {}), city: values.city },
    });
    return;
  }
  await data.create<DashboardWidgetRow>('dashboard_widgets', {
    id: randomId('widget'),
    member_id: target.memberId,
    household_id: target.householdId,
    widget_type: 'meteo',
    position_x: 0,
    position_y: 0,
    width: 1,
    height: 1,
    settings: { city: values.city },
  });
}

export async function fetchHousehold(householdId: string | null): Promise<HouseholdRow | null> {
  if (!householdId) return null;
  const [household] = await data.list<HouseholdRow>('households', { id: householdId });
  return household ?? null;
}

export async function saveHousehold(
  householdId: string,
  values: { name: string; avatar_color: HouseholdColor },
): Promise<HouseholdRow> {
  return data.update<HouseholdRow>('households', householdId, values);
}

/** Retire un membre du foyer : action réservée à l'administrateur. */
export async function removeMember(memberId: string): Promise<void> {
  await data.remove('household_members', memberId);
}

/**
 * Change le rôle d'un membre : opération serveur (`public.set_member_role`,
 * migration 0036), jamais une écriture directe — seule la fonction vérifie
 * qu'on ne rétrograde pas le dernier administrateur. En mode local, écriture
 * directe (pas de RLS).
 */
export async function setMemberRole(memberId: string, role: Role): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role });
      if (error) throw new Error(error.message || 'Changement de rôle impossible.');
      return;
    } catch (requestError) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Hors ligne : reconnectez-vous pour changer un rôle.');
      }
      throw requestError instanceof Error ? requestError : new Error('Changement de rôle impossible.');
    }
  }
  await data.update('household_members', memberId, { role });
}

/** Renomme la ligne foyer d'un membre : réservé à l'administrateur par la RLS. */
export async function renameMember(memberId: string, displayName: string): Promise<void> {
  const name = displayName.trim();
  if (name.length < 2) throw new Error('Indiquez au moins deux caractères.');
  if (name.length > 120) throw new Error('120 caractères maximum.');
  await data.update('household_members', memberId, { display_name: name });
}

export interface HouseholdDeleteResult {
  household_id: string;
  expenses: number;
  storage_objects: number;
  storage_cleanup: 'ok' | 'partial';
}

/**
 * Supprime le foyer et tout son contenu, via l'Edge Function
 * `household-delete` (RPC serveur + nettoyage Storage). Action réservée à
 * l'administrateur, revérifiée en base. Irréversible : l'appelant affiche
 * une confirmation explicite avant tout appel.
 */
export async function deleteHousehold(householdId: string): Promise<HouseholdDeleteResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour supprimer le foyer.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Hors ligne : reconnectez-vous pour supprimer le foyer.');
  }
  const { data: body, error, response } = await supabase.functions.invoke('household-delete', {
    body: { householdId },
  });
  if (error) {
    throw new Error(await readFunctionError(response, 'Suppression du foyer impossible pour le moment.'));
  }
  return body as HouseholdDeleteResult;
}

async function readFunctionError(response: Response | undefined, fallback: string): Promise<string> {
  if (response) {
    try {
      const parsed = (await response.clone().json()) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Corps vide ou non JSON : repli générique ci-dessous.
    }
  }
  return fallback;
}
