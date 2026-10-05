import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import { randomId } from '@/lib/utils';
import type { BirthdayRow, ContactListRow, ContactRow, GiftIdeaRow, GiftItemRow, GiftListRow, GiftListShareRow } from '@/types';
import { roundPrice, type GiftPermission, type GiftShareInput, type NewGiftIdeaInput, type NewGiftItemInput, type NewGiftListInput } from './types';

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
  ideas: GiftIdeaRow[];
  contactLists: ContactListRow[];
  contacts: ContactRow[];
}

export async function fetchCadeauxSnapshot(householdId: string): Promise<CadeauxSnapshot> {
  const [lists, items, shares, birthdays, ideas, contactLists, contacts] = await Promise.all([
    data.list<GiftListRow>('gift_lists', { household_id: householdId }),
    data.list<GiftItemRow>('gift_items', { household_id: householdId }),
    data.list<GiftListShareRow>('gift_list_shares', {}),
    data.list<BirthdayRow>('birthdays', { household_id: householdId }),
    data.list<GiftIdeaRow>('gift_ideas', { household_id: householdId }),
    data.list<ContactListRow>('contact_lists', { household_id: householdId }),
    data.list<ContactRow>('contacts', { household_id: householdId }),
  ]);
  return { lists, items, shares, birthdays, ideas, contactLists, contacts };
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
    idea_id: input.ideaId ?? null,
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

/* ------------------------------------------------------------------ */
/* Idées cadeau (D-05/D-07/D-08)                                       */
/*                                                                     */
/* Mêmes règles que les listes : INSERT sans représentation puis       */
/* relecture (MVCC 0028/0032). Si la relecture est vide, l'idée vise   */
/* son propre créateur : la RLS surprise la lui masque aussitôt — on   */
/* renvoie alors l'écho des valeurs insérées plutôt qu'une erreur.     */
/* ------------------------------------------------------------------ */

export async function createGiftIdea(
  householdId: string,
  createdBy: string | null,
  input: NewGiftIdeaInput,
): Promise<GiftIdeaRow> {
  const values = {
    household_id: householdId,
    name: input.name.trim(),
    price: input.price === null ? null : roundPrice(input.price),
    url: input.url,
    comment: input.comment,
    photo_url: input.photoUrl,
    status: input.status,
    giftee_text: input.gifteeText,
    giftee_contact_id: input.gifteeContactId,
    created_by: createdBy,
  };
  if (isSupabaseConfigured && supabase) {
    const id = randomId('gift-idea');
    const stamped = new Date().toISOString();
    const { error } = await supabase.from('gift_ideas').insert({ ...values, id, created_at: stamped, updated_at: stamped });
    if (error) throw new Error(error.message);
    const rows = await data.list<GiftIdeaRow>('gift_ideas', { id });
    const row = rows[0];
    if (row) return row;
    return { ...values, id, created_at: stamped, updated_at: stamped } as GiftIdeaRow;
  }
  return data.create<GiftIdeaRow>('gift_ideas', values);
}

export async function updateGiftIdea(
  id: string,
  values: Partial<Pick<GiftIdeaRow, 'name' | 'price' | 'url' | 'comment' | 'photo_url' | 'status' | 'giftee_text' | 'giftee_contact_id'>>,
): Promise<GiftIdeaRow> {
  const normalized =
    values.price === undefined ? values : { ...values, price: values.price === null ? null : roundPrice(values.price) };
  return data.update<GiftIdeaRow>('gift_ideas', id, normalized as Partial<GiftIdeaRow>);
}

export async function deleteGiftIdea(id: string): Promise<void> {
  await data.remove('gift_ideas', id);
}

/**
 * Promotion idée→article (D-05) : l'article porte `idea_id`, les onglets
 * restent sinon indépendants. Passer l'idée à `offert` marque ensuite
 * l'article acheté via le trigger serveur (D-06) ; l'UI relit après
 * mutation pour en refléter l'effet.
 */
export async function promoteIdeaToItem(
  householdId: string,
  listId: string,
  idea: Pick<GiftIdeaRow, 'id' | 'name' | 'price' | 'url' | 'comment' | 'photo_url'>,
): Promise<GiftItemRow> {
  return createGiftItem(householdId, {
    listId,
    name: idea.name,
    price: idea.price === null ? null : Number(idea.price),
    url: idea.url,
    comment: idea.comment,
    photoUrl: idea.photo_url,
    ideaId: idea.id,
  });
}

export async function createGiftList(householdId: string, ownerMemberId: string, input: NewGiftListInput): Promise<GiftListRow> {
  // INSERT…RETURNING est refusé sur gift_lists : sa politique SELECT relit la
  // ligne par son id, invisible dans la même commande (MVCC). On insère donc
  // sans représentation, puis on relit la ligne commise (voir 0028/0032).
  if (isSupabaseConfigured && supabase) {
    const id = randomId('gift_lists');
    const { error } = await supabase.from('gift_lists').insert({
      id,
      household_id: householdId,
      owner_member_id: ownerMemberId,
      name: input.name.trim(),
      visibility: input.visibility,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    const rows = await data.list<GiftListRow>('gift_lists', { id });
    const row = rows[0];
    if (!row) throw new Error('Liste introuvable après création.');
    return row;
  }
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

/* ------------------------------------------------------------------ */
/* Partage par code (Edge Function `gift-list-invite`, user-only)       */
/*                                                                     */
/* OQ-1 OPTION A (plan 05-03, verrouillée) : aucun chemin anonyme. Le   */
/* lien `/invitation/cadeau?code=…` mène vers inscription/connexion     */
/* avec l'e-mail invité, puis l'échange active le partage via la        */
/* branche e-mail de `redeem_gift_list_invite`.                        */
/* ------------------------------------------------------------------ */

/** Lien à envoyer à l'externe : affiché une seule fois avec le code (QR). */
export function giftInviteLink(code: string): string {
  return `/invitation/cadeau?code=${encodeURIComponent(code)}`;
}

async function callGiftInvite<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/gift-list-invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Partage impossible.');
  }
  return (await response.json()) as T;
}

export interface GiftListInviteCode {
  code: string;
  expiresAt: string | null;
  maxUses: number;
  listId: string;
}

export interface GiftListInviteSummary {
  listId: string;
  isActive: boolean;
  hasCode: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}

/** Génère (ou régénère, invalidant le précédent) le code d'une liste. */
export async function createGiftListInviteCode(
  listId: string,
  options?: { expiresAt?: string; maxUses?: number },
): Promise<GiftListInviteCode> {
  return callGiftInvite<GiftListInviteCode>('create', {
    listId,
    ...(options?.expiresAt ? { expiresAt: options.expiresAt } : {}),
    ...(options?.maxUses ? { maxUses: options.maxUses } : {}),
  });
}

/** Arrête le partage : tous les codes actifs de la liste sont révoqués. */
export async function revokeGiftListInviteCode(listId: string): Promise<void> {
  await callGiftInvite('revoke', { listId });
}

export async function fetchGiftListInviteSummary(listId: string): Promise<GiftListInviteSummary | null> {
  if (!isSupabaseConfigured) return null;
  return callGiftInvite<GiftListInviteSummary | null>('summary', { listId });
}

/**
 * Échange un code contre un partage `reservation` (idempotent).
 * Membre du foyer : e-mail inutile. Externe (OPTION A) : passer l'e-mail de
 * son compte — créé avec l'e-mail invité — pour activer son partage.
 */
export async function redeemGiftListInvite(code: string, email?: string): Promise<{ list_id: string; already_shared: boolean }> {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Un code fait au moins 22 caractères.');
  return callGiftInvite('redeem', {
    code: trimmed,
    ...(email?.trim() ? { email: email.trim() } : {}),
  });
}
