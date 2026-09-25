import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todayIso } from '@/lib/utils';
import type { GiftItemRow, GiftListShareRow, HouseholdMemberRow } from '@/types';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import {
  createGiftItem,
  createGiftList,
  deleteGiftItem,
  deleteGiftList,
  fetchCadeauxSnapshot,
  syncGiftListShares,
  updateGiftItem,
} from '../api';
import {
  findNextOccasion,
  toGiftItem,
  toGiftList,
  toGiftShare,
  type GiftItem,
  type GiftList,
  type GiftShare,
  type GiftShareInput,
  type NewGiftItemInput,
  type NewGiftListInput,
  type NextOccasion,
} from '../types';

export const cadeauxKeys = {
  all: ['cadeaux'] as const,
  snapshot: (householdId: string | null) => ['cadeaux', householdId] as const,
};

export interface CadeauxData {
  /** Listes visibles : les listes privées des autres restent masquées. */
  lists: GiftList[];
  items: GiftItem[];
  shares: GiftShare[];
  members: HouseholdMemberRow[];
  currentMember: HouseholdMemberRow | null;
  nextOccasion: NextOccasion | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCadeaux(): CadeauxData {
  const householdId = useHouseholdStore((state) => state.householdId);
  const members = useMembers();
  const currentMember = useCurrentMember();
  const currentMemberId = currentMember?.id ?? null;

  const query = useQuery({
    queryKey: cadeauxKeys.snapshot(householdId),
    enabled: Boolean(householdId),
    queryFn: () => fetchCadeauxSnapshot(householdId as string),
  });

  const visibleListIds = useMemo(() => {
    const snapshot = query.data;
    if (!snapshot) return new Set<string>();
    return new Set(
      snapshot.lists
        .filter((row) => row.visibility !== 'privee' || row.owner_member_id === currentMemberId)
        .map((row) => row.id),
    );
  }, [currentMemberId, query.data]);

  const lists = useMemo<GiftList[]>(() => {
    const snapshot = query.data;
    if (!snapshot) return [];
    return snapshot.lists
      .filter((row) => visibleListIds.has(row.id))
      .map((row) =>
        toGiftList(
          row,
          members.find((member) => member.id === row.owner_member_id),
          snapshot.shares.filter((share) => share.list_id === row.id).length,
          currentMemberId,
        ),
      );
  }, [currentMemberId, members, query.data, visibleListIds]);

  const items = useMemo<GiftItem[]>(() => {
    const snapshot = query.data;
    if (!snapshot) return [];
    return snapshot.items
      .filter((row) => visibleListIds.has(row.list_id))
      .map((row) => toGiftItem(row, members));
  }, [members, query.data, visibleListIds]);

  const shares = useMemo<GiftShare[]>(() => {
    const snapshot = query.data;
    if (!snapshot) return [];
    return snapshot.shares
      .filter((row) => visibleListIds.has(row.list_id))
      .map((row) => toGiftShare(row, members));
  }, [members, query.data, visibleListIds]);

  const nextOccasion = useMemo(
    () => findNextOccasion(query.data?.birthdays ?? [], todayIso()),
    [query.data],
  );

  return {
    lists,
    items,
    shares,
    members,
    currentMember,
    nextOccasion,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}

function useCadeauxMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cadeauxKeys.all }),
  });
}

export function useAddGiftItem() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useCadeauxMutation((input: NewGiftItemInput) => createGiftItem(householdId as string, input));
}

export function useUpdateGiftItem() {
  return useCadeauxMutation(
    ({ id, values }: { id: string; values: Partial<GiftItemRow> }) => updateGiftItem(id, values),
  );
}

export function useDeleteGiftItem() {
  return useCadeauxMutation((id: string) => deleteGiftItem(id));
}

export function useAddGiftList() {
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  return useCadeauxMutation((input: NewGiftListInput) => createGiftList(householdId as string, currentMemberId, input));
}

export function useDeleteGiftList() {
  return useCadeauxMutation((listId: string) => deleteGiftList(listId));
}

export function useSyncGiftListShares() {
  return useCadeauxMutation(
    ({ listId, existing, next }: { listId: string; existing: GiftListShareRow[]; next: GiftShareInput[] }) =>
      syncGiftListShares(listId, existing, next),
  );
}
