/**
 * Onglet Budget d'un voyage (phase 15, 15-03) : enveloppe fine sur l'ardoise
 * liée, jamais une logique de règlement forkée (D-09).
 *
 * - Ardoise résolue strictement par `ardoises.trip_id = voyage courant`
 *   (T-15-13) ; absente → état d'erreur honnête, jamais un onglet vide.
 * - Détail et répartition : `useArdoiseDetail`, `MemberBalances` et
 *   `SettlementsPanel` réutilisés tels quels (`fetchArdoiseSettlement`
 *   appelé tel quel par le hook).
 * - Dépenses membres : chemins membres (`useAddExpense`, `ExpenseFormDialog`
 *   avec les participants du voyage seuls).
 * - Dépenses invités : action Edge `guest-expense-create` sous ticket
 *   `eo:trip:ticket:<tripId>` (jamais PostgREST — D-04).
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { formatEuro } from '@/lib/utils';
import { useIsAdmin } from '@/stores/household-store';
import type { HouseholdMemberRow, TripGuestRow } from '@/types';
import { useArdoiseDetail, useAddExpense, useUpdateExpense } from '@/modules/ardoise/hooks/use-ardoise';
import { MemberBalances } from '@/modules/ardoise/components/balance-panel';
import { SettlementsPanel } from '@/modules/ardoise/components/settlements-panel';
import { ExpenseFormDialog } from '@/modules/ardoise/components/expense-form-dialog';
import { SpendingPie } from '@/modules/ardoise/ardoise-detail-page';
import {
  applyFreePayerShare,
  computeSpent,
  type Expense,
  type MemberOption,
  type NewExpenseInput,
} from '@/modules/ardoise/types';
import { ensureExpenseGuest } from '@/modules/ardoise/api';
import {
  createTripGuestExpense,
  fetchTripArdoise,
  readTripTicket,
  toTripGuestExpenseBody,
  type TripGuestExpensePart,
} from '../api';

export const tripBudgetKeys = {
  all: ['voyages', 'trip-budget'] as const,
  ardoise: (tripId: string) => ['voyages', 'trip-budget', tripId, 'ardoise'] as const,
};

export interface TripBudgetTabProps {
  tripId: string;
  householdId: string;
  /** Participants du voyage : seuls proposés aux dépenses membres. */
  members: HouseholdMemberRow[];
  /** Invités externes : parts `guest` possibles sur leurs dépenses. */
  guests: TripGuestRow[];
  currentMemberId: string | null;
  readOnly?: boolean;
}

export function TripBudgetTab({ tripId, householdId, members, guests, currentMemberId, readOnly = false }: TripBudgetTabProps) {
  const ardoiseQuery = useQuery({
    queryKey: tripBudgetKeys.ardoise(tripId),
    queryFn: () => fetchTripArdoise(tripId, householdId),
  });

  if (ardoiseQuery.isLoading) return <LoadingRows rows={3} />;
  if (ardoiseQuery.isError) {
    return (
      <Panel id="trip-budget" title="Budget" description="L’ardoise liée à ce voyage.">
        <ErrorState
          message={ardoiseQuery.error instanceof Error ? ardoiseQuery.error.message : 'Le budget du voyage n’a pas pu être chargé.'}
          onRetry={() => void ardoiseQuery.refetch()}
        />
      </Panel>
    );
  }
  // L'ardoise liée naît avec le voyage (create-trip atomique 15-01) : son
  // absence est une erreur à dire, jamais un onglet silencieusement vide.
  if (!ardoiseQuery.data) {
    return (
      <Panel id="trip-budget" title="Budget" description="L’ardoise liée à ce voyage.">
        <ErrorState
          message="Aucune ardoise liée à ce voyage. Elle naît normalement avec le voyage : réessayez, ou recréez le voyage si le problème persiste."
          onRetry={() => void ardoiseQuery.refetch()}
        />
      </Panel>
    );
  }
  return (
    <TripBudgetBody
      tripId={tripId}
      ardoiseId={ardoiseQuery.data.id}
      ardoiseName={ardoiseQuery.data.name}
      members={members}
      guests={guests}
      currentMemberId={currentMemberId}
      readOnly={readOnly}
    />
  );
}

