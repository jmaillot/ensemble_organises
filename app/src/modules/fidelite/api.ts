import type { LoyaltyCardRow } from '@/types';
import type { LoyaltyCard, LoyaltyCardInput } from './types';

export const LOYALTY_CARDS_TABLE = 'loyalty_cards';

export type LoyaltyCardPayload = Partial<LoyaltyCardRow>;

/** Transforme la saisie du dialogue en ligne `loyalty_cards`. */
export function toLoyaltyCardPayload(input: LoyaltyCardInput, householdId: string): LoyaltyCardPayload {
  return {
    household_id: householdId,
    member_id: input.memberId,
    name: input.name.trim(),
    code_type: input.codeType,
    code_value: input.codeValue.trim(),
    brand_color: input.brandColor,
  };
}

/**
 * `loyalty_cards` ne porte pas de colonne `updated_at` : la date de dernier
 * usage est donc portée par `created_at`, qui sert de tri « enseigne utilisée
 * récemment » et d'horodatage d'une carte modifiée.
 */
export function toLoyaltyCardUsageStamp(at: Date = new Date()): LoyaltyCardPayload {
  return { created_at: at.toISOString() };
}

export interface LoyaltyMetrics {
  total: number;
  barcodes: number;
  qrCodes: number;
}

export function loyaltyMetrics(cards: LoyaltyCard[]): LoyaltyMetrics {
  return {
    total: cards.length,
    barcodes: cards.filter((card) => card.codeType === 'barcode').length,
    qrCodes: cards.filter((card) => card.codeType === 'qr').length,
  };
}
