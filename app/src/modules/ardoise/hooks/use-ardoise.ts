import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMonthLabel, todayIso } from '@/lib/utils';
import type { ArdoiseRow, HouseholdMemberRow, MemberColorTag } from '@/types';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import {
  createArdoise,
  createExpense,
  deleteArdoise,
  deleteExpense,
  fetchArdoiseDetail,
  fetchArdoises,
  toServerBalances,
  toServerSettlements,
  updateArdoise,
  updateExpense,
  type NewArdoiseInput,
} from '../api';
import { ardoiseKeys, useServerSettlement } from './use-settlement';
import {
  computeBalances,
  guestKey,
  memberKey,
  roundCents,
  simplifyDebts,
  toExpense,
  type Balance,
  type Expense,
  type MemberOption,
  type NewExpenseInput,
  type Participant,
  type ParticipantResolver,
  type Settlement,
} from '../types';

/** Membres qui partagent réellement : les enfants en sont exclus. */
const sharingMembers = (members: MemberOption[]) => members.filter((member) => member.role !== 'enfant');

export interface ArdoisesData {
  ardoises: ArdoiseRow[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  addArdoise: (input: NewArdoiseInput) => Promise<ArdoiseRow>;
  removeArdoise: (id: string) => Promise<void>;
}

/** Liste des ardoises du foyer + création / suppression. */
export function useArdoises(): ArdoisesData {
  const householdId = useHouseholdStore((state) => state.householdId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...ardoiseKeys.all, 'list', householdId ?? ''],
    enabled: Boolean(householdId),
    queryFn: () => fetchArdoises(householdId as string),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ardoiseKeys.all });

  const createMutation = useMutation({
    mutationFn: (input: NewArdoiseInput) => createArdoise(householdId as string, input),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArdoise(id),
    onSuccess: invalidate,
  });

  return {
    ardoises: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
    isMutating: createMutation.isPending || deleteMutation.isPending,
    addArdoise: (input) => createMutation.mutateAsync(input),
    removeArdoise: (id) => deleteMutation.mutateAsync(id),
  };
}

