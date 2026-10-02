import { data, DataError } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type {
  ArdoiseGuestRow,
  ArdoiseMemberRow,
  ArdoiseRow,
  ExpenseParticipantRow,
  ExpenseRow,
  HouseholdMemberRow,
  InvitationRow,
} from '@/types';
import {
  GUEST_KEY_PREFIX,
  MEMBER_KEY_PREFIX,
  normalizeShares,
  participantKey,
  roundCents,
  type Balance,
  type InvitationInput,
  type NewExpenseInput,
  type ParticipantKind,
  type Settlement,
} from './types';

/**
 * Accès aux données de l'Ardoise. `expense_participants` ne porte pas de
 * `household_id` (accès dérivé de la dépense parente) : elle est donc lue par
 * jointure applicative plutôt que par `useResource`.
 */
export interface ArdoiseSnapshot {
  expenses: ExpenseRow[];
  participants: ExpenseParticipantRow[];
  guests: ArdoiseGuestRow[];
}

/** Ticket invité stocké localement, par ardoise (jamais en base en clair côté client). */
const guestTicketKey = (ardoiseId: string) => `eo:ardoise:ticket:${ardoiseId}`;

export function readGuestTicket(ardoiseId: string): string | null {
  try {
    return window.localStorage.getItem(guestTicketKey(ardoiseId));
  } catch {
    return null;
  }
}

export function writeGuestTicket(ardoiseId: string, ticket: string): void {
  try {
    window.localStorage.setItem(guestTicketKey(ardoiseId), ticket);
  } catch {
    // Stockage indisponible : le ticket est perdu à la fermeture, l'invité
    // utilisera de nouveau son code.
  }
}

export function clearGuestTicket(ardoiseId: string): void {
  try {
    window.localStorage.removeItem(guestTicketKey(ardoiseId));
  } catch {
    // Rien à nettoyer.
  }
}

/** Les clés `membre:`/`invite:` portent le kind ; toute autre forme est rejetée (`null`). */
function splitParticipantKey(key: string): { kind: ParticipantKind; id: string } | null {
  if (key.startsWith(GUEST_KEY_PREFIX)) {
    const id = key.slice(GUEST_KEY_PREFIX.length);
    return id === '' ? null : { kind: 'guest', id };
  }
  if (key.startsWith(MEMBER_KEY_PREFIX)) {
    const id = key.slice(MEMBER_KEY_PREFIX.length);
    return id === '' ? null : { kind: 'membre', id };
  }
  return null;
}

/** Clés `membre:` (membre du foyer) ou `invite:` (invité de l'ardoise). */
function assertParticipantKeys(participants: string[]): void {
  if (participants.some((key) => splitParticipantKey(key) === null)) {
    throw new Error('Participant invalide : partagez entre membres et invités de l’ardoise.');
  }
}

/** Variante qui lève (les appels sont précédés de `assertParticipantKeys`). */
function requireSplitParticipantKey(key: string): { kind: ParticipantKind; id: string } {
  const split = splitParticipantKey(key);
  if (!split) throw new Error('Participant invalide : partagez entre membres et invités de l’ardoise.');
  return split;
}
export async function fetchArdoiseSnapshot(householdId: string): Promise<ArdoiseSnapshot> {
  const [expenses, participants] = await Promise.all([
    data.list<ExpenseRow>('expenses', { household_id: householdId }),
    data.list<ExpenseParticipantRow>('expense_participants', {}),
  ]);
  return { expenses, participants, guests: [] };
}

/** Instantané d'UNE ardoise : dépenses, parts et invités. */
export async function fetchArdoiseDetail(ardoiseId: string): Promise<ArdoiseSnapshot> {
  const [expenses, guests] = await Promise.all([
    data.list<ExpenseRow>('expenses', { ardoise_id: ardoiseId }),
    data.list<ArdoiseGuestRow>('ardoise_guests', { ardoise_id: ardoiseId }).catch(() => []),
  ]);
  const participants = await data.list<ExpenseParticipantRow>('expense_participants', {});
  return {
    expenses,
    participants: participants.filter((part) => expenses.some((expense) => expense.id === part.expense_id)),
    guests,
  };
}

