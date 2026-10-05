import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todayIso } from '@/lib/utils';
import type { ContactListRow, ContactRow, GiftIdeaRow, GiftItemRow, GiftListShareRow, HouseholdMemberRow } from '@/types';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import {
  createGiftIdea,
  createGiftItem,
  createGiftList,
  deleteGiftIdea,
  deleteGiftItem,
  deleteGiftList,
  fetchCadeauxSnapshot,
  promoteIdeaToItem,
  syncGiftListShares,
  updateGiftIdea,
  updateGiftItem,
} from '../api';
import {
  findNextOccasion,
  toGiftIdea,
  toGiftItem,
  toGiftList,
  toGiftShare,
  type GiftIdea,
  type GiftItem,
  type GiftList,
  type GiftShare,
  type GiftShareInput,
  type NewGiftIdeaInput,
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
  /** Idées du foyer, repli d'affichage seul (D-08, T-05-08). */
  ideas: GiftIdea[];
  contactLists: ContactListRow[];
  contacts: ContactRow[];
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

  /**
   * Repli d'affichage de la surprise (D-08, T-05-08) : une idée destinée au
   * membre connecté (contact lié) est masquée dans sa session. UX-ONLY — la
   * barrière réelle est `can_read_gift_idea` côté serveur (plan 05-01),
   * prouvée par le test serveur 0024.
   */
  const ideas = useMemo<GiftIdea[]>(() => {
    const snapshot = query.data;
    if (!snapshot) return [];
    const today = todayIso();
    const ownContactIds = new Set(
      snapshot.contacts.filter((contact) => contact.linked_member_id === currentMemberId).map((contact) => contact.id),
    );
    return snapshot.ideas
      .filter((row) => !(row.giftee_contact_id && ownContactIds.has(row.giftee_contact_id)))
      .map((row) => toGiftIdea(row, snapshot.contacts, today))
      .sort((a, b) => (a.nextOccasionDate ?? 'z').localeCompare(b.nextOccasionDate ?? 'z'));
  }, [currentMemberId, query.data]);

  return {
    lists,
    items,
    shares,
    ideas,
    contactLists: query.data?.contactLists ?? [],
    contacts: query.data?.contacts ?? [],
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

export function useAddGiftIdea() {
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  return useCadeauxMutation((input: NewGiftIdeaInput) =>
    createGiftIdea(householdId as string, currentMemberId, input),
  );
}

export function useUpdateGiftIdea() {
  return useCadeauxMutation(
    ({ id, values }: { id: string; values: Partial<GiftIdeaRow> }) => updateGiftIdea(id, values),
  );
}

export function useDeleteGiftIdea() {
  return useCadeauxMutation((id: string) => deleteGiftIdea(id));
}

export function usePromoteGiftIdea() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useCadeauxMutation(
    ({
      listId,
      idea,
    }: {
      listId: string;
      idea: Pick<GiftIdeaRow, 'id' | 'name' | 'price' | 'url' | 'comment' | 'photo_url'>;
    }) => promoteIdeaToItem(householdId as string, listId, idea),
  );
}
