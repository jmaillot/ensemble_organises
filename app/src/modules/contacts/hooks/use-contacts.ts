import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { isHouseholdMediaPath, resolveHouseholdMediaUrls } from '@/lib/storage';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { toContact, toContactList, type Contact, type ContactFormValues, type ContactList } from '../types';
import { createContact, deleteContact, moveContactToFamily, updateContact } from '../api';
import type { ContactListRow, ContactRow } from '@/types';

const TABLES = ['contact_lists', 'contacts'];

export interface ContactsResource {
  lists: ContactList[];
  contacts: Contact[];
  /** Fiches de la liste sélectionnée, triées par nom. */
  contactsOfList: (listId: string | null) => Contact[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveContact: (id: string | null, values: ContactFormValues) => Promise<string>;
  removeContact: (id: string) => Promise<void>;
  /** Déplace une fiche personnelle vers la liste Famille (D-04). */
  moveToFamily: (id: string) => Promise<void>;
}

/** Listes et fiches contacts du foyer, avec la liste « Famille » en tête. */
export function useContacts(): ContactsResource {
  const queryClient = useQueryClient();
  const members = useMembers();
  const householdId = useHouseholdStore((state) => state.householdId);
  const listsResource = useResource<ContactListRow>('contact_lists');
  const contactsResource = useResource<ContactRow>('contacts');

  const refresh = useCallback(() => invalidateTables(queryClient, TABLES), [queryClient]);

  // Les fiches peuvent être créées depuis l'écran Anniversaires (case D-10).
  useEffect(() => data.subscribe('contacts', refresh), [refresh]);
  useEffect(() => data.subscribe('contact_lists', refresh), [refresh]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: ContactFormValues }) => {
      const row = id
        ? await updateContact(id, values, householdId ?? '')
        : await createContact(values, householdId ?? '');
      return row.id;
    },
    onSuccess: refresh,
  });

  const removeMutation = useMutation({ mutationFn: (id: string) => deleteContact(id), onSuccess: refresh });

  // La liste « Famille » partagée reçoit les fiches déplacées (D-04).
  const moveMutation = useMutation({
    mutationFn: async (id: string) => {
      const target = listsResource.rows.find((row) => row.owner_member_id === null);
      if (!target) throw new Error('La liste Famille est introuvable.');
      await moveContactToFamily(id, target.id);
    },
    onSuccess: refresh,
  });

  const lists = useMemo(
    () =>
      listsResource.rows
        .map((row) => toContactList(row, members))
        .sort((a, b) => Number(b.isShared) - Number(a.isShared) || a.name.localeCompare(b.name, 'fr')),
    [listsResource.rows, members],
  );

  // Les fiches portent des chemins (D-01) : on forge les photos affichables à
  // la lecture, en échec fermé (annulation stricte, jamais d'état éventé). Les
  // formes non-chemin rendent en synchrone — seul un chemin passe par l'effet.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const contactRows = contactsResource.rows;
  useEffect(() => {
    const pending = contactRows
      .filter((row) => row.photo_url !== null && isHouseholdMediaPath(row.photo_url))
      .map((row) => ({ id: row.id, file_url: row.photo_url }));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveHouseholdMediaUrls(pending).then((resolved) => {
      if (!cancelled) setPhotoUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [contactRows]);

  const contacts = useMemo(
    () =>
      contactsResource.rows
        .map((row) => toContact(row, members, photoUrls))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [contactsResource.rows, members, photoUrls],
  );

  const contactsOfList = useCallback(
    (listId: string | null) => {
      if (listId === null) return contacts;
      return contacts.filter((contact) => contact.listId === listId);
    },
    [contacts],
  );

  return {
    lists,
    contacts,
    contactsOfList,
    isLoading: listsResource.isLoading || contactsResource.isLoading,
    isError: listsResource.isError || contactsResource.isError,
    error: listsResource.error ?? contactsResource.error,
    refetch: () => {
      listsResource.refetch();
      contactsResource.refetch();
    },
    isMutating: saveMutation.isPending || removeMutation.isPending || moveMutation.isPending,
    saveContact: (id, values) => saveMutation.mutateAsync({ id, values }),
    removeContact: async (id) => {
      await removeMutation.mutateAsync(id);
    },
    moveToFamily: async (id) => {
      await moveMutation.mutateAsync(id);
    },
  };
}
