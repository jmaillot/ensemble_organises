import { data } from '@/lib/data';
import type { ProviderRow, ProviderTypeRow } from '@/types';
import type { ProviderDraft } from './types';

function providerValues(draft: ProviderDraft) {
  return {
    provider_type_id: draft.typeId,
    name: draft.name,
    phone: draft.phone,
    email: draft.email,
    address: draft.address,
    postal_code: draft.postalCode,
    city: draft.city,
    notes: draft.notes,
  };
}

export async function createProvider(householdId: string, draft: ProviderDraft): Promise<ProviderRow> {
  return data.create<ProviderRow>('providers', { household_id: householdId, ...providerValues(draft) });
}

export async function updateProvider(id: string, draft: ProviderDraft): Promise<ProviderRow> {
  return data.update<ProviderRow>('providers', id, providerValues(draft));
}

export async function removeProvider(id: string): Promise<void> {
  await data.remove('providers', id);
}

export async function createProviderType(householdId: string, values: { name: string; icon: string }): Promise<ProviderTypeRow> {
  return data.create<ProviderTypeRow>('provider_types', {
    household_id: householdId,
    name: values.name,
    icon: values.icon,
  });
}

export async function updateProviderType(id: string, values: { name: string; icon: string }): Promise<ProviderTypeRow> {
  return data.update<ProviderTypeRow>('provider_types', id, { name: values.name, icon: values.icon });
}

/**
 * Supprime un type de prestataire. Les fiches qui l'utilisent ne sont pas
 * supprimées : leur `provider_type_id` passe à `null` (comportement `on delete
 * set null` de la contrainte), comme le ferait la base.
 * Renvoie le nombre de fiches détachées pour prévenir l'utilisateur.
 */
export async function removeProviderType(id: string): Promise<number> {
  const attached = await data.list<ProviderRow>('providers', { provider_type_id: id });
  for (const row of attached) {
    await data.update<ProviderRow>('providers', row.id, { provider_type_id: null });
  }
  await data.remove('provider_types', id);
  return attached.length;
}

/** `tel:` accepte espaces, points et tirets ; on ne garde que les chiffres. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}`;
}

/** Adresse encodée pour un lien d'itinéraire, sans dépendance externe. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
