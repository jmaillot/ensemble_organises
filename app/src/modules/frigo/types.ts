import { z } from 'zod';
import type { PantryItemRow } from '@/types';

/**
 * Frigo du foyer (vague 3.1) : articles du réfrigérateur, du congélateur et
 * du garde-manger avec leur péremption.
 */

export type PantryLocation = 'frigo' | 'congelateur' | 'garde_manger';
export type PantryCategory = 'produit_frais' | 'surgele' | 'epicerie' | 'boisson' | 'autre';

export const pantryLocations: PantryLocation[] = ['frigo', 'congelateur', 'garde_manger'];
export const pantryCategories: PantryCategory[] = ['produit_frais', 'surgele', 'epicerie', 'boisson', 'autre'];

export const pantryLocationLabels: Record<PantryLocation, string> = {
  frigo: 'Réfrigérateur',
  congelateur: 'Congélateur',
  garde_manger: 'Garde-manger',
};

export const pantryCategoryLabels: Record<PantryCategory, string> = {
  produit_frais: 'Produit frais',
  surgele: 'Surgelé',
  epicerie: 'Épicerie',
  boisson: 'Boisson',
  autre: 'Autre',
};

export interface PantryItem {
  id: string;
  householdId: string;
  name: string;
  category: PantryCategory;
  quantity: number;
  unit: string | null;
  location: PantryLocation;
  /** Date de péremption, ISO « YYYY-MM-DD », ou null. */
  expiresOn: string | null;
  /** Date d'ouverture, ISO « YYYY-MM-DD », ou null. */
  openedOn: string | null;
  notes: string | null;
  createdById: string | null;
}

/** État de péremption d'un article, calculé en pur (testable). */
export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

/** « Bientôt périmé » : à J-2 et J-1, comme la notification annoncée. */
export const SOON_DAYS = 2;

export function expiryStateOf(expiresOn: string | null, todayIso: string): ExpiryState {
  if (!expiresOn) return 'none';
  // Comparaison de dates ISO via epoch-jours : sûr et sans surprise de fuseau.
  const toDays = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const diff = toDays(expiresOn) - toDays(todayIso);
  if (diff < 0) return 'expired';
  if (diff <= SOON_DAYS) return 'soon';
  return 'ok';
}

export const expiryLabels: Record<ExpiryState, string> = {
  expired: 'Périmé',
  soon: 'Bientôt périmé',
  ok: 'Bon',
  none: 'Sans date',
};

/** Classes d'affichage des pastilles de péremption. */
export const expiryToneClass: Record<ExpiryState, string> = {
  expired: 'bg-coral text-surface',
  soon: 'bg-amber-soft text-[oklch(52%_0.11_78)]',
  ok: 'bg-accent-soft text-accent-strong',
  none: 'bg-bg text-muted',
};

/** Tri du frigo : périmé d'abord, puis bientôt périmé, puis sans date, puis le reste. */
export function sortPantryItems(items: PantryItem[], todayIso: string): PantryItem[] {
  const rank: Record<ExpiryState, number> = { expired: 0, soon: 1, none: 2, ok: 3 };
  return [...items].sort((a, b) => {
    const d = rank[expiryStateOf(a.expiresOn, todayIso)] - rank[expiryStateOf(b.expiresOn, todayIso)];
    if (d !== 0) return d;
    if (a.expiresOn && b.expiresOn && a.expiresOn !== b.expiresOn) return a.expiresOn < b.expiresOn ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Quantité affichée : « 8 pots », « 1,5 kg », ou rien. */
export function formatQuantity(item: PantryItem): string {
  const quantity = item.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return item.unit ? `${quantity} ${item.unit}` : quantity;
}

/** Ligne brute de la base → modèle applicatif. */
export function toPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    category: row.category,
    quantity: typeof row.quantity === 'number' ? row.quantity : Number(row.quantity) || 0,
    unit: row.unit,
    location: row.location,
    expiresOn: row.expires_on,
    openedOn: row.opened_on,
    notes: row.notes,
    createdById: row.created_by,
  };
}

export const pantryFormSchema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom à l’article.').max(200, '200 caractères maximum.'),
  category: z.enum(pantryCategories),
  // Saisie en texte (le champ number du navigateur renvoie une chaîne) ;
  // la virgule française est acceptée.
  quantity: z
    .string()
    .trim()
    .min(1, 'Indiquez une quantité.')
    .refine((value) => {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0;
    }, 'La quantité doit être un nombre supérieur à 0.')
    .refine((value) => Number(value.replace(',', '.')) <= 100000, 'Quantité trop grande.'),
  unit: z.string().trim().max(20, '20 caractères maximum.'),
  location: z.enum(pantryLocations),
  expiresOn: z.string(),
  openedOn: z.string(),
  notes: z.string().max(1000, '1000 caractères maximum.'),
});

export type PantryFormValues = z.infer<typeof pantryFormSchema>;

const isoDateOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
};

export function formValuesToRow(values: PantryFormValues) {
  return {
    name: values.name.trim(),
    category: values.category,
    quantity: Number(values.quantity.replace(',', '.')),
    unit: values.unit.trim() === '' ? null : values.unit.trim(),
    location: values.location,
    expires_on: isoDateOrNull(values.expiresOn),
    opened_on: isoDateOrNull(values.openedOn),
    notes: values.notes.trim() === '' ? null : values.notes.trim(),
  };
}

/** Libellé d'une date ISO en français, sans dépendre du fuseau. */
export function formatIsoDateFr(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
