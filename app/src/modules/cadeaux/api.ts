import { data } from '@/lib/data';
import type { BirthdayRow, GiftItemRow, GiftListRow, GiftListShareRow } from '@/types';
import { roundPrice, type GiftPermission, type GiftShareInput, type NewGiftItemInput, type NewGiftListInput } from './types';

/**
 * Accès aux données des Cadeaux. `gift_list_shares` ne porte pas de
 * `household_id` (accès dérivé de la liste parente) : les partages sont donc lus
 * par jointure applicative, comme `expense_participants` dans l'Ardoise.
 */
export interface CadeauxSnapshot {
  lists: GiftListRow[];
  items: GiftItemRow[];
  shares: GiftListShareRow[];
  birthdays: BirthdayRow[];
}

export async function fetchCadeauxSnapshot(householdId: string): Promise<CadeauxSnapshot> {
  const [lists, items, shares, birthdays] = await Promise.all([
    data.list<GiftListRow>('gift_lists', { household_id: householdId }),
    data.list<GiftItemRow>('gift_items', { household_id: householdId }),
    data.list<GiftListShareRow>('gift_list_shares', {}),
    data.list<BirthdayRow>('birthdays', { household_id: householdId }),
  ]);
  return { lists, items, shares, birthdays };
}

export async function createGiftItem(householdId: string, input: NewGiftItemInput): Promise<GiftItemRow> {
  return data.create<GiftItemRow>('gift_items', {
    household_id: householdId,
    list_id: input.listId,
    name: input.name.trim(),
    price: input.price === null ? null : roundPrice(input.price),
    comment: input.comment,
    photo_url: input.photoUrl,
    url: input.url,
    reserved_by: null,
    purchased: false,
    created_at: new Date().toISOString(),
  });
}

export async function updateGiftItem(
  id: string,
  values: Partial<Pick<GiftItemRow, 'name' | 'price' | 'comment' | 'photo_url' | 'url' | 'reserved_by' | 'purchased'>>,
): Promise<GiftItemRow> {
  return data.update<GiftItemRow>('gift_items', id, values as Partial<GiftItemRow>);
}

export async function deleteGiftItem(id: string): Promise<void> {
  await data.remove('gift_items', id);
}

export async function createGiftList(householdId: string, ownerMemberId: string, input: NewGiftListInput): Promise<GiftListRow> {
  return data.create<GiftListRow>('gift_lists', {
    household_id: householdId,
    owner_member_id: ownerMemberId,
    name: input.name.trim(),
    visibility: input.visibility,
    created_at: new Date().toISOString(),
  });
}

/** Supprime les idées, les partages puis la liste : aucune ligne orpheline. */
export async function deleteGiftList(listId: string): Promise<void> {
  const [items, shares] = await Promise.all([
    data.list<GiftItemRow>('gift_items', { list_id: listId }),
    data.list<GiftListShareRow>('gift_list_shares', { list_id: listId }),
  ]);
  await Promise.all([
    ...items.map((item) => data.remove('gift_items', item.id)),
    ...shares.map((share) => data.remove('gift_list_shares', share.id)),
  ]);
  await data.remove('gift_lists', listId);
}

const shareMatches = (existing: GiftListShareRow, input: GiftShareInput) =>
  input.memberId ? existing.shared_with_member_id === input.memberId : existing.shared_with_email === input.email;

/**
 * Synchronise les partages d'une liste : les partages retirés sont supprimés,
 * les nouveaux sont créés, les permissions inchangées ne sont pas réécrites.
 */
export async function syncGiftListShares(
  listId: string,
  existing: GiftListShareRow[],
  next: GiftShareInput[],
): Promise<void> {
  const kept = new Set<string>();
  for (const share of next) {
    const match = existing.find((row) => shareMatches(row, share));
    const values = {
      list_id: listId,
      shared_with_member_id: share.memberId,
      shared_with_email: share.email,
      permission: share.permission as GiftPermission,
    };
    if (match) {
      kept.add(match.id);
      if (match.permission !== share.permission) {
        await data.update<GiftListShareRow>('gift_list_shares', match.id, { permission: share.permission });
      }
      continue;
    }
    const created = await data.create<GiftListShareRow>('gift_list_shares', values);
    kept.add(created.id);
  }
  await Promise.all(existing.filter((row) => !kept.has(row.id)).map((row) => data.remove('gift_list_shares', row.id)));
}
