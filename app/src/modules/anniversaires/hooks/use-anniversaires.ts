import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { createContactFromBirthday } from '@/modules/contacts/api';
import { aggregateBirthdays, toBirthday } from '../types';
import type { AggregatedBirthday, Birthday, BirthdayFormValues } from '../types';
import { createBirthday, deleteBirthday, updateBirthday } from '../api';
import type { BirthdayRow, ContactListRow, ContactRow } from '@/types';

const TABLES = ['birthdays', 'contacts', 'contact_lists'];

export interface AnniversairesResource {
  /** Tous les anniversaires, triés par prochaine échéance. */
  birthdays: Birthday[];
  /**
   * Vue agrégée birthdays + contacts dates (D-09) : paires miroir en une
   * seule ligne, homonymes indépendants badgés (D-12), photo contact
   * prioritaire (D-13). Triée par prochaine échéance.
   */
  aggregated: AggregatedBirthday[];
  /** Listes de contacts, pour la case « créer aussi un contact » (D-10). */
  contactLists: ContactListRow[];
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
  const contactsResource = useResource<ContactRow>('contacts');
  const listsResource = useResource<ContactListRow>('contact_lists');

  const refresh = useCallback(() => invalidateTables(queryClient, TABLES), [queryClient]);

  // Les anniversaires peuvent être modifiés depuis un autre écran du foyer.
  useEffect(() => data.subscribe('birthdays', refresh), [refresh]);
  useEffect(() => data.subscribe('contacts', refresh), [refresh]);

  const contactLists = useMemo(() => listsResource.rows, [listsResource.rows]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: BirthdayFormValues }) => {
      const row = id
        ? await updateBirthday(id, values, householdId ?? '')
        : await createBirthday(values, householdId ?? '');
      // Flux « anniversaire d'abord » (D-10) : la fiche contact est créée
      // dans la liste partagée ; la garde serveur 0078 absorbe le
      // double-miroir (aucun doublon possible).
      if (!id && values.createContact) {
        const target =
          contactLists.find((list) => list.owner_member_id === null && list.is_default) ?? contactLists[0] ?? null;
        if (target) {
          try {
            await createContactFromBirthday({
              householdId: householdId ?? '',
              listId: target.id,
              name: values.name,
              birthDate: row.birth_date,
              photoUrl: row.photo_url,
              linkedMemberId: row.linked_member_id,
            });
          } catch (contactError) {
            throw new Error(
              `Anniversaire enregistré, mais le contact n’a pas pu être créé : ${contactError instanceof Error ? contactError.message : 'erreur inconnue'}`,
            );
          }
        }
      }
      return row.id;
    },
    onSuccess: refresh,
  });

  const removeMutation = useMutation({ mutationFn: (id: string) => deleteBirthday(id), onSuccess: refresh });

  const birthdays = useMemo(
    () => resource.rows.map((row) => toBirthday(row, members)).sort((a, b) => a.daysUntil - b.daysUntil),
    [resource.rows, members],
  );

  const aggregated = useMemo(
    () => aggregateBirthdays(resource.rows, contactsResource.rows, members),
    [resource.rows, contactsResource.rows, members],
  );

  return {
    birthdays,
    aggregated,
    contactLists,
    isLoading: resource.isLoading || contactsResource.isLoading || listsResource.isLoading,
    isError: resource.isError || contactsResource.isError || listsResource.isError,
    error: resource.error ?? contactsResource.error ?? listsResource.error,
    refetch: () => {
      resource.refetch();
      contactsResource.refetch();
      listsResource.refetch();
    },
    isMutating: saveMutation.isPending || removeMutation.isPending,
    saveBirthday: (id, values) => saveMutation.mutateAsync({ id, values }),
    removeBirthday: async (id) => {
      await removeMutation.mutateAsync(id);
    },
  };
}
