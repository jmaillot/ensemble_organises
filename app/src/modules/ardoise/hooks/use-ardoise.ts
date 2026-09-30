import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMonthLabel, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, MemberColorTag } from '@/types';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import { createExpense, createInvitation, deleteExpense, fetchArdoiseSnapshot, toServerBalances, toServerSettlements, updateExpense } from '../api';
import { ardoiseKeys, useServerSettlement } from './use-settlement';
import {
  computeBalances,
  externalKey,
  externalSettlements,
  memberKey,
  roundCents,
  simplifyDebts,
  toExpense,
  type Balance,
  type Expense,
  type ExternalParticipant,
  type InvitationInput,
  type MemberOption,
  type NewExpenseInput,
  type Participant,
  type ParticipantResolver,
  type Settlement,
} from '../types';

/** Membres qui partagent réellement l'ardoise : les enfants en sont exclus. */
const sharingMembers = (members: MemberOption[]) => members.filter((member) => member.role !== 'enfant');

export interface ArdoiseData {
  expenses: Expense[];
  balances: Balance[];
  settlements: Settlement[];
  /** `serveur` quand `expense-settlement` répond, `local` sinon (démo, hors ligne, erreur). */
  settlementSource: 'serveur' | 'local';
  sharingMembers: MemberOption[];
  externalParticipants: ExternalParticipant[];
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

export function useArdoise(): ArdoiseData {
  const householdId = useHouseholdStore((state) => state.householdId);
  const members = useMembers();
  const currentMember = useCurrentMember();

  const query = useQuery({
    queryKey: ardoiseKeys.snapshot(householdId),
    enabled: Boolean(householdId),
    queryFn: () => fetchArdoiseSnapshot(householdId as string),
  });

  const externalParticipants = useMemo<ExternalParticipant[]>(
    () =>
      (query.data?.externalParticipants ?? []).map((row) => ({ id: row.id, name: row.name, contact: row.contact })),
    [query.data],
  );

  const memberOptions = useMemo<MemberOption[]>(
    () => members.map((member) => ({ id: member.id, name: member.display_name, colorTag: member.color_tag, role: member.role })),
    [members],
  );
  const sharers = useMemo(() => sharingMembers(memberOptions), [memberOptions]);

  const resolver = useMemo<ParticipantResolver>(() => {
    const memberIndex = new Map<string, { name: string; colorTag: MemberColorTag | null }>();
    members.forEach((member) => memberIndex.set(member.id, { name: member.display_name, colorTag: member.color_tag }));
    const externalIndex = new Map<string, { name: string; colorTag: null }>();
    externalParticipants.forEach((participant) => externalIndex.set(participant.id, { name: participant.name, colorTag: null }));
    return (kind, id) => (kind === 'membre' ? (memberIndex.get(id) ?? null) : (externalIndex.get(id) ?? null));
  }, [externalParticipants, members]);

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
        externalParticipantId: null,
        name: member.name,
        colorTag: member.colorTag,
        shareAmount: 0,
      })),
      ...externalParticipants.map<Participant>((participant) => ({
        key: externalKey(participant.id),
        kind: 'externe',
        memberId: null,
        externalParticipantId: participant.id,
        name: participant.name,
        colorTag: null,
        shareAmount: 0,
      })),
    ],
    [externalParticipants, sharers],
  );

  const balances = useMemo(() => computeBalances(expenses, seeds), [expenses, seeds]);
  const localSettlements = useMemo(() => simplifyDebts(balances), [balances]);

  // Référence serveur quand elle répond : les soldes membres et leurs
  // transferts viennent de la base, les externes restent calculés localement
  // (le serveur les ignore). Sinon, calcul local intégral — démo, hors ligne,
  // ou fonction injoignable : jamais un écran d'erreur pour des soldes.
  const settlementQuery = useServerSettlement(householdId);
  const serverPayload = settlementQuery.data ?? null;

  useEffect(() => {
    if (settlementQuery.isError) {
      console.warn('Ardoise : soldes serveur injoignables, repli sur le calcul local.', settlementQuery.error);
    }
  }, [settlementQuery.isError, settlementQuery.error]);

  const externalBalances = useMemo(
    () => computeBalances(expenses, seeds.filter((seed) => seed.kind === 'externe')),
    [expenses, seeds],
  );

  const { displayBalances, displaySettlements, settlementSource } = useMemo(() => {
    if (!serverPayload) {
      return { displayBalances: balances, displaySettlements: localSettlements, settlementSource: 'local' as const };
    }
    const memberBalances = toServerBalances(serverPayload, members);
    const combined = [...memberBalances, ...externalBalances];
    return {
      displayBalances: combined,
      displaySettlements: [...toServerSettlements(serverPayload), ...externalSettlements(combined)],
      settlementSource: 'serveur' as const,
    };
  }, [serverPayload, balances, localSettlements, members, externalBalances]);

  const total = useMemo(() => roundCents(expenses.reduce((sum, expense) => sum + expense.amount, 0)), [expenses]);
  const monthTotal = useMemo(() => {
    const month = todayIso().slice(0, 7);
    return roundCents(expenses.filter((expense) => expense.date.startsWith(month)).reduce((sum, expense) => sum + expense.amount, 0));
  }, [expenses]);

  return {
    expenses,
    balances: displayBalances,
    settlements: displaySettlements,
    settlementSource,
    sharingMembers: sharers,
    externalParticipants,
    currentMember,
    total,
    monthTotal,
    monthLabel: formatMonthLabel(new Date()),
    averageTicket: expenses.length === 0 ? 0 : roundCents(total / expenses.length),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
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

export function useAddExpense() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useArdoiseMutation((input: NewExpenseInput) => createExpense(householdId as string, input));
}

export function useUpdateExpense() {
  return useArdoiseMutation(({ expenseId, input }: { expenseId: string; input: NewExpenseInput }) =>
    updateExpense(expenseId, input),
  );
}

export function useDeleteExpense() {
  return useArdoiseMutation((expenseId: string) => deleteExpense(expenseId));
}

export function useSendInvitation() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useArdoiseMutation((input: InvitationInput) => createInvitation(householdId as string, input));
}
