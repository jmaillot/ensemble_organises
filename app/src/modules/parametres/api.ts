import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import type { DashboardWidgetRow, HouseholdRow, ProfileRow } from '@/types';
import type { HouseholdColor } from './types';

/**
 * Préférences : profil, foyer, membres. Tout passe par l'adaptateur de données,
 * donc par la RLS côté Supabase. Les changements de rôle ne sont jamais écrits
 * depuis le client (AGENTS.md §2.6) : ils relèvent d'une Edge Function.
 */

/**
 * Le schéma ne comporte pas de ville dans `profiles` : la ville du profil est
 * stockée dans les réglages du widget météo du membre (`dashboard_widgets.
 * settings`), seule source de vérité côté interface pour l'instant.
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
  await data.update<ProfileRow>('profiles', target.userId, { display_name: values.displayName });

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