export interface ArdoiseDetailData {
  ardoise: ArdoiseRow | null;
  expenses: Expense[];
  balances: Balance[];
  settlements: Settlement[];
  /** `serveur` quand `expense-settlement` répond, `local` sinon (démo, hors ligne, erreur). */
  settlementSource: 'serveur' | 'local';
  sharingMembers: MemberOption[];
  guestOptions: { id: string; name: string }[];
  currentMember: HouseholdMemberRow | null;
  total: number;
  monthTotal: number;
  monthLabel: string;
  averageTicket: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Détail d'UNE ardoise : dépenses, invités, soldes (serveur puis local). */
export function useArdoiseDetail(ardoiseId: string | null): ArdoiseDetailData {
  const members = useMembers();
  const currentMember = useCurrentMember();

  const query = useQuery({
    queryKey: ardoiseKeys.detail(ardoiseId),
    enabled: Boolean(ardoiseId),
    queryFn: () => fetchArdoiseDetail(ardoiseId as string),
  });

  const ardoiseQuery = useQuery({
    queryKey: [...ardoiseKeys.all, 'row', ardoiseId ?? ''],
    enabled: Boolean(ardoiseId),
    queryFn: async () => {
      const householdId = useHouseholdStore.getState().householdId;
      if (!householdId) return null;
      const rows = await fetchArdoises(householdId);
      return rows.find((row) => row.id === ardoiseId) ?? null;
    },
  });

  const memberOptions = useMemo<MemberOption[]>(
    () => members.map((member) => ({ id: member.id, name: member.display_name, colorTag: member.color_tag, role: member.role })),
    [members],
  );
  const sharers = useMemo(() => sharingMembers(memberOptions), [memberOptions]);
  const guests = useMemo(() => query.data?.guests ?? [], [query.data]);

  const resolver = useMemo<ParticipantResolver>(() => {
    const memberIndex = new Map<string, { name: string; colorTag: MemberColorTag | null }>();
    members.forEach((member) => memberIndex.set(member.id, { name: member.display_name, colorTag: member.color_tag }));
    const guestIndex = new Map(guests.map((guest) => [guest.id, guest.display_name]));
    return (kind, id) => {
      if (kind === 'guest') {
        const name = guestIndex.get(id);
        return name ? { name, colorTag: null } : null;
      }
      return memberIndex.get(id) ?? null;
    };
  }, [guests, members]);

  const expenses = useMemo<Expense[]>(() => {
    const snapshot = query.data;
    if (!snapshot) return [];
    return snapshot.expenses
      .map((row) => toExpense(row, snapshot.participants, resolver))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [query.data, resolver]);

  const seeds = useMemo<Participant[]>(
    () => [
      ...sharers.map<Participant>((member) => ({
        key: memberKey(member.id),
        kind: 'membre',
        memberId: member.id,
        name: member.name,
        colorTag: member.colorTag,
        shareAmount: 0,
      })),
      ...guests.map<Participant>((guest) => ({
        key: guestKey(guest.id),
        kind: 'guest',
        memberId: guest.id,
        name: guest.display_name,
        colorTag: null,
        shareAmount: 0,
      })),
    ],
    [guests, sharers],
  );

  const balances = useMemo(() => computeBalances(expenses, seeds), [expenses, seeds]);
  const localSettlements = useMemo(() => simplifyDebts(balances), [balances]);

  // Référence serveur quand elle répond, calcul local intégral sinon — démo,
  // hors ligne, ou fonction injoignable : jamais un écran d'erreur pour des
  // soldes.
  const settlementQuery = useServerSettlement(ardoiseId);
  const serverPayload = settlementQuery.data ?? null;

  useEffect(() => {
    if (settlementQuery.isError) {
      console.warn('Ardoise : soldes serveur injoignables, repli sur le calcul local.', settlementQuery.error);
    }
  }, [settlementQuery.isError, settlementQuery.error]);

  const { displayBalances, displaySettlements, settlementSource } = useMemo(() => {
    if (!serverPayload) {
      return { displayBalances: balances, displaySettlements: localSettlements, settlementSource: 'local' as const };
    }
    return {
      displayBalances: toServerBalances(serverPayload, members),
      displaySettlements: toServerSettlements(serverPayload),
      settlementSource: 'serveur' as const,
    };
  }, [serverPayload, balances, localSettlements, members]);

  const total = useMemo(() => roundCents(expenses.reduce((sum, expense) => sum + expense.amount, 0)), [expenses]);
  const monthTotal = useMemo(() => {
    const month = todayIso().slice(0, 7);
    return roundCents(expenses.filter((expense) => expense.date.startsWith(month)).reduce((sum, expense) => sum + expense.amount, 0));
  }, [expenses]);

  return {
    ardoise: ardoiseQuery.data ?? null,
    expenses,
    balances: displayBalances,
    settlements: displaySettlements,
    settlementSource,
    sharingMembers: sharers,
    guestOptions: guests.map((guest) => ({ id: guest.id, name: guest.display_name })),
    currentMember,
    total,
    monthTotal,
    monthLabel: formatMonthLabel(new Date()),
    averageTicket: expenses.length === 0 ? 0 : roundCents(total / expenses.length),
    isLoading: query.isLoading || ardoiseQuery.isLoading,
    isError: query.isError || ardoiseQuery.isError,
    error: ((query.error ?? ardoiseQuery.error) as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
      void ardoiseQuery.refetch();
      void settlementQuery.refetch();
    },
  };
}

function useArdoiseMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ardoiseKeys.all }),
  });
}

export function useAddExpense(ardoiseId: string) {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useArdoiseMutation((input: NewExpenseInput) =>
    createExpense(householdId as string, { ...input, ardoiseId }),
  );
}

export function useUpdateExpense() {
  return useArdoiseMutation(({ expenseId, input }: { expenseId: string; input: NewExpenseInput }) =>
    updateExpense(expenseId, input),
  );
}

export function useDeleteExpense() {
  return useArdoiseMutation((expenseId: string) => deleteExpense(expenseId));
}

export function useRenameArdoise() {
  return useArdoiseMutation(({ id, name, description }: { id: string; name: string; description?: string | null }) =>
    updateArdoise(id, { name, description: description ?? null }),
  );
}
