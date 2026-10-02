import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import type { HouseholdRow } from '@/types';
import type { SchoolZone } from './use-ref-days';

/**
 * Zone scolaire du foyer (A/B/C) : pilote les vacances affichées.
 * Lecture pour tous les membres, écriture réservée aux admins (RLS).
 */
export function useSchoolZone() {
  const householdId = useHouseholdStore((state) => state.householdId);
  const queryClient = useQueryClient();

  const zoneQuery = useQuery({
    queryKey: ['household', 'school-zone', householdId],
    enabled: householdId !== null,
    queryFn: async (): Promise<SchoolZone | null> => {
      const rows = await data.list<HouseholdRow>('households');
      return (rows.find((row) => row.id === householdId)?.school_zone ?? null) as SchoolZone | null;
    },
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (zone: SchoolZone | null) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      await data.update<HouseholdRow>('households', householdId, { school_zone: zone });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['household', 'school-zone', householdId] });
    },
  });

  return {
    zone: zoneQuery.data ?? null,
    isLoading: zoneQuery.isLoading,
    isSaving: saveMutation.isPending,
    saveZone: (zone: SchoolZone | null) => saveMutation.mutateAsync(zone),
  };
}
