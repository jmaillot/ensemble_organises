import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { CountBadge, MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { formatEuro, pluralize, relativeDayLabel } from '@/lib/utils';
import { useIsMobileLayout } from '@/hooks/use-mobile-layout';
import { useSessionUser } from '@/hooks/use-auth';
import { useMembers } from '@/stores/household-store';
import { useAddExpense, useArdoise, useDeleteExpense, useSendInvitation, useUpdateExpense } from './hooks/use-ardoise';
import type { Expense, NewExpenseInput } from './types';
import { BalanceCard, MemberBalances } from './components/balance-panel';
import { SettlementsPanel } from './components/settlements-panel';
import { ExpenseFormDialog } from './components/expense-form-dialog';
import { InviteMemberDialog } from './components/invite-member-dialog';

const rowAction =
  'grid size-11 shrink-0 place-items-center rounded-[9px] bg-transparent text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg';

export default function ArdoisePage() {
  const {
    expenses,
    balances,
    settlements,
    settlementSource,
    sharingMembers,
    currentMember,
    total,
    monthTotal,
    monthLabel,
    averageTicket,
    isLoading,
    isError,
    error,
    refetch,
  } = useArdoise();
  const addExpense = useAddExpense();
  const updateExpenseMutation = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const sendInvitation = useSendInvitation();
  const toast = useToast();
  const sessionUser = useSessionUser();
  const members = useMembers();

  // Payeur par défaut : le membre lié à la session, pas le profil courant
  // (un parent peut saisir au nom d'un enfant). Repli : profil courant.
  const selfMemberId = sessionUser ? (members.find((member) => member.user_id === sessionUser.id)?.id ?? null) : null;

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<Expense | null>(null);
  // Une seule variante est montée : tableau sur bureau, cartes empilées sur
  // mobile. Aucun scroll horizontal, même interne.
  const isMobileLayout = useIsMobileLayout();

  const handleAddExpense = async (values: NewExpenseInput) => {
    // Même dialogue en création et en édition : la cible distingue les deux.
    if (editingExpense) {
      try {
        await updateExpenseMutation.mutateAsync({ expenseId: editingExpense.id, input: values });
        setExpenseDialogOpen(false);
        setEditingExpense(null);
        toast('Dépense mise à jour, les soldes sont à jour.');
      } catch (updateError) {
        toast(updateError instanceof Error ? updateError.message : 'Modification impossible.', 'error');
      }
      return;
    }
    try {
      await addExpense.mutateAsync(values);
      setExpenseDialogOpen(false);
      toast('Dépense ajoutée, les soldes sont à jour.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'Dépense impossible.', 'error');
    }
  };

  const openCreator = () => {
    setEditingExpense(null);
    setExpenseDialogOpen(true);
  };

  const openEditor = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseDialogOpen(true);
  };

  const handleDeleteExpense = async () => {
    if (!pendingDeletion) return;
    const title = pendingDeletion.title;
    setPendingDeletion(null);
    try {
      await deleteExpense.mutateAsync(pendingDeletion.id);
      toast(`« ${title} » a été supprimée.`);
    } catch {
      toast('Suppression impossible.', 'error');
    }
  };

  const memberCount = balances.filter((balance) => balance.kind === 'membre').length;

  return (
    <ModuleShell
      module="ardoise"
      actions={
        <Button icon="plus" onClick={openCreator}>
          Ajouter une dépense
        </Button>
      }
    >
      <BalanceCard
        total={total}
        monthLabel={monthLabel}
        onAddExpense={openCreator}
        onInvite={() => setInviteDialogOpen(true)}
      />

      <MetricRow
        items={[
          { label: 'Total du mois', value: formatEuro(monthTotal), caption: 'dépenses du foyer' },
          { label: 'Dépenses', value: expenses.length, caption: 'lignes enregistrées' },
          { label: 'Membres', value: memberCount, caption: 'à l’ardoise' },
          { label: 'Ticket moyen', value: formatEuro(averageTicket), caption: 'par dépense' },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] items-start gap-[18px] max-[920px]:grid-cols-1 [&>*]:min-w-0">
        <Panel
          id="expense-list-panel"
          title="Dernières dépenses"
          description="Chaque ligne sait qui doit quoi à qui."
          action={<CountBadge value={expenses.length} label="dépenses" />}
        >
          {isLoading ? (
            <LoadingRows rows={4} />
          ) : isError ? (
            <ErrorState message={error?.message ?? 'Les dépenses sont inaccessibles.'} onRetry={refetch} />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="Aucune dépense pour le moment"
              description="Ajoutez la première facture : le partage et les soldes se calculent automatiquement."
              actionLabel="Ajouter une dépense"
              onAction={() => setExpenseDialogOpen(true)}
            />
          ) : isMobileLayout ? (
            /* Mobile : cartes empilées, aucun scroll horizontal. */
            <ul className="m-0 grid list-none gap-2.5 p-0" aria-label="Dépenses du foyer">
              {expenses.map((expense) => (
                <li key={expense.id} className="min-w-0 rounded-[13px] border border-border bg-bg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-[13px]">{expense.title}</strong>
                      <small className="block text-[10px] text-muted">
                        {relativeDayLabel(expense.date)} · Payé par {expense.paidByName}
                      </small>
                    </div>
                    <strong className="shrink-0 font-display text-[15px]">{formatEuro(expense.amount)}</strong>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center">
                      {expense.participants.slice(0, 5).map((participant) => (
                        <MemberAvatar
                          key={participant.key}
                          name={participant.name}
                          colorTag={participant.colorTag}
                          size="sm"
                          className="-ml-[5px] border-2 border-surface first:ml-0"
                        />
                      ))}
                      {expense.participants.length > 5 ? (
                        <span
                          aria-hidden="true"
                          className="-ml-[5px] grid size-[23px] shrink-0 place-items-center rounded-[8px] border-2 border-surface bg-bg text-[9px] font-extrabold text-muted"
                        >
                          +{expense.participants.length - 5}
                        </span>
                      ) : null}
                      <span className="sr-only">{pluralize(expense.participants.length, 'participant')}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className={rowAction}
                        aria-label={`Modifier la dépense ${expense.title}`}
                        onClick={() => openEditor(expense)}
                      >
                        <span className="sr-only">Modifier</span>
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        className={`${rowAction} hover:bg-coral-soft hover:text-coral max-[650px]:size-11`}
                        aria-label={`Supprimer la dépense ${expense.title}`}
                        onClick={() => setPendingDeletion(expense)}
                      >
                        <span className="sr-only">Supprimer</span>
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            /* Bureau : tableau complet avec scroll interne si besoin. */
            <div className="scrollbar-slim w-full max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[680px] table-auto border-collapse [&>th]:px-1 [&>td]:px-1 sm:[&>th]:px-0 sm:[&>td]:px-0">
                <caption className="sr-only">Dépenses du foyer, payeur, participants et montant</caption>
                <thead>
                  <tr className="[&>th]:border-t [&>th]:border-border [&>th]:py-3 [&>th]:text-left [&>th]:text-[10px] [&>th]:font-extrabold [&>th]:tracking-[0.08em] [&>th]:uppercase [&>th]:text-muted [&>th:last-child]:text-right">
                    <th scope="col">Dépense</th>
                    <th scope="col">Payé par</th>
                    <th scope="col">Partage</th>
                    <th scope="col">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="[&>td]:border-t [&>td]:border-border [&>td]:py-3 [&>td]:text-left [&>td]:text-xs [&>td:last-child]:text-right"
                    >
                      <td>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <strong className="block truncate font-bold">{expense.title}</strong>
                            <small className="block text-[10px] text-muted">{relativeDayLabel(expense.date)}</small>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              className={rowAction}
                              aria-label={`Modifier la dépense ${expense.title}`}
                              onClick={() => openEditor(expense)}
                            >
                              <span className="sr-only">Modifier</span>
                              <Icon name="edit" size="sm" />
                            </button>
                            <button
                              type="button"
                              className={`${rowAction} hover:bg-coral-soft hover:text-coral`}
                              aria-label={`Supprimer la dépense ${expense.title}`}
                              onClick={() => setPendingDeletion(expense)}
                            >
                              <span className="sr-only">Supprimer</span>
                              <Icon name="trash" size="sm" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td>{expense.paidByName}</td>
                      <td>
                        <div className="flex items-center">
                          {expense.participants.slice(0, 5).map((participant) => (
                            <MemberAvatar
                              key={participant.key}
                              name={participant.name}
                              colorTag={participant.colorTag}
                              size="sm"
                              className="-ml-[5px] border-2 border-surface first:ml-0"
                            />
                          ))}
                          {expense.participants.length > 5 ? (
                            <span
                              aria-hidden="true"
                              className="-ml-[5px] grid size-[23px] shrink-0 place-items-center rounded-[8px] border-2 border-surface bg-bg text-[9px] font-extrabold text-muted"
                            >
                              +{expense.participants.length - 5}
                            </span>
                          ) : null}
                          <span className="sr-only">
                            {pluralize(expense.participants.length, 'participant')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{formatEuro(expense.amount)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div>
          <MemberBalances balances={balances} source={settlementSource} />
          <SettlementsPanel settlements={settlements} className="mt-[18px]" />
        </div>
      </div>

      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) setEditingExpense(null);
        }}
        members={sharingMembers}
        defaultPayerId={
          selfMemberId && sharingMembers.some((member) => member.id === selfMemberId)
            ? selfMemberId
            : (currentMember?.id ?? null)
        }
        onSubmit={handleAddExpense}
        isPending={addExpense.isPending || updateExpenseMutation.isPending}
        initialExpense={editingExpense}
      />

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSubmit={(values) => sendInvitation.mutateAsync(values)}
        isPending={sendInvitation.isPending}
      />

      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        title={pendingDeletion ? `Supprimer « ${pendingDeletion.title} »` : 'Supprimer la dépense'}
        description="Les parts de cette dépense seront également supprimées et les soldes recalculés."
        confirmLabel="Supprimer"
        onConfirm={() => void handleDeleteExpense()}
      />
    </ModuleShell>
  );
}
