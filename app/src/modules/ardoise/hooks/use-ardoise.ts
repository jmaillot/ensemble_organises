import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMonthLabel, todayIso } from '@/lib/utils';
import { isHouseholdMediaPath } from '@/lib/storage';
import type { ArdoiseRow, HouseholdMemberRow, MemberColorTag } from '@/types';
import { useCurrentMember, useHouseholdStore, useMembers } from '@/stores/household-store';
import {
  addArdoiseMembers,
  createArdoise,
  createExpense,
  deleteArdoise,
  deleteExpense,
  fetchArdoiseDetail,
  fetchArdoiseMemberIds,
  fetchArdoises,
  removeArdoiseMember,
  resolveArdoiseCoverUrls,
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

/**
 * Valeur AFFICHABLE d'une couverture, à partir de sa valeur de colonne (D-01).
 *
 * Un chemin se lit dans la carte `resolved` — échec fermé : absent (`null`),
 * jamais un chemin brut ni un lien mort. Toute forme non-chemin (URL héritée,
 * `data:`, aperçu `blob:`, ressource applicative `/…`) s'affiche telle quelle,
 * sans passer par le Storage ; une valeur blanche ne donne aucune image.
 */
export function displayableCoverUrl(row: ArdoiseRow, resolved: Record<string, string>): string | null {
  const stored = row.cover_url;
  if (stored === null || stored.trim() === '') return null;
  if (!isHouseholdMediaPath(stored)) return stored;
  return resolved[row.id] ?? null;
}

/**
 * Carte des couvertures signées pour un jeu de lignes. Seuls les chemins
 * passent par le Storage ; les valeurs non-chemin n'ont rien à signer et
 * restent hors de la carte (l'affichage les rend telles quelles). Annulation
 * stricte : une réponse tardive d'un ancien jeu de lignes ne s'applique pas.
 */
function useArdoiseCoverUrls(rows: { id: string; cover_url: string | null }[]): Record<string, string> {
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const pending = rows.filter((row) => row.cover_url !== null && isHouseholdMediaPath(row.cover_url));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveArdoiseCoverUrls(pending).then((resolved) => {
      if (!cancelled) setCoverUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);
  return coverUrls;
}

export interface ArdoisesData {
  ardoises: ArdoiseRow[];
  /** Couvertures signées, indexées par id d'ardoise (chemins seulement). */
  coverUrls: Record<string, string>;
  /** Valeur affichable d'une couverture : URL signée, brute, ou `null`. */
  coverUrlOf: (row: ArdoiseRow) => string | null;
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

  /**
   * Phase 15 : les ardoises liées à un voyage vivent dans sa fiche Budget,
   * pas dans la liste du foyer (régime historique `trip_id NULL`, 15-01).
   * Le détail par id (`useArdoiseDetail`) reste inchangé : la fiche Budget
   * (15-03) le réutilise tel quel.
   */
  const ardoises = useMemo(() => (query.data ?? []).filter((row) => row.trip_id == null), [query.data]);
  const coverUrls = useArdoiseCoverUrls(ardoises);
  const coverUrlOf = useCallback((row: ArdoiseRow) => displayableCoverUrl(row, coverUrls), [coverUrls]);

  const createMutation = useMutation({
    mutationFn: (input: NewArdoiseInput) => createArdoise(householdId as string, input),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArdoise(id),
    onSuccess: invalidate,
  });

  return {
    ardoises,
    coverUrls,
    coverUrlOf,
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

/** Membres inscrits à UNE ardoise + ajout / retrait (admin du foyer). */
export function useArdoiseMembers(ardoiseId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...ardoiseKeys.all, 'members', ardoiseId ?? ''],
    enabled: Boolean(ardoiseId),
    queryFn: () => fetchArdoiseMemberIds(ardoiseId as string),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...ardoiseKeys.all, 'members', ardoiseId ?? ''] });
    queryClient.invalidateQueries({ queryKey: ardoiseKeys.detail(ardoiseId) });
  };
  const addMutation = useMutation({
    mutationFn: (memberIds: string[]) => addArdoiseMembers(ardoiseId as string, memberIds),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeArdoiseMember(ardoiseId as string, memberId),
    onSuccess: invalidate,
  });
  return {
    memberIds: query.data ?? [],
    isLoading: query.isLoading,
    isMutating: addMutation.isPending || removeMutation.isPending,
    addMembers: (memberIds: string[]) => addMutation.mutateAsync(memberIds),
    removeMember: (memberId: string) => removeMutation.mutateAsync(memberId),
  };
}

export interface ArdoiseDetailData {  ardoise: ArdoiseRow | null;
  /** Couvertures signées, indexées par id d'ardoise (chemins seulement). */
  coverUrls: Record<string, string>;
  /** Valeur affichable de la couverture : URL signée, brute, ou `null`. */
  coverUrlOf: (row: ArdoiseRow) => string | null;
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

  // La ligne unique porte un chemin : le détail en forge l'URL affichable une
  // fois (D-01), plutôt que de laisser l'écran lire `cover_url` brut.
  const ardoise = ardoiseQuery.data ?? null;
  const coverRows = useMemo(
    () => (ardoise ? [{ id: ardoise.id, cover_url: ardoise.cover_url }] : []),
    [ardoise],
  );
  const coverUrls = useArdoiseCoverUrls(coverRows);
  const coverUrlOf = useCallback((row: ArdoiseRow) => displayableCoverUrl(row, coverUrls), [coverUrls]);

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
    ardoise,
    coverUrls,
    coverUrlOf,
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
