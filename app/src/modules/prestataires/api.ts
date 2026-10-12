import { data } from '@/lib/data';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { ProviderAttachmentRow, ProviderRow, ProviderTypeRow } from '@/types';
import type { ProviderDraft } from './types';

/**
 * Pièces jointes prestataires (D-03) : la colonne `file_url` porte le CHEMIN
 * bucket (`<foyer>/providers/<fiche>/…`), jamais l'URL signée — un lien qui
 * expire n'est plus une donnée qui pourrit. L'URL courte est forgée à la
 * lecture (`resolveAttachmentUrl`) et le fichier est supprimé avec sa ligne
 * (`removeHouseholdFile`, motif courses). RLS et politiques Storage
 * inchangées : mêmes bucket et préfixe foyer que les chemins prouvés.
 */
export const PROVIDER_ATTACHMENTS_BUCKET = 'household-media';
/** Courte (1 h) : un lien mort se re-forge à la prochaine lecture. */
const ATTACHMENT_URL_TTL = 60 * 60;

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
  // En ligne la cascade SQL emporte les pièces jointes ; en local
  // l'adaptateur n'a pas de cascade implicite, on retire explicitement.
  // Dans les deux cas les FICHIERS partent avec leurs lignes : on lit les
  // chemins avant, sinon orphelins en bucket.
  const attachments = await data.list<ProviderAttachmentRow>('provider_attachments', { provider_id: id }).catch(() => []);
  await data.removeWhere('provider_attachments', { provider_id: id }).catch(() => undefined);
  await data.remove('providers', id);
  for (const attachment of attachments) {
    const path = attachmentPathOf(attachment.file_url);
    if (path) await removeHouseholdFile(path).catch(() => undefined);
  }
}

export async function createProviderAttachment(
  householdId: string,
  providerId: string,
  file: File,
): Promise<ProviderAttachmentRow> {
  const deposited = await depositHouseholdFile({ householdId, folder: `providers/${providerId}`, file });
  // Chemin persisté, jamais l'URL : en démo (`path: null`) l'aperçu local
  // éphémère reste la valeur, comme pour le Cercle.
  const stored = deposited.path ?? deposited.url;
  try {
    return await data.create<ProviderAttachmentRow>('provider_attachments', {
      id: randomId('provider-attachment'),
      provider_id: providerId,
      household_id: householdId,
      file_url: stored,
      file_name: deposited.name,
      mime_type: deposited.mime,
      size_bytes: deposited.size,
    });
  } catch (error) {
    // Échec APRÈS l'upload : on nettoie l'objet, jamais d'orphelin en bucket.
    if (deposited.path) await removeHouseholdFile(deposited.path).catch(() => undefined);
    throw error;
  }
}

/**
 * Vrai quand la valeur stockée est un chemin bucket à forger (tout ce qui
 * n'est ni une URL http(s) héritée, ni un aperçu local `blob:`/`data:`).
 */
export function isAttachmentPath(stored: string): boolean {
  return !/^(https?:\/\/|blob:|data:)/i.test(stored);
}

/** Chemin bucket d'une valeur stockée, `null` pour les autres formes. */
export function attachmentPathOf(stored: string | null): string | null {
  if (!stored) return null;
  return isAttachmentPath(stored) ? stored : null;
}

/**
 * Forge l'URL affichable d'une valeur stockée (forme invité 06-04 :
 * échec fermé). Aperçus locaux et URL http(s) héritées passent tels quels ;
 * un chemin se forge en URL courte ; tout échec de forge donne `null`
 * (jamais de lien mort vers le DOM).
 */
export async function resolveAttachmentUrl(stored: string): Promise<string | null> {
  if (!isAttachmentPath(stored)) return stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from(PROVIDER_ATTACHMENTS_BUCKET)
      .createSignedUrl(stored, ATTACHMENT_URL_TTL);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque pièce en URL affichable, en une passe (échec fermé par ligne). */
export async function resolveAttachmentUrls(rows: ProviderAttachmentRow[]): Promise<Record<string, string>> {
  const entries = await Promise.all(rows.map(async (row) => [row.id, await resolveAttachmentUrl(row.file_url)] as const));
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

export async function removeProviderAttachment(id: string): Promise<void> {
  // La ligne porte le chemin : on le lit avant de supprimer, sinon orphelin.
  const rows = await data.list<ProviderAttachmentRow>('provider_attachments', { id }).catch(() => []);
  await data.remove('provider_attachments', id);
  const path = attachmentPathOf(rows[0]?.file_url ?? null);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
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
