import { useCallback, useMemo, useRef } from 'react';
import { useHouseholdStore } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import type { LoyaltyCardRow } from '@/types';
import {
  LOYALTY_CARDS_TABLE,
  loyaltyMetrics,
  toLoyaltyCardPayload,
  toLoyaltyCardUsageStamp,
  type LoyaltyMetrics,
} from '../api';
import { sortLoyaltyCardsByRecentUse, toLoyaltyCard, type LoyaltyCard, type LoyaltyCardInput } from '../types';

export interface UseFideliteResult extends LoyaltyMetrics {
  cards: LoyaltyCard[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  addCard: (input: LoyaltyCardInput) => Promise<void>;
  editCard: (card: LoyaltyCard, input: LoyaltyCardInput) => Promise<void>;
  removeCard: (card: LoyaltyCard) => Promise<void>;
  /** Touche la carte pour la remonter dans le tri « utilisée récemment ». */
  markUsed: (card: LoyaltyCard) => Promise<void>;
}

function useRequireHousehold() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useCallback(() => {
    if (!householdId) throw new Error('Aucun foyer sélectionné.');
    return householdId;
  }, [householdId]);
}

/** Cartes de fidélité du foyer courant, triées par usage récent. */
export function useFidelite(): UseFideliteResult {
  const members = useHouseholdStore((state) => state.members);
  const requireHousehold = useRequireHousehold();
  const {
    rows,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    create,
    update,
    remove,
    isMutating,
  } = useResource<LoyaltyCardRow>(LOYALTY_CARDS_TABLE);

  // `useResource` invalide la clé `['all', table]`, qui ne correspond pas à la
  // clé de sa requête (`[table, householdId, filtre]`) : on relance donc la
  // lecture après chaque écriture pour que la grille soit à jour.
  const refresh = useRef(refetch);
  refresh.current = refetch;

  const cards = useMemo(() => {
    const memberNames = new Map(members.map((member) => [member.id, member.display_name]));
    return sortLoyaltyCardsByRecentUse(rows.map((row) => toLoyaltyCard(row, memberNames)));
  }, [members, rows]);

  const metrics = useMemo(() => loyaltyMetrics(cards), [cards]);

  const addCard = useCallback(
    async (input: LoyaltyCardInput) => {
      await create(toLoyaltyCardPayload(input, requireHousehold()));
      refresh.current();
    },
    [create, requireHousehold],
  );

  const editCard = useCallback(
    async (card: LoyaltyCard, input: LoyaltyCardInput) => {
      await update(card.id, toLoyaltyCardPayload(input, requireHousehold()));
      refresh.current();
    },
    [requireHousehold, update],
  );

  const removeCard = useCallback(
    async (card: LoyaltyCard) => {
      await remove(card.id);
      refresh.current();
    },
    [remove],
  );

  const markUsed = useCallback(
    async (card: LoyaltyCard) => {
      await update(card.id, toLoyaltyCardUsageStamp());
      refresh.current();
    },
    [update],
  );

  return {
    cards,
    ...metrics,
    isLoading,
    isFetching,
    isError,
    error,
    isMutating,
    refetch,
    addCard,
    editCard,
    removeCard,
    markUsed,
  };
}
