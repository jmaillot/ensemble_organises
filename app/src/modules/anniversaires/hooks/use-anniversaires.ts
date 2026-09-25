import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { toBirthday } from '../types';
import type { Birthday, BirthdayFormValues } from '../types';
import { createBirthday, deleteBirthday, updateBirthday } from '../api';
import type { BirthdayRow } from '@/types';

export interface AnniversairesResource {
  /** Tous les anniversaires, triés par prochaine échéance. */
  birthdays: Birthday[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveBirthday: (id: string | null, values: BirthdayFormValues) => Promise<string>;
  removeBirthday: (id: string) => Promise<void>;
}

/** Anniversaires du foyer, enrichis du membre lié et du prochain rendez-vous. */
export function useAnniversaires(): AnniversairesResource {
  const queryClient = useQueryClient();
  const members = useMembers();
  const householdId = useHouseholdStore((state) => state.householdId);
  const resource = useResource<BirthdayRow>('birthdays');

  const refresh = useCallback(() => invalidateTables(queryClient, ['birthdays']), [queryClient]);

  // Les anniversaires peuvent être modifiés depuis un autre écran du foyer.
  useEffect(() => data.subscribe('birthdays', refresh), [refresh]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: BirthdayFormValues }) => {
      const row = id
        ? await updateBirthday(id, values, householdId ?? '')
        : await createBirthday(values, householdId ?? '');
      return row.id;
    },
    onSuccess: refresh,
  });

  const removeMutation = useMutation({ mutationFn: (id: string) => deleteBirthday(id), onSuccess: refresh });

  const birthdays = useMemo(
    () => resource.rows.map((row) => toBirthday(row, members)).sort((a, b) => a.daysUntil - b.daysUntil),
    [resource.rows, members],
  );

  return {
    birthdays,
    isLoading: resource.isLoading,
    isError: resource.isError,
    error: resource.error,
    refetch: resource.refetch,
    isMutating: saveMutation.isPending || removeMutation.isPending,
    saveBirthday: (id, values) => saveMutation.mutateAsync({ id, values }),
    removeBirthday: async (id) => {
      await removeMutation.mutateAsync(id);
    },
  };
}
