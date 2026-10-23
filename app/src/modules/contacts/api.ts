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
 * Déplacement personnel→Famille (D-04, plan 07-01) : écriture client directe,
 * charge minimale (`list_id` seul — `household_id` inchangé, même foyer).
 * La RLS exige l'écriture sur l'ancienne ET la nouvelle liste (prouvé en
 * 0036) ; le miroir anniversaire naît du trigger 0097.
 */
export async function moveContactToFamily(id: string, familyListId: string): Promise<ContactRow> {
  if (id.trim() === '' || familyListId.trim() === '') {
    throw new Error('Contact introuvable.');
  }
  return data.update<ContactRow>(CONTACTS, id, { list_id: familyListId });
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

/**
 * Import vCard : crée les fiches d'un coup, sans photo et sans membre lié —
 * le fichier ne dit rien de tel. Chaque écriture passe par le même chemin
 * `data.create` qu'une fiche saisie : la RLS et le miroir anniversaire
 * (trigger 0078) s'appliquent à l'identique. Une fiche qui échoue ne bloque
 * pas les autres : le compte rendu dit combien sont passées.
 */
export async function createContactsBulk(
  people: ReadonlyArray<{ name: string; birthDate: string | null }>,
  householdId: string,
  listId: string,
): Promise<number> {
  const results = await Promise.allSettled(
    people.map((person) =>
      data.create<ContactRow>(CONTACTS, {
        household_id: householdId,
        list_id: listId,
        name: person.name.trim(),
        birth_date: person.birthDate,
        photo_url: null,
        linked_member_id: null,
      }),
    ),
  );
  const created = results.filter((result) => result.status === 'fulfilled');
  if (created.length === 0 && results.length > 0) {
    const firstRejection = results.find((result) => result.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    throw firstRejection?.reason instanceof Error ? firstRejection.reason : new Error('Aucune fiche n’a pu être importée.');
  }
  return created.length;
}