function TripBudgetBody({
  tripId,
  ardoiseId,
  ardoiseName,
  members,
  guests,
  currentMemberId,
  readOnly,
}: {
  tripId: string;
  ardoiseId: string;
  ardoiseName: string;
  members: HouseholdMemberRow[];
  guests: TripGuestRow[];
  currentMemberId: string | null;
  readOnly: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useArdoiseDetail(ardoiseId);
  const addExpense = useAddExpense(ardoiseId);
  const updateExpenseMutation = useUpdateExpense();
  const isAdmin = useIsAdmin();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Dépenses membres : participants du voyage seuls (même régime que les
  // inscrits de l'ardoise, synchronisés à la création/venue 15-01).
  const expenseMembers = useMemo<MemberOption[]>(
    () =>
      members
        .filter((member) => member.role !== 'enfant')
        .map((member) => ({ id: member.id, name: member.display_name, colorTag: member.color_tag, role: member.role })),
    [members],
  );
  const defaultPayerId =
    (currentMemberId && expenseMembers.some((member) => member.id === currentMemberId)
      ? currentMemberId
      : expenseMembers[0]?.id) ?? null;
  const paidByMember = useMemo(() => computeSpent(detail.expenses), [detail.expenses]);

  /**
   * Édition (0121) : l'admin du foyer modifie toute ligne, un membre
   * seulement celles qu'il a créées (lignes héritées sans créateur :
   * admin seuls).
   */
  const canEditExpense = (expense: Expense) =>
    isAdmin || (expense.createdBy !== null && expense.createdBy === currentMemberId);

  const openEditor = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseOpen(true);
  };

  const openCreator = () => {
    setEditingExpense(null);
    setExpenseOpen(true);
  };

  const submitMemberExpense = async (values: NewExpenseInput) => {
    try {
      let resolved = values;
      if (values.payerName && values.payerName.trim() !== '') {
        const guest = await ensureExpenseGuest(ardoiseId, values.payerName);
        const { payerName: _dropped, includePayer: _droppedFlag, ...rest } = values;
        resolved = {
          ...rest,
          paidBy: guest.id,
          paidByKind: 'guest',
          participants: applyFreePayerShare(values.participants, guest.id, {
            include: values.includePayer ?? true,
            splitType: values.splitType,
          }),
        };
      }
      if (editingExpense) {
        await updateExpenseMutation.mutateAsync({ expenseId: editingExpense.id, input: resolved });
        setExpenseOpen(false);
        setEditingExpense(null);
        detail.refetch();
        toast('Dépense mise à jour, les soldes sont à jour.');
        return;
      }
      await addExpense.mutateAsync(resolved);
      setExpenseOpen(false);
      toast('Dépense ajoutée, les soldes sont à jour.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'Dépense impossible.', 'error');
    }
  };

  if (detail.isError) {
    return (
      <Panel id="trip-budget" title="Budget" description={`Ardoise « ${ardoiseName} » liée au voyage.`}>
        <ErrorState
          message={detail.error?.message ?? 'L’ardoise liée n’a pas pu être chargée.'}
          onRetry={detail.refetch}
        />
      </Panel>
    );
  }
  if (detail.isLoading) return <LoadingRows rows={3} />;

  return (
    <div className="grid gap-3.5">
      <Panel
        id="trip-budget-expenses"
        title={`Dépenses · ${formatEuro(detail.total)}`}
        description={`Ardoise « ${ardoiseName} » liée au voyage — chaque ligne : qui a payé, combien, pour qui.`}
        action={
          !readOnly ? (
            <Button icon="plus" onClick={openCreator}>
              Ajouter une dépense
            </Button>
          ) : undefined
        }
      >
        {detail.expenses.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Aucune dépense sur l’ardoise liée"
            description="Ajoutez la première dépense du voyage : montant, payeur, participants."
            actionLabel={readOnly ? undefined : 'Ajouter une dépense'}
            onAction={readOnly ? undefined : openCreator}
          />
        ) : (
          <div role="list" aria-label="Dépenses du voyage" className="grid gap-2.5">
            {detail.expenses.map((expense) => (
              <div key={expense.id} role="listitem" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3.5 py-3">
                <div className="min-w-[150px] flex-1">
                  <p className="m-0 text-[13px] font-[760]">{expense.title}</p>
                  <small className="text-[11px] text-muted">
                    {expense.paidByName} · {expense.participants.length} participant{expense.participants.length > 1 ? 's' : ''}
                  </small>
                </div>
                <strong className="text-[15px]">{formatEuro(expense.amount)}</strong>
                {!readOnly && canEditExpense(expense) ? (
                  <button
                    type="button"
                    onClick={() => openEditor(expense)}
                    aria-label={`Modifier ${expense.title}`}
                    className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                  >
                    <Icon name="edit" size="sm" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        id="trip-budget-pie"
        title="Qui a dépensé quoi"
        description="Part de chaque payeur dans le total avancé, du plus gros au plus petit."
      >
        {paidByMember.length === 0 ? (
          <p className="m-0 text-xs text-muted">Aucune dépense pour le moment.</p>
        ) : (
          <SpendingPie shares={paidByMember} total={detail.total} />
        )}
      </Panel>

      <Panel
        id="trip-budget-settlement"
        title="Répartition"
        description={detail.settlementSource === 'serveur' ? 'Soldes calculés côté serveur.' : 'Calcul automatique à chaque ajout.'}
      >
        <div className="grid gap-[18px]">
          <MemberBalances balances={detail.balances} source={detail.settlementSource} />
          <SettlementsPanel settlements={detail.settlements} />
        </div>
      </Panel>

      {!readOnly ? (
        <TripGuestExpenseForm
          tripId={tripId}
          members={members}
          guests={guests}
          onCreated={() => {
            detail.refetch();
            void queryClient.invalidateQueries({ queryKey: tripBudgetKeys.all });
          }}
        />
      ) : null}

      <ExpenseFormDialog
        open={expenseOpen}
        onOpenChange={(open) => {
          if (!open) setEditingExpense(null);
          setExpenseOpen(open);
        }}
        members={expenseMembers}
        guests={detail.guestOptions}
        defaultPayerId={defaultPayerId}
        initialExpense={editingExpense}
        isPending={addExpense.isPending || updateExpenseMutation.isPending}
        onSubmit={(values) => void submitMemberExpense(values)}
      />
    </div>
  );
}

/**
 * Dépense d'invité (D-04) : visible quand un ticket
 * `eo:trip:ticket:<tripId>` est présent — le ticket EST la credence, transmis
 * à l'Edge seule, jamais en PostgREST. Le payeur est l'invité porteur (résolu
 * en base) ; les parts mêlent membres et invités (dual 0064).
 */
function TripGuestExpenseForm({
  tripId,
  members,
  guests,
  onCreated,
}: {
  tripId: string;
  members: HouseholdMemberRow[];
  guests: TripGuestRow[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [ticket] = useState(() => readTripTicket(tripId));
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (!ticket) return null;

  const toggle = (current: string[], id: string, set: (next: string[]) => void) => {
    set(current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  };

  const submit = async () => {
    const parsed = Number(amount.replace(',', '.'));
    const sharers = selectedMembers.length + selectedGuests.length;
    if (saving || title.trim() === '' || !(parsed > 0) || sharers === 0) return;
    const share = Math.round((parsed / sharers) * 100) / 100;
    const parts: TripGuestExpensePart[] = [
      ...selectedMembers.map((memberId) => ({ participantType: 'membre' as const, memberId, shareAmount: share })),
      ...selectedGuests.map((guestId) => ({ participantType: 'guest' as const, guestId, shareAmount: share })),
    ];
    try {
      // Valide le libellé, le montant et les parts avant l'appel réseau.
      toTripGuestExpenseBody({ ticket, title, amount: parsed, parts });
    } catch (validationError) {
      toast(validationError instanceof Error ? validationError.message : 'Dépense impossible.', 'error');
      return;
    }
    setSaving(true);
    try {
      await createTripGuestExpense({ ticket, title, amount: parsed, parts });
      setTitle('');
      setAmount('');
      setSelectedMembers([]);
      setSelectedGuests([]);
      onCreated();
      toast('Dépense d’invité ajoutée.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'Dépense impossible.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      id="trip-budget-guest"
      title="Dépense d’invité"
      description="Vous visitez avec un code : votre dépense part sur l’ardoise liée, payée par vous."
    >
      <div className="grid gap-3.5">
        <Field label="Libellé">
          {(props) => (
            <Input {...props} value={title} onChange={(change) => setTitle(change.target.value)} maxLength={200} placeholder="Courses au marché" />
          )}
        </Field>
        <Field label="Montant (€)">
          {(props) => (
            <Input {...props} inputMode="decimal" value={amount} onChange={(change) => setAmount(change.target.value)} placeholder="24,50" />
          )}
        </Field>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-[12px] font-semibold text-muted">Partagé entre (membres et invités)</legend>
          <div className="flex flex-wrap gap-1.5">
            {members
              .filter((member) => member.role !== 'enfant')
              .map((member) => (
                <label key={member.id} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(member.id)}
                    onChange={() => toggle(selectedMembers, member.id, setSelectedMembers)}
                    className="accent-accent"
                    aria-label={`Partager avec ${member.display_name}`}
                  />
                  {member.display_name}
                </label>
              ))}
            {guests.map((guest) => (
              <label key={guest.id} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong">
                <input
                  type="checkbox"
                  checked={selectedGuests.includes(guest.id)}
                  onChange={() => toggle(selectedGuests, guest.id, setSelectedGuests)}
                  className="accent-accent"
                  aria-label={`Partager avec ${guest.display_name}`}
                />
                {guest.display_name} (invité)
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Button
            icon="plus"
            disabled={saving || title.trim() === '' || !(Number(amount.replace(',', '.')) > 0) || selectedMembers.length + selectedGuests.length === 0}
            onClick={() => void submit()}
          >
            {saving ? 'Ajout…' : 'Ajouter comme invité'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
