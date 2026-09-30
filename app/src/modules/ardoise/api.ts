import { data, DataError } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type { ExpenseParticipantRow, ExpenseRow, HouseholdMemberRow, InvitationRow } from '@/types';
import {
  MEMBER_KEY_PREFIX,
  memberKey,
  normalizeShares,
  roundCents,
  type Balance,
  type InvitationInput,
  type NewExpenseInput,
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
}

/** Les dépenses ne se partagent qu'entre membres (décision 0038, même message que le serveur). */
function assertMembersOnly(participants: string[]): void {
  if (participants.some((key) => !key.startsWith(MEMBER_KEY_PREFIX))) {
    throw new Error('Les participants externes ne sont plus acceptés sur une dépense : partagez entre membres du foyer.');
  }
}
export async function fetchArdoiseSnapshot(householdId: string): Promise<ArdoiseSnapshot> {
  const [expenses, participants] = await Promise.all([
    data.list<ExpenseRow>('expenses', { household_id: householdId }),
    data.list<ExpenseParticipantRow>('expense_participants', {}),
  ]);
  return { expenses, participants };
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
  if (input.participants.length === 0) {
    throw new Error('Choisissez au moins une personne qui partage la dépense.');
  }
  assertMembersOnly(input.participants);
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const shares = normalizeShares(amount, input.participants, input.splitType === 'personnalise' ? input.customShares : undefined);
  if (isSupabaseConfigured) {
    return callExpenseRpc('create_expense', {
      p_household_id: householdId,
      p_title: input.title.trim(),
      p_amount: amount,
      p_paid_by: input.paidBy,
      p_expense_date: input.date,
      p_split_type: input.splitType,
      p_parts: expensePartsPayload(input.participants, shares),
    });
  }
  const expense = await data.create<ExpenseRow>('expenses', {
    household_id: householdId,
    title: input.title.trim(),
    amount,
    paid_by: input.paidBy,
    expense_date: input.date,
    split_type: input.splitType,
    created_at: new Date().toISOString(),
  });

  try {
    for (const [index, key] of input.participants.entries()) {
      await data.create<ExpenseParticipantRow>('expense_participants', {
        expense_id: expense.id,
        participant_type: 'membre',
        member_id: key.slice(MEMBER_KEY_PREFIX.length),
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
  assertMembersOnly(input.participants);
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const shares = normalizeShares(amount, input.participants, input.splitType === 'personnalise' ? input.customShares : undefined);
  if (isSupabaseConfigured) {
    return callExpenseRpc('update_expense', {
      p_expense_id: expenseId,
      p_title: input.title.trim(),
      p_amount: amount,
      p_paid_by: input.paidBy,
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
    paid_by: input.paidBy,
    expense_date: input.date,
    split_type: input.splitType,
  });

  try {
    await Promise.all(oldParts.map((participant) => data.remove('expense_participants', participant.id)));
    for (const [index, key] of input.participants.entries()) {
      await data.create<ExpenseParticipantRow>('expense_participants', {
        expense_id: expenseId,
        participant_type: 'membre',
        member_id: key.slice(MEMBER_KEY_PREFIX.length),
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
        share_amount: part.share_amount,
      })
      .catch(() => undefined);
  }
}

/**
 * Parts au format du RPC : membres du foyer uniquement (externes purgés,
 * 0039), vérifiées par la fonction avant écriture.
 */
export function expensePartsPayload(keys: string[], shares: number[]) {
  return keys.map((key, index) => {
    if (!key.startsWith(MEMBER_KEY_PREFIX)) {
      throw new Error('Les participants externes ne sont plus acceptés sur une dépense : partagez entre membres du foyer.');
    }
    return {
      participant_type: 'membre',
      member_id: key.slice(MEMBER_KEY_PREFIX.length),
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
 * positif = le foyer doit au membre). Membres du foyer uniquement.
 */
export interface ServerSettlement {
  household_id: string;
  balances: { member_id: string; display_name: string; amount: number }[];
  settlements: { from_member_id: string; from_name: string; to_member_id: string; to_name: string; amount: number }[];
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
 * Soldes de référence, calculés en base. `null` en mode local (démo, hors
 * ligne sans backend) : l'appelant bascule alors sur le calcul local de
 * `types.ts`. Une erreur réseau ne renvoie jamais `null` : elle lève, et
 * c'est l'appelant qui décide du repli.
 */
export async function fetchServerSettlement(householdId: string): Promise<ServerSettlement | null> {
  if (!supabase) return null;

  // `functions.invoke` résout même sur un échec HTTP : le statut vit dans
  // `error`, pas dans la promesse (même piège que `push.ts`).
  const { data: body, error, response } = await supabase.functions.invoke('expense-settlement', {
    body: { household_id: householdId },
  });
  if (error) {
    throw new SettlementRequestError(
      typeof response?.status === 'number' ? response.status : 0,
      await readSettlementError(response),
    );
  }
  return body as ServerSettlement;
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
 * du foyer. Un membre inconnu du store est conservé (nom du serveur) plutôt
 * que masqué : un solde qui disparaît est pire qu'une pastille grise.
 */
export function toServerBalances(payload: ServerSettlement, members: HouseholdMemberRow[]): Balance[] {
  const index = new Map(members.map((member) => [member.id, member]));
  return payload.balances
    .filter((row) => index.get(row.member_id)?.role !== 'enfant')
    .map((row) => ({
      key: memberKey(row.member_id),
      kind: 'membre' as const,
      name: row.display_name || index.get(row.member_id)?.display_name || 'Membre',
      colorTag: index.get(row.member_id)?.color_tag ?? null,
      amount: roundCents(Number(row.amount) || 0),
    }));
}

/** Transferts serveur -> propositions d'affichage (membres uniquement). */
export function toServerSettlements(payload: ServerSettlement): Settlement[] {
  return payload.settlements.map((row) => ({
    id: `${memberKey(row.from_member_id)}>${memberKey(row.to_member_id)}`,
    fromKey: memberKey(row.from_member_id),
    fromName: row.from_name,
    toKey: memberKey(row.to_member_id),
    toName: row.to_name,
    amount: roundCents(Number(row.amount) || 0),
  }));
}
