import { data } from '@/lib/data';
import type { BirthdayRow } from '@/types';
import type { BirthdayFormValues } from './types';

const BIRTHDAYS = 'birthdays';

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

function toRowValues(input: BirthdayFormValues, householdId: string) {
  return {
    household_id: householdId,
    name: input.name.trim(),
    birth_date: input.birthDate,
    photo_url: emptyToNull(input.photoUrl),
    linked_member_id: emptyToNull(input.linkedMemberId),
  };
}

export async function createBirthday(input: BirthdayFormValues, householdId: string): Promise<BirthdayRow> {
  return data.create<BirthdayRow>(BIRTHDAYS, toRowValues(input, householdId));
}

export async function updateBirthday(id: string, input: BirthdayFormValues, householdId: string): Promise<BirthdayRow> {
  return data.update<BirthdayRow>(BIRTHDAYS, id, toRowValues(input, householdId));
}

export async function deleteBirthday(id: string): Promise<void> {
  await data.remove(BIRTHDAYS, id);
}
