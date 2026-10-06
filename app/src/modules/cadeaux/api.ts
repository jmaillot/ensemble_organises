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

/**
 * Source de lecture des articles (0080, T-05-03) : la vue
 * `gift_items_for_list` masque `reserved_by` (NULL) au propriétaire de la
 * liste, via `SECURITY INVOKER` (la RLS des tables filtre toujours les
 * lignes). L'UI ne lit JAMAIS la table brute pour afficher ; les écritures
 * (create/update/remove) passent toujours par `gift_items` (on n'écrit pas
 * via une vue). En mode local, l'adaptateur sert la vue depuis le magasin
 * `gift_items` (aucune frontière serveur hors ligne — le masquage réel est
 * prod, porté par la vue).
 */
const GIFT_ITEMS_VIEW = 'gift_items_for_list';

export async function fetchCadeauxSnapshot(householdId: string): Promise<CadeauxSnapshot> {
  const [lists, items, shares, birthdays, ideas, contactLists, contacts] = await Promise.all([
    data.list<GiftListRow>('gift_lists', { household_id: householdId }),
    data.list<GiftItemRow>(GIFT_ITEMS_VIEW, { household_id: householdId }),
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
  // Énumération via la vue masquée (mêmes lignes, mêmes ids — seul
  // `reserved_by` peut être NULL) ; la suppression vise la table brute.
  const [items, shares] = await Promise.all([
    data.list<GiftItemRow>(GIFT_ITEMS_VIEW, { list_id: listId }),
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

/* ------------------------------------------------------------------ */
/* Invité sans compte (phase 06, D-05/D-06/D-09)                        */
/*                                                                     */
/* Même Edge Function, forme d'appel publishable : la clé publiable    */
/* part toujours, le jeton porteur seulement quand une session existe. */
/* Un visiteur sans compte n'envoie donc aucun identifiant au-delà du  */
/* code (EST le contrôle d'accès). La charge utile invitée ne porte    */
/* qu'un booléen `reserved` par article — jamais d'auteur (D-07).      */
/* ------------------------------------------------------------------ */

/** Article tel que le voit un visiteur : état réservé seul, sans auteur. */
export interface GuestGiftItem {
  id: string;
  name: string;
  price: number;
  comment: string | null;
  reserved: boolean;
}

/** Vue invitée : identité de la liste + états réservés seuls. */
export interface GuestGiftView {
  listId: string | null;
  listName: string | null;
  items: GuestGiftItem[];
}

/** Réserve invitée : idempotente à nom égal (`alreadyReserved: true`). */
export interface GuestReserveResult {
  itemId: string;
  alreadyReserved: boolean;
}

/** Borne du nom auto-déclaré (D-06) : miroir exact du CHECK base + Zod Edge. */
export const GUEST_NAME_MAX = 80;

async function callGiftInvitePublishable<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
  // Jeton porteur seulement en session : le visiteur sans compte reste
  // strictement anonyme (aucune session attachée au-delà du code).
  try {
    const session = (await supabase?.auth.getSession())?.data.session ?? null;
    if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
  } catch {
    // Stockage de session illisible : on part sans jeton (chemin visiteur).
  }
  const response = await fetch(`${supabaseFunctionsBase}/gift-list-invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Partage impossible.');
  }
  return (await response.json()) as T;
}

/** Garde code côté client : aucun appel réseau sous 22 caractères. */
function assertGuestCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Un code fait au moins 22 caractères.');
  return trimmed;
}

/** Garde nom côté client : 1 à 80 caractères après rognage (miroir serveur). */
function assertGuestName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > GUEST_NAME_MAX) {
    throw new Error('Indiquez un nom (1 à 80 caractères).');
  }
  return trimmed;
}

/**
 * Lecture invitée sans compte : rend la liste + les états réservés seuls.
 * Les erreurs Edge sont déjà des messages utilisateurs (`Ce code est
 * invalide.` pour l'oracle, sans distinction d'état) : on les propage tels
 * quels, sans les reformuler.
 */
export async function fetchGuestGiftView(code: string): Promise<GuestGiftView> {
  const trimmed = assertGuestCode(code);
  const view = await callGiftInvitePublishable<{
    listId: string | null;
    listName: string | null;
    items: GuestGiftItem[];
  }>('guest-view', { code: trimmed });
  return { listId: view.listId, listName: view.listName, items: Array.isArray(view.items) ? view.items : [] };
}

/**
 * Réserve invitée sans compte : code + article + nom déclaré. Le succès
 * idempotent à nom égal (`alreadyReserved: true`) est un succès comme les
 * autres ; le conflit à nom différent (`Cet article est déjà réservé.`,
 * 409) et l'oracle (`Ce code est invalide.`, 404) restent distincts.
 */
export async function reserveGuestGiftItem(code: string, itemId: string, name: string): Promise<GuestReserveResult> {
  const trimmedCode = assertGuestCode(code);
  const trimmedName = assertGuestName(name);
  const trimmedItem = itemId.trim();
  if (!trimmedItem) throw new Error('Article introuvable.');
  return callGiftInvitePublishable<GuestReserveResult>('guest-reserve', {
    code: trimmedCode,
    itemId: trimmedItem,
    name: trimmedName,
  });
}

/* ------------------------------------------------------------------ */
/* Mémoire cosmétique du nom déclaré (D-09)                             */
/*                                                                     */
/* Strictement décorative : pré-remplit le champ et surligne « cela    */
/* ressemble à votre réservation ». Jamais une preuve — la vérité reste */
/* côté serveur à chaque vue. Les accesseurs ne lèvent jamais.          */
/* ------------------------------------------------------------------ */

const guestNameStorageKey = (code: string) => `cadeaux:guest-name:${code.trim()}`;
const guestReservedStorageKey = (code: string) => `cadeaux:guest-reserved:${code.trim()}`;

/** Dernier nom déclaré pour ce code, ou null (stockage illisible ou vide). */
export function readGuestName(code: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(guestNameStorageKey(code));
    const trimmed = stored?.trim() ?? '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** Mémorise le nom déclaré pour ce code (pré-remplissage seul). */
export function writeGuestName(code: string, name: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(guestNameStorageKey(code), name.trim());
  } catch {
    // Stockage plein ou bloqué : la réserve a réussi, on n'échoue pas pour ça.
  }
}

/** Ids réservés depuis cet appareil pour ce code (surlignage seul). */
export function readGuestReservedIds(code: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(guestReservedStorageKey(code));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

/** Marque un article comme « réservé depuis cet appareil » (cosmétique). */
export function markGuestReservedItem(code: string, itemId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = guestReservedStorageKey(code);
    const known = new Set(readGuestReservedIds(code));
    known.add(itemId);
    localStorage.setItem(key, JSON.stringify([...known]));
  } catch {
    // Comme ci-dessus : décoratif, jamais bloquant.
  }
}

/* ------------------------------------------------------------------ */
/* Envoi de l'invitation par e-mail (phase 06, D-02/D-03/D-04)          */
/*                                                                     */
/* Chemin session attachée (user-only) : le dialogue crée D'ABORD la   */
/* part `lecture` via son chemin existant, PUIS appelle ce helper qui  */
/* fait créer la part côté serveur avant l'envoi (D-04, jamais d'envoi */
/* sans part). Le lien complet vient du dialogue (qui connaît l'origine */
/* de l'application) : le serveur ne devine jamais l'hôte.             */
/* ------------------------------------------------------------------ */

const guestEmailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SendGiftInviteEmailInput {
  /** Code brut du lien embarqué dans l'e-mail (EST le contrôle d'accès). */
  code: string;
  /** Destinataire : normalisé (minuscules) côté serveur. */
  email: string;
  /** Message personnel de l'hôte (D-03) : optionnel, 500 caractères au plus. */
  message?: string;
  /** Lien d'invitation complet affiché dans l'e-mail. */
  link: string;
}

export interface SendGiftInviteEmailResult {
  listId: string;
  email: string;
  sent: boolean;
}

/** Envoie l'e-mail d'invitation (hôte connecté, part `lecture` d'abord). */
export async function sendGiftListInviteEmail(input: SendGiftInviteEmailInput): Promise<SendGiftInviteEmailResult> {
  const code = assertGuestCode(input.code);
  const email = input.email.trim();
  if (!guestEmailPattern.test(email)) throw new Error('Indiquez un email valide.');
  const link = input.link.trim();
  if (!link) throw new Error('Lien d’invitation invalide.');
  const message = input.message?.trim() ? input.message.trim() : undefined;
  if (message !== undefined && message.length > 500) {
    throw new Error('Le message personnel fait 500 caractères au plus.');
  }
  return callGiftInvite<SendGiftInviteEmailResult>('send-email', {
    code,
    email,
    ...(message !== undefined ? { message } : {}),
    link,
  });
}
