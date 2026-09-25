import type { LoyaltyCardRow } from '@/types';

/** Type de code enregistré sur une carte de fidélité (colonne `code_type`). */
export type LoyaltyCodeType = 'barcode' | 'qr';

/** Couleur de marque choisie pour une carte : jamais de couleur libre. */
export type LoyaltyBrandColor = 'accent' | 'coral' | 'amber' | 'ink';

export const loyaltyCodeTypes: ReadonlyArray<{ value: LoyaltyCodeType; label: string }> = [
  { value: 'barcode', label: 'Code-barres' },
  { value: 'qr', label: 'QR Code' },
];

/** Libellé français exact de l'export de design. */
export const loyaltyCodeTypeLabel: Record<LoyaltyCodeType, string> = {
  barcode: 'Code-barres',
  qr: 'QR Code',
};

export const loyaltyBrandColors: ReadonlyArray<{ value: LoyaltyBrandColor; label: string; swatch: string }> = [
  { value: 'accent', label: 'Pétrole', swatch: 'bg-accent' },
  { value: 'coral', label: 'Corail', swatch: 'bg-coral' },
  { value: 'amber', label: 'Ambre', swatch: 'bg-amber' },
  { value: 'ink', label: 'Encre', swatch: 'bg-ink-soft' },
];

/** Fond et texte de la pastille `loyalty-icon` selon la couleur de marque. */
export const loyaltyIconTone: Record<LoyaltyBrandColor, string> = {
  accent: 'bg-accent-soft text-accent-strong',
  coral: 'bg-coral-soft text-coral',
  amber: 'bg-amber-soft text-[oklch(52%_0.11_78)]',
  ink: 'bg-bg text-fg',
};

/** Puce de l'enseigne dans la vue plein écran sombre. */
export const loyaltyBrandChip: Record<LoyaltyBrandColor, string> = {
  accent: 'bg-accent',
  coral: 'bg-coral',
  amber: 'bg-amber',
  ink: 'bg-ink-soft',
};

export function isLoyaltyCodeType(value: unknown): value is LoyaltyCodeType {
  return value === 'barcode' || value === 'qr';
}

export function isLoyaltyBrandColor(value: unknown): value is LoyaltyBrandColor {
  return value === 'accent' || value === 'coral' || value === 'amber' || value === 'ink';
}

/** Type métier d'une carte de fidélité. */
export interface LoyaltyCard {
  id: string;
  name: string;
  codeType: LoyaltyCodeType;
  codeValue: string;
  brandColor: LoyaltyBrandColor | null;
  memberId: string | null;
  /** Nom du membre propriétaire, ou `null` pour une carte du foyer entier. */
  memberName: string | null;
  /** Dernier usage connu (création ou dernière modification de la carte). */
  lastUsedAt: string;
}

/** Saisie du dialogue d'ajout / de modification. */
export interface LoyaltyCardInput {
  name: string;
  codeType: LoyaltyCodeType;
  codeValue: string;
  brandColor: LoyaltyBrandColor;
  memberId: string | null;
}

export function toLoyaltyCard(row: LoyaltyCardRow, memberNames?: ReadonlyMap<string, string>): LoyaltyCard {
  return {
    id: row.id,
    name: row.name,
    codeType: isLoyaltyCodeType(row.code_type) ? row.code_type : 'barcode',
    codeValue: row.code_value,
    brandColor: isLoyaltyBrandColor(row.brand_color) ? row.brand_color : null,
    memberId: row.member_id,
    memberName: row.member_id ? (memberNames?.get(row.member_id) ?? null) : null,
    lastUsedAt: row.created_at,
  };
}

/** Tri « enseigne utilisée récemment » : la carte la plus récemment touchée en premier. */
export function sortLoyaltyCardsByRecentUse(cards: LoyaltyCard[]): LoyaltyCard[] {
  return [...cards].sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt) || a.name.localeCompare(b.name, 'fr'));
}
