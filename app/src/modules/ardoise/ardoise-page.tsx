import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { CountBadge, MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { formatEuro, pluralize, relativeDayLabel } from '@/lib/utils';
import { useAddExpense, useArdoise, useDeleteExpense, useSendInvitation } from './hooks/use-ardoise';
import type { Expense, NewExpenseInput } from './types';
import { BalanceCard, MemberBalances } from './components/balance-panel';
import { SettlementsPanel } from './components/settlements-panel';
import { ExpenseFormDialog } from './components/expense-form-dialog';
import { InviteMemberDialog } from './components/invite-member-dialog';

const rowAction =
  'grid size-[31px] shrink-0 place-items-center rounded-[9px] bg-transparent text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg';

export default function ArdoisePage() {
  const {
    expenses,
    balances,
    settlements,
    sharingMembers,
    externalParticipants,
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
  const deleteExpense = useDeleteExpense();
  const sendInvitation = useSendInvitation();
  const toast = useToast();

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<Expense | null>(null);

  const handleAddExpense = async (values: NewExpenseInput) => {
    try {
      await addExpense.mutateAsync(values);
      setExpenseDialogOpen(false);
      toast('Dépense ajoutée, les soldes sont à jour.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'Dépense impossible.', 'error');
    }
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
        <Button icon="plus" onClick={() => setExpenseDialogOpen(true)}>
          Ajouter une dépense
        </Button>
      }
    >
      <BalanceCard
        total={total}
        monthLabel={monthLabel}
        onAddExpense={() => setExpenseDialogOpen(true)}
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
          ) : (
            <div className="scrollbar-slim w-full max-w-full overflow-x-auto">
              {/* Colonnes fixes : le tableau se resserre jusqu'à 360px sans
                  jamais faire déborder la page horizontalement. */}
              <table className="w-full table-fixed border-collapse [&>th]:px-1 [&>td]:px-1 sm:[&>th]:px-0 sm:[&>td]:px-0">
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
          <MemberBalances balances={balances} />
          <SettlementsPanel settlements={settlements} className="mt-[18px]" />
        </div>
      </div>

      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        members={sharingMembers}
        externalParticipants={externalParticipants}
        defaultPayerId={currentMember?.id ?? null}
        onSubmit={handleAddExpense}
        isPending={addExpense.isPending}
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