export async function fetchArdoises(householdId: string): Promise<ArdoiseRow[]> {
  const rows = await data.list<ArdoiseRow>('ardoises', { household_id: householdId });
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export interface NewArdoiseInput {
  name: string;
  description?: string;
  coverUrl?: string | null;
  /** Sélection initiale (ids de membres) : absent = tous les admin/membre. */
  memberIds?: string[];
}

/** Création : Edge + RPC serveur en configuré (seed des membres inclus), direct + seed en local. */
export async function createArdoise(householdId: string, input: NewArdoiseInput): Promise<ArdoiseRow> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) throw new Error('Nommez votre ardoise (1 à 120 caractères).');
  if (isSupabaseConfigured) {
    return callArdoiseInvite<ArdoiseRow>('create-ardoise', {
      name,
      description: input.description?.trim() || undefined,
      coverUrl: input.coverUrl ?? undefined,
      householdId,
      ...(input.memberIds ? { memberIds: input.memberIds } : {}),
    });
  }
  const created = await data.create<ArdoiseRow>('ardoises', {
    household_id: householdId,
    name,
    description: input.description?.trim() || null,
    cover_url: input.coverUrl ?? null,
  });
  // Seed local : les écrivains du foyer (même règle que le serveur).
  const members = await data.list<HouseholdMemberRow>('household_members', { household_id: householdId }).catch(() => []);
  const wanted = input.memberIds === undefined ? null : new Set(input.memberIds);
  await Promise.all(
    members
      .filter((member) => member.role === 'admin' || member.role === 'membre')
      .filter((member) => (wanted === null ? true : wanted.has(member.id)))
      .map((member) =>
        data.create<ArdoiseMemberRow>('ardoise_members', { ardoise_id: created.id, member_id: member.id }).catch(() => undefined),
      ),
  );
  return created;
}

export async function updateArdoise(
  id: string,
  input: { name?: string; description?: string | null; cover_url?: string | null },
): Promise<ArdoiseRow> {
  return data.update<ArdoiseRow>('ardoises', id, input);
}

export async function deleteArdoise(id: string): Promise<void> {
  clearGuestTicket(id);
  await data.remove('ardoises', id);
}

/** Membres inscrits à l'ardoise (ids de `household_members`). */
export async function fetchArdoiseMemberIds(ardoiseId: string): Promise<string[]> {
  const rows = await data.list<ArdoiseMemberRow>('ardoise_members', { ardoise_id: ardoiseId }).catch(() => []);
  return rows.map((row) => row.member_id);
}

/**
 * Ajout ultérieur de membres (admin du foyer : politique
 * `ardoise_members_admin`, doublons ignorés).
 */
export async function addArdoiseMembers(ardoiseId: string, memberIds: string[]): Promise<void> {
  await Promise.all(
    memberIds.map((memberId) =>
      data.create<ArdoiseMemberRow>('ardoise_members', { ardoise_id: ardoiseId, member_id: memberId }).catch(() => undefined),
    ),
  );
}

/** Retrait d'un membre (l'historique — dépenses, parts — est conservé). */
export async function removeArdoiseMember(ardoiseId: string, memberId: string): Promise<void> {
  await data.removeWhere('ardoise_members', { ardoise_id: ardoiseId, member_id: memberId });
}

/**
 * Payeur externe saisi en texte libre : invité existant (même nom) ou créé
 * (sans ticket d'accès). En configuré via l'Edge, en local en direct.
 */
export async function ensureExpenseGuest(ardoiseId: string, displayName: string): Promise<{ id: string; name: string }> {
  const name = displayName.trim();
  if (name.length === 0) throw new Error('Indiquez le nom de la personne.');
  if (isSupabaseConfigured) {
    const created = await callArdoiseInvite<{ guest_id: string; display_name: string }>('add-guest', {
      ardoiseId,
      displayName: name,
    });
    return { id: created.guest_id, name: created.display_name };
  }
  const guests = await data.list<ArdoiseGuestRow>('ardoise_guests', { ardoise_id: ardoiseId }).catch(() => []);
  const existing = guests.find((guest) => guest.display_name.toLowerCase() === name.toLowerCase());
  if (existing) return { id: existing.id, name: existing.display_name };
  const created = await data.create<ArdoiseGuestRow>('ardoise_guests', {
    ardoise_id: ardoiseId,
    display_name: name,
    ticket_hash: null,
  });
  return { id: created.id, name: created.display_name };
}

