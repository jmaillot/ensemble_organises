import { data } from '@/lib/data';
import type { ContactListRow, ContactRow } from '@/types';
import type { ContactFormValues } from './types';
import { parseFrDate } from './types';

const CONTACT_LISTS = 'contact_lists';
const CONTACTS = 'contacts';

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

function toRowValues(input: ContactFormValues, householdId: string) {
  const birthDate = input.birthDate.trim() === '' ? null : parseFrDate(input.birthDate);
  return {
    household_id: householdId,
    list_id: input.listId,
    name: input.name.trim(),
    birth_date: birthDate,
    photo_url: emptyToNull(input.photoUrl),
    linked_member_id: emptyToNull(input.linkedMemberId),
  };
}

export async function fetchContactsSnapshot(householdId: string): Promise<{ lists: ContactListRow[]; contacts: ContactRow[] }> {
  const [lists, contacts] = await Promise.all([
    data.list<ContactListRow>(CONTACT_LISTS, { household_id: householdId }),
    data.list<ContactRow>(CONTACTS, { household_id: householdId }),
  ]);
  return { lists, contacts };
}

export async function createContact(input: ContactFormValues, householdId: string): Promise<ContactRow> {
  return data.create<ContactRow>(CONTACTS, toRowValues(input, householdId));
}

export async function updateContact(id: string, input: ContactFormValues, householdId: string): Promise<ContactRow> {
  return data.update<ContactRow>(CONTACTS, id, toRowValues(input, householdId));
}

export async function deleteContact(id: string): Promise<void> {
  await data.remove(CONTACTS, id);
}

/**
 * Flux « anniversaire d'abord » (D-10) : la case cochée du dialogue
 * anniversaire crée la fiche dans la liste partagée. Le trigger miroir
 * 0078 absorbe le double-miroir grâce à sa garde nom normalisé + date.
 */
export async function createContactFromBirthday(input: {
  householdId: string;
  listId: string;
  name: string;
  birthDate: string;
  photoUrl: string | null;
  linkedMemberId: string | null;
}): Promise<ContactRow> {
  return data.create<ContactRow>(CONTACTS, {
    household_id: input.householdId,
    list_id: input.listId,
    name: input.name.trim(),
    birth_date: input.birthDate,
    photo_url: input.photoUrl,
    linked_member_id: input.linkedMemberId,
  });
}
