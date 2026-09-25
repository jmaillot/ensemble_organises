import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import type { ExpenseParticipantRow, ExpenseRow, ExternalParticipantRow, InvitationRow } from '@/types';
import {
  EXTERNAL_KEY_PREFIX,
  MEMBER_KEY_PREFIX,
  normalizeShares,
  roundCents,
  type InvitationInput,
  type NewExpenseInput,
} from './types';

/**
 * Accès aux données de l'Ardoise. `expense_participants` ne porte pas de
 * `household_id` (accès dérivé de la dépense parente) : elle est donc lue par
 * jointure applicative plutôt que par `useResource`.
 */
export interface ArdoiseSnapshot {
  expenses: ExpenseRow[];
  participants: ExpenseParticipantRow[];
  externalParticipants: ExternalParticipantRow[];
}

export async function fetchArdoiseSnapshot(householdId: string): Promise<ArdoiseSnapshot> {
  const [expenses, participants, externalParticipants] = await Promise.all([
    data.list<ExpenseRow>('expenses', { household_id: householdId }),
    data.list<ExpenseParticipantRow>('expense_participants', {}),
    data.list<ExternalParticipantRow>('external_participants', { household_id: householdId }),
  ]);
  return { expenses, participants, externalParticipants };
}

/**
 * Écriture logique en deux temps : la dépense, puis ses parts. En cas d'échec
 * sur une part, la dépense est retirée pour ne pas laisser de ligne orpheline.
 */
export async function createExpense(householdId: string, input: NewExpenseInput): Promise<ExpenseRow> {
  if (input.participants.length === 0) {
    throw new Error('Choisissez au moins une personne qui partage la dépense.');
  }
  const amount = roundCents(input.amount);
  if (amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const shares = normalizeShares(amount, input.participants, input.splitType === 'personnalise' ? input.customShares : undefined);
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
      const isMember = key.startsWith(MEMBER_KEY_PREFIX);
      // Contrainte SQL : `membre` ⇒ member_id renseigné, `externe` l'inverse.
      await data.create<ExpenseParticipantRow>('expense_participants', {
        expense_id: expense.id,
        participant_type: isMember ? 'membre' : 'externe',
        member_id: isMember ? key.slice(MEMBER_KEY_PREFIX.length) : null,
        external_participant_id: isMember ? null : key.slice(EXTERNAL_KEY_PREFIX.length),
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