/* ------------------------------------------------------------------ */
/* Partage par code (Edge Function `ardoise-invite`)                   */
/* ------------------------------------------------------------------ */

async function callArdoiseInvite<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/ardoise-invite`, {
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

export interface ArdoiseCode {
  code: string;
  expiresAt: string | null;
  maxUses: number;
  ardoiseId: string;
}

export interface ArdoiseCodeSummary {
  ardoiseId: string;
  isActive: boolean;
  hasCode: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}

export async function createInviteCode(ardoiseId: string, options?: { expiresAt?: string; maxUses?: number }): Promise<ArdoiseCode> {
  return callArdoiseInvite<ArdoiseCode>('create', {
    ardoiseId,
    ...(options?.expiresAt ? { expiresAt: options.expiresAt } : {}),
    ...(options?.maxUses ? { maxUses: options.maxUses } : {}),
  });
}

export async function revokeInviteCode(ardoiseId: string): Promise<void> {
  await callArdoiseInvite('revoke', { ardoiseId });
}

export async function fetchInviteSummary(ardoiseId: string): Promise<ArdoiseCodeSummary | null> {
  if (!isSupabaseConfigured) return null;
  return callArdoiseInvite<ArdoiseCodeSummary | null>('summary', { ardoiseId });
}

/** Membre du foyer qui rejoint via code (idempotent). */
export async function joinArdoise(code: string): Promise<{ ardoise_id: string }> {
  return callArdoiseInvite('join', { code: code.trim() });
}

export interface GuestExpenseView {
  id: string;
  title: string;
  amount: number;
  date: string;
  paidByName: string;
  participants: { name: string; share: number }[];
}

export interface GuestArdoiseView {
  ardoise: { id: string; name: string; description: string | null; cover_url: string | null; is_active: boolean };
  /** NULL en accès anonyme par lien (aucun nom demandé). */
  guest: { display_name: string } | null;
  expenses: GuestExpenseView[];
  settlement: ArdoiseServerSettlement | null;
}

/** Lecture invité sans compte (ticket remis à l'échange). */
export async function fetchGuestArdoiseView(ticket: string): Promise<GuestArdoiseView> {
  return callArdoiseInvite<GuestArdoiseView>('guest-view', { ticket });
}

/** Lecture anonyme par lien : le code suffit, sans nom ni ticket. */
export async function fetchGuestLinkView(code: string): Promise<GuestArdoiseView> {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Lien invalide.');
  return callArdoiseInvite<GuestArdoiseView>('link-view', { code: trimmed });
}

/** Invité externe : échange le code contre un ticket stocké localement. */
export async function redeemGuestTicket(code: string, displayName: string): Promise<{ ardoiseId: string }> {
  const trimmed = code.trim();
  if (trimmed.length < 22) throw new Error('Un code fait au moins 22 caractères.');
  const name = displayName.trim();
  if (name.length === 0) throw new Error('Indiquez un pseudonyme.');
  const result = await callArdoiseInvite<{ ardoise_id: string; guest_ticket: string }>('redeem-guest', {
    code: trimmed,
    displayName: name,
  });
  writeGuestTicket(result.ardoise_id, result.guest_ticket);
  return { ardoiseId: result.ardoise_id };
}

/**
 * Écriture logique en deux temps : la dépense, puis ses parts. En cas d'échec
 * sur une part, la dépense est retirée pour ne pas laisser de ligne orpheline.
 *
 * Ce chemin multi-appels ne vaut qu'en mode local : contre un vrai Supabase,
 * le contrôle différé de la somme est vérifié au COMMIT de chaque transaction
 * et le deuxième appel échoue toujours (migration 0035). Le mode configuré
 * passe donc par le RPC transactionnel ci-dessous.
 */
export async function createExpense(householdId: string, input: NewExpenseInput): Promise<ExpenseRow> {
  if (!input.ardoiseId) throw new Error('Choisissez une ardoise pour la dépense.');
  if (input.participants.length === 0) {
    throw new Error('Choisissez au moins une personne qui partage la dépense.');
  }
  assertParticipantKeys(input.participants);
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const shares = normalizeShares(amount, input.participants, input.splitType === 'personnalise' ? input.customShares : undefined);
  const paidByKind = input.paidByKind ?? 'membre';
  if (isSupabaseConfigured) {
    return callExpenseRpc('create_expense', {
      p_household_id: householdId,
      p_ardoise_id: input.ardoiseId,
      p_title: input.title.trim(),
      p_amount: amount,
      p_paid_by: paidByKind === 'membre' ? input.paidBy : null,
      p_paid_by_guest: paidByKind === 'guest' ? input.paidBy : null,
      p_expense_date: input.date,
      p_split_type: input.splitType,
      p_parts: expensePartsPayload(input.participants, shares),
    });
  }
  const expense = await data.create<ExpenseRow>('expenses', {
    household_id: householdId,
    ardoise_id: input.ardoiseId,
    title: input.title.trim(),
    amount,
    paid_by: paidByKind === 'membre' ? input.paidBy : null,
    paid_by_guest: paidByKind === 'guest' ? input.paidBy : null,
    expense_date: input.date,
    split_type: input.splitType,
    created_at: new Date().toISOString(),
  });

  try {
    for (const [index, key] of input.participants.entries()) {
      const { kind, id } = requireSplitParticipantKey(key);
      await data.create<ExpenseParticipantRow>('expense_participants', {
        expense_id: expense.id,
        participant_type: kind,
        member_id: kind === 'membre' ? id : null,
        guest_id: kind === 'guest' ? id : null,
        share_amount: roundCents(shares[index] ?? 0),
      });
    }
  } catch (error) {
    await data.remove('expenses', expense.id).catch(() => undefined);
    throw error;
  }
  return expense;
}

/** Supprime les parts puis la dépense : aucune ligne orpheline ne subsiste. */
export async function deleteExpense(expenseId: string): Promise<void> {
  const participants = await data.list<ExpenseParticipantRow>('expense_participants', { expense_id: expenseId });
  await Promise.all(participants.map((participant) => data.remove('expense_participants', participant.id)));
  await data.remove('expenses', expenseId);
}

/**
 * Modification d'une dépense : la ligne puis ses parts, remplacées en bloc.
 * En mode local uniquement (même raison transactionnelle qu'à la création) ;
 * en mode configuré, le RPC atomique ci-dessus. En cas d'échec sur les parts,
 * restauration best-effort de l'ancien état.
 */
export async function updateExpense(expenseId: string, input: NewExpenseInput): Promise<ExpenseRow> {
  if (input.participants.length === 0) {
    throw new Error('Choisissez au moins une personne qui partage la dépense.');
  }
  assertParticipantKeys(input.participants);
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const shares = normalizeShares(amount, input.participants, input.splitType === 'personnalise' ? input.customShares : undefined);
  const paidByKind = input.paidByKind ?? 'membre';
  if (isSupabaseConfigured) {
    return callExpenseRpc('update_expense', {
      p_expense_id: expenseId,
      p_title: input.title.trim(),
      p_amount: amount,
      p_paid_by: paidByKind === 'membre' ? input.paidBy : null,
      p_paid_by_guest: paidByKind === 'guest' ? input.paidBy : null,
      p_expense_date: input.date,
      p_split_type: input.splitType,
      p_parts: expensePartsPayload(input.participants, shares),
    });
  }

  const [old] = await data.list<ExpenseRow>('expenses', { id: expenseId });
  if (!old) throw new Error('Dépense introuvable.');
  const oldParts = await data.list<ExpenseParticipantRow>('expense_participants', { expense_id: expenseId });

  const updated = await data.update<ExpenseRow>('expenses', expenseId, {
    title: input.title.trim(),
    amount,
    paid_by: paidByKind === 'membre' ? input.paidBy : null,
    paid_by_guest: paidByKind === 'guest' ? input.paidBy : null,
    expense_date: input.date,
    split_type: input.splitType,
  });

  try {
    await Promise.all(oldParts.map((participant) => data.remove('expense_participants', participant.id)));
    for (const [index, key] of input.participants.entries()) {
      const { kind, id } = requireSplitParticipantKey(key);
      await data.create<ExpenseParticipantRow>('expense_participants', {
        expense_id: expenseId,
        participant_type: kind,
        member_id: kind === 'membre' ? id : null,
        guest_id: kind === 'guest' ? id : null,
        share_amount: roundCents(shares[index] ?? 0),
      });
    }
  } catch (error) {
    await restoreExpense(old, oldParts);
    throw error;
  }
  return updated;
}

/** Restauration best-effort après un remplacement de parts avorté. */
async function restoreExpense(old: ExpenseRow, oldParts: ExpenseParticipantRow[]): Promise<void> {  await data
    .update('expenses', old.id, {
      title: old.title,
      amount: old.amount,
      paid_by: old.paid_by,
      expense_date: old.expense_date,
      split_type: old.split_type,
    })
    .catch(() => undefined);
  const current = await data.list<ExpenseParticipantRow>('expense_participants', { expense_id: old.id }).catch(() => []);
  await Promise.all(current.map((participant) => data.remove('expense_participants', participant.id)).map((promise) => promise.catch(() => undefined)));
  for (const part of oldParts) {
    await data
      .create('expense_participants', {
        expense_id: part.expense_id,
        participant_type: part.participant_type,
        member_id: part.member_id,
        guest_id: part.guest_id,
        share_amount: part.share_amount,
      })
      .catch(() => undefined);
  }
}

/**
 * Parts au format du RPC : membres du foyer et invités de l'ardoise,
 * vérifiés par la fonction avant écriture.
 */
export function expensePartsPayload(keys: string[], shares: number[]) {
  return keys.map((key, index) => {
    const { kind, id } = requireSplitParticipantKey(key);
    return {
      participant_type: kind,
      member_id: kind === 'membre' ? id : null,
      guest_id: kind === 'guest' ? id : null,
      share_amount: roundCents(shares[index] ?? 0),
    };
  });
}

/**
 * Écriture atomique via PostgREST RPC : UNE transaction, donc le contrôle
 * différé de la somme ne voit que l'état final, complet (migration 0035).
 * Le message d'erreur vient de la base et est écrit pour l'utilisateur.
 */
async function callExpenseRpc(functionName: 'create_expense' | 'update_expense', payload: Record<string, unknown>): Promise<ExpenseRow> {
  if (!supabase) throw new DataError('Supabase n’est pas configuré sur cet environnement.');
  try {
    const { data: row, error } = await supabase.rpc(functionName, payload);
    if (error) throw new DataError(error.message || 'Écriture refusée.', error);
    return row as ExpenseRow;
  } catch (requestError) {
    // Hors ligne, une écriture multi-lignes ne peut pas être mise en file :
    // chaque mutation rejouée serait sa propre transaction et retomberait sur
    // le contrôle différé. Échec franc, dialogue conservé — pas de fausse
    // promesse de synchronisation.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new DataError('Hors ligne : reconnectez-vous pour enregistrer la dépense.', requestError);
    }
    throw requestError instanceof DataError ? requestError : new DataError('Écriture refusée.', requestError);
  }
}

async function callInvitationFunction(payload: InvitationInput): Promise<InvitationRow> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/household-invitation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Invitation impossible.');
  }
  return (await response.json()) as InvitationRow;
}

/**
 * Invitation ciblée (`invitations`), distincte du token d'accès au foyer. Aucun
 * changement de rôle n'est appliqué depuis le client : la ligne reste en attente
 * et le rôle effectif est accordé à l'acceptation. En mode Supabase, l'envoi
 * passe par l'Edge Function `household-invitation` (opération serveur).
 */
export async function createInvitation(householdId: string, input: InvitationInput): Promise<InvitationRow> {
  if (isSupabaseConfigured) return callInvitationFunction(input);
  return data.create<InvitationRow>('invitations', {
    household_id: householdId,
    email: input.email.trim(),
    phone: null,
    role: input.role,
    status: 'en_attente',
    created_at: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Soldes serveur (Edge Function `expense-settlement`)                 */
/* ------------------------------------------------------------------ */

/**
 * Contrat de réponse de `expense-settlement` (montants au centime, solde
 * positif = l'ardoise doit au participant). Membres et invités.
 */
export interface ServerSettlement {
  household_id: string;
  balances: { member_id: string; display_name: string; amount: number }[];
  settlements: { from_member_id: string; from_name: string; to_member_id: string; to_name: string; amount: number }[];
  generated_at: string;
}

export interface ArdoiseServerSettlement {
  ardoise_id: string;
  household_id: string | null;
  balances: { kind: ParticipantKind; participant_id: string; display_name: string; amount: number }[];
  settlements: {
    from_kind: ParticipantKind;
    from_id: string;
    from_name: string;
    to_kind: ParticipantKind;
    to_id: string;
    to_name: string;
    amount: number;
  }[];
  generated_at: string;
}

export class SettlementRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SettlementRequestError';
    this.status = status;
  }
}

/**
 * Soldes d'UNE ardoise, calculés en base. `null` en mode local (démo, hors
 * ligne sans backend) : l'appelant bascule alors sur le calcul local de
 * `types.ts`. Les invités passent leur ticket (`x-ardoise-guest`), les membres
 * leur session. Une erreur réseau ne renvoie jamais `null` : elle lève, et
 * c'est l'appelant qui décide du repli.
 */
export async function fetchArdoiseSettlement(ardoiseId: string, guestTicket: string | null = null): Promise<ArdoiseServerSettlement | null> {
  if (!supabase) return null;

  const { data: body, error, response } = await supabase.functions.invoke('expense-settlement', {
    body: { ardoise_id: ardoiseId },
    headers: guestTicket ? { 'x-ardoise-guest': guestTicket } : undefined,
  });
  if (error) {
    throw new SettlementRequestError(
      typeof response?.status === 'number' ? response.status : 0,
      await readSettlementError(response),
    );
  }
  return body as ArdoiseServerSettlement;
}

async function readSettlementError(response: Response | undefined): Promise<string> {
  if (response) {
    try {
      const parsed = (await response.clone().json()) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Corps vide ou non JSON : repli générique ci-dessous.
    }
  }
  return 'Calcul des soldes impossible pour le moment.';
}

/**
 * Soldes serveur -> lignes d'affichage. Miroir des graines locales
 * (`use-ardoise.ts`) : les enfants en sont exclus, la pastille couleur vient
 * du foyer (grise pour les invités). Un participant inconnu du store est
 * conservé (nom du serveur) plutôt que masqué : un solde qui disparaît est
 * pire qu'une pastille grise.
 */
export function toServerBalances(payload: ArdoiseServerSettlement, members: HouseholdMemberRow[]): Balance[] {
  const index = new Map(members.map((member) => [member.id, member]));
  return payload.balances
    .filter((row) => (row.kind === 'membre' ? index.get(row.participant_id)?.role !== 'enfant' : true))
    .map((row) => ({
      key: participantKey(row.kind, row.participant_id),
      kind: row.kind,
      name: row.display_name || (row.kind === 'membre' ? (index.get(row.participant_id)?.display_name || 'Membre') : 'Invité'),
      colorTag: row.kind === 'membre' ? (index.get(row.participant_id)?.color_tag ?? null) : null,
      amount: roundCents(Number(row.amount) || 0),
    }));
}

/** Transferts serveur -> propositions d'affichage (membres et invités). */
export function toServerSettlements(payload: ArdoiseServerSettlement): Settlement[] {
  return payload.settlements.map((row) => ({
    id: `${participantKey(row.from_kind, row.from_id)}>${participantKey(row.to_kind, row.to_id)}`,
    fromKey: participantKey(row.from_kind, row.from_id),
    fromName: row.from_name,
    toKey: participantKey(row.to_kind, row.to_id),
    toName: row.to_name,
    amount: roundCents(Number(row.amount) || 0),
  }));
}
