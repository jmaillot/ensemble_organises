import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { CountBadge, MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { depositHouseholdFile } from '@/lib/storage';
import { formatEuro } from '@/lib/utils';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { useSessionUser } from '@/hooks/use-auth';
import {
  useAddExpense,
  useArdoiseDetail,
  useDeleteExpense,
  useUpdateExpense,
} from './hooks/use-ardoise';
import {
  createInviteCode,
  fetchInviteSummary,
  revokeInviteCode,
  updateArdoise,
  type ArdoiseCodeSummary,
} from './api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ardoiseKeys } from './hooks/use-settlement';
import { BalanceCard, MemberBalances } from './components/balance-panel';
import { SettlementsPanel } from './components/settlements-panel';
import { ArdoiseMembersDialog } from './components/ardoise-members-dialog';
import { ExpenseFormDialog } from './components/expense-form-dialog';
import { computeSpent, type Expense, type NewExpenseInput, type Share } from './types';

/** Remplissage SVG d'une part : palette membre, gris décliné pour les invités. */
const TAG_FILL: Record<string, string> = {
  accent: 'var(--color-accent)',
  ink: 'var(--color-fg)',
  coral: 'var(--color-coral)',
  amber: 'var(--color-amber)',
  violet: 'oklch(55% 0.13 300)',
};

const GUEST_FILLS = [
  'var(--color-muted)',
  'color-mix(in oklch, var(--color-muted) 60%, transparent)',
  'color-mix(in oklch, var(--color-muted) 35%, var(--color-surface))',
  'var(--color-fg)',
];

function pieFill(share: Share, index: number): string {
  if (share.kind === 'membre' && share.colorTag && TAG_FILL[share.colorTag]) return TAG_FILL[share.colorTag];
  return GUEST_FILLS[index % GUEST_FILLS.length];
}

/**
 * Camembert des dépensés par payeur (SVG maison, sans dépendance).
 * Donut + légende pastille + tableau `sr-only` de repli a11y.
 */
function SpendingPie({ shares, total }: { shares: Share[]; total: number }) {
  if (shares.length === 0 || total <= 0) return null;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = shares.map((share, index) => {
    const fraction = share.amount / total;
    const length = fraction * circumference;
    const segment = { share, fill: pieFill(share, index), dashOffset: -offset, length };
    offset += length;
    return segment;
  });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          role="img"
          aria-label={`Qui a dépensé quoi : ${shares.map((share) => `${share.name} ${formatEuro(share.amount)}`).join(', ')}`}
          data-testid="spending-pie"
        >
          <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-bg)" strokeWidth="22" />
          {segments.map((segment) => (
            <circle
              key={segment.share.key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.fill}
              strokeWidth="22"
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={segment.dashOffset}
              transform="rotate(-90 60 60)"
            />
          ))}
        </svg>
        <ul className="grid min-w-[180px] flex-1 gap-1.5" aria-label="Dépensés par payeur">
          {shares.map((share, index) => (
            <li key={share.key} className="flex items-center gap-2 text-[12px]">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: pieFill(share, index) }}
              />
              <span className="min-w-0 flex-1 truncate font-semibold">{share.name}</span>
              <span className="tabular-nums text-muted">
                {formatEuro(share.amount)} · {Math.round((share.amount / total) * 100)} %
              </span>
            </li>
          ))}
        </ul>
      </div>
      <table className="sr-only">
        <tbody>
          {shares.map((share) => (
            <tr key={share.key}>
              <th scope="row">{share.name}</th>
              <td>{formatEuro(share.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DetailTab = 'depenses' | 'repartition' | 'parametres';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'depenses', label: 'Dépenses' },
  { value: 'repartition', label: 'Répartition' },
  { value: 'parametres', label: 'Paramètres' },
];

/** Détail d'une ardoise : dépenses, répartition, paramètres + partage par code. */
export default function ArdoiseDetailPage() {
  const { id } = useParams();
  const ardoiseId = id ?? null;
  const navigate = useNavigate();
  const toast = useToast();
  const {
    ardoise,
    expenses,
    balances,
    settlements,
    settlementSource,
    sharingMembers,
    guestOptions,
    currentMember,
    total,
    monthTotal,
    monthLabel,
    averageTicket,
    isLoading,
    isError,
    error,
    refetch,
  } = useArdoiseDetail(ardoiseId);
  const addExpense = useAddExpense(ardoiseId ?? '');
  const updateExpenseMutation = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const openCreator = () => {
    setEditingExpense(null);
    setExpenseDialogOpen(true);
  };

  const [tab, setTab] = useState<DetailTab>('depenses');
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<Expense | null>(null);

  const openEditor = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseDialogOpen(true);
  };

  const sessionMemberId = useSessionMemberId();
  const defaultPayerId = sessionMemberId ?? sharingMembers[0]?.id ?? null;

  const paidByMember = useMemo(() => computeSpent(expenses), [expenses]);

  const handleSubmitExpense = async (values: NewExpenseInput) => {
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

  if (!ardoiseId) {
    return (
      <ModuleShell module="ardoise">
        <ErrorState message="Ardoise introuvable." onRetry={() => navigate('/ardoise')} />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      module="ardoise"
      actions={
        <>
          <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/ardoise')}>
            Ardoises
          </Button>
          {tab === 'depenses' ? (
            <Button
              icon="plus"
              onClick={openCreator}
            >
              Ajouter une dépense
            </Button>
          ) : null}
        </>
      }
    >
      <MetricRow
        items={[
          { label: 'Total dépensé', value: formatEuro(total), caption: ardoise?.name ?? 'ardoise' },
          { label: 'Ce mois', value: formatEuro(monthTotal), caption: monthLabel },
          { label: 'Ticket moyen', value: formatEuro(averageTicket), caption: `${expenses.length} dépenses` },
          { label: 'Participants', value: balances.length, caption: settlementSource === 'serveur' ? 'soldes serveur' : 'calcul local' },
        ]}
      />

      <BalanceCard
        total={total}
        monthLabel={ardoise?.name ?? monthLabel}
        onAddExpense={openCreator}
        onInvite={() => setMembersOpen(true)}
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Onglets de l’ardoise">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={
              tab === option.value
                ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
                : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState message={error?.message ?? 'L’ardoise n’a pas pu être chargée.'} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : tab === 'depenses' ? (
        <div className="grid gap-[18px]">
          <Panel
            id="ardoise-total-panel"
            title={`Total : ${formatEuro(total)}`}
            description="Qui a avancé quoi sur cette ardoise."
            action={<CountBadge value={expenses.length} label="dépenses" />}
          >
            {paidByMember.length === 0 ? (
              <p className="m-0 text-xs text-muted">Aucune dépense pour le moment.</p>
            ) : (
              <div className="grid gap-2" role="list" aria-label="Avances par participant">
                {paidByMember.map((entry) => (
                  <div key={entry.key} role="listitem" className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <strong>{entry.name}</strong>
                      <span>{formatEuro(entry.amount)}</span>
                    </div>
                    <div
                      className="h-[7px] overflow-hidden rounded-full bg-bg"
                      role="img"
                      aria-label={`${entry.name} : ${formatEuro(entry.amount)} sur ${formatEuro(total)}`}
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${total > 0 ? Math.max(2, Math.round((entry.amount / total) * 100)) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            id="ardoise-expenses-panel"
            title="Dépenses"
            description="Chaque ligne : qui a payé, combien, pour qui."
          >
            {expenses.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="Aucune dépense ici"
                description="Ajoutez la première dépense de cette ardoise : montant, payeur, participants."
                actionLabel="Ajouter une dépense"
                onAction={() => {
                  setEditingExpense(null);
                  setExpenseDialogOpen(true);
                }}
              />
            ) : (
              <div role="list" aria-label="Dépenses de l’ardoise" className="grid gap-2.5">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    role="listitem"
                    className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3.5 py-3"
                  >
                    <div className="min-w-[150px] flex-1">
                      <p className="m-0 text-[13px] font-[760]">{expense.title}</p>
                      <small className="text-[11px] text-muted">
                        {expense.paidByName} · {expense.participants.length} participant{expense.participants.length > 1 ? 's' : ''}
                      </small>
                    </div>
                    <strong className="text-[15px]">{formatEuro(expense.amount)}</strong>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditor(expense)}
                        aria-label={`Modifier ${expense.title}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeletion(expense)}
                        aria-label={`Supprimer ${expense.title}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : tab === 'repartition' ? (
        <div className="grid gap-[18px]">
          <Panel
            id="ardoise-spending-panel"
            title="Qui a dépensé quoi"
            description="Part de chaque payeur dans le total avancé, du plus gros au plus petit."
          >
            {paidByMember.length === 0 ? (
              <p className="m-0 text-xs text-muted">Aucune dépense pour le moment.</p>
            ) : (
              <SpendingPie shares={paidByMember} total={total} />
            )}
          </Panel>
          <MemberBalances balances={balances} source={settlementSource} />
          <SettlementsPanel settlements={settlements} />
        </div>
      ) : (
        <ArdoiseSettings ardoiseId={ardoiseId} />
      )}

      <ArdoiseMembersDialog
        ardoiseId={ardoiseId}
        ardoiseName={ardoise?.name ?? 'ardoise'}
        open={membersOpen}
        onOpenChange={setMembersOpen}
        canManage={currentMember?.role === 'admin'}
      />

      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingExpense(null);
          setExpenseDialogOpen(open);
        }}
        members={sharingMembers}
        guests={guestOptions}
        defaultPayerId={defaultPayerId}
        initialExpense={editingExpense}
        isPending={addExpense.isPending || updateExpenseMutation.isPending}
        onSubmit={(values) => void handleSubmitExpense(values)}
      />

      <ConfirmDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        title={`Supprimer « ${pendingDeletion?.title ?? ''} » ?`}
        description="La dépense et ses parts seront retirées de l’ardoise."
        confirmLabel="Supprimer la dépense"
        onConfirm={() => {
          const target = pendingDeletion;
          setPendingDeletion(null);
          if (!target) return;
          void deleteExpense
            .mutateAsync(target.id)
            .then(() => toast('Dépense supprimée.'))
            .catch(() => toast('Suppression impossible.', 'error'));
        }}
      />
    </ModuleShell>
  );
}

function useSessionMemberId(): string | null {
  const members = useMembers();
  const sessionUser = useSessionUser();
  const sessionUserId = sessionUser?.id ?? null;
  if (!sessionUserId) return members[0]?.id ?? null;
  return members.find((member) => member.user_id === sessionUserId)?.id ?? members[0]?.id ?? null;
}

function ArdoiseSettings({ ardoiseId }: { ardoiseId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { ardoise, refetch } = useArdoiseDetail(ardoiseId);
  const householdId = useHouseholdStore((state) => state.householdId);
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Le serveur ne conserve que l'empreinte du code : le brut n'est rendu
  // qu'à sa création. On le mémorise ici pour le réafficher après navigation ;
  // un code actif créé ailleurs reste invisible jusqu'à régénération.
  const codeKey = `eo:ardoise-code:${ardoiseId}`;
  const [lastCode, setLastCode] = useState<string | null>(() => {
    try {
      return localStorage.getItem(codeKey);
    } catch {
      return null;
    }
  });
  const rememberCode = (code: string | null) => {
    setLastCode(code);
    try {
      if (code === null) localStorage.removeItem(codeKey);
      else localStorage.setItem(codeKey, code);
    } catch {
      // Stockage indisponible (navigation privée) : l'affichage en mémoire suffit.
    }
  };

  const summaryQuery = useQuery({
    queryKey: ['ardoise', 'invite-summary', ardoiseId],
    queryFn: () => fetchInviteSummary(ardoiseId),
  });
  const summary = (summaryQuery.data ?? null) as ArdoiseCodeSummary | null;

  // Code arrêté depuis un autre appareil : le cache local est périmé, on le purge.
  useEffect(() => {
    if (summaryQuery.isSuccess && !summary?.hasCode && lastCode !== null) rememberCode(null);
  }, [summaryQuery.isSuccess, summary?.hasCode, lastCode]);

  const currentName = name ?? ardoise?.name ?? '';
  const currentDescription = description ?? ardoise?.description ?? '';

  const save = () => {
    if (currentName.trim() === '') {
      toast('Nommez votre ardoise.', 'error');
      return;
    }
    setIsSaving(true);
    void (async () => {
      let coverUrl = ardoise?.cover_url ?? null;
      if (coverFile) {
        if (!householdId) throw new Error('Aucun foyer sélectionné.');
        const deposited = await depositHouseholdFile({ householdId, folder: 'ardoises', file: coverFile });
        coverUrl = deposited.url;
      }
      await updateArdoise(ardoiseId, {
        name: currentName.trim(),
        description: currentDescription.trim() === '' ? null : currentDescription.trim(),
        cover_url: coverUrl,
      });
      setCoverFile(null);
      await queryClient.invalidateQueries({ queryKey: ardoiseKeys.all });
      refetch();
      toast('Ardoise mise à jour.');
    })()
      .catch((saveError: unknown) =>
        toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error'),
      )
      .finally(() => setIsSaving(false));
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Code copié.');
    } catch {
      toast(code, undefined);
    }
  };

  const shareCode = async (code: string) => {
    const inviteUrl = `${window.location.origin}/invitation/ardoise?code=${encodeURIComponent(code)}`;
    const shareData = {
      title: ardoise?.name ?? 'Ardoise',
      text: `Rejoins mon ardoise « ${ardoise?.name ?? ''} » sans compte, en lecture : ${inviteUrl}`,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // Partage annulé : repli copie ci-dessous.
    }
    await copyCode(code);
  };

  return (
    <div className="grid gap-[18px]">
      <Panel id="ardoise-settings-panel" title="Paramètres" description="Nom, description et photo de couverture.">
        {ardoise?.cover_url ? (
          <img src={ardoise.cover_url} alt={`Couverture de ${ardoise.name}`} className="mb-3 h-36 w-full rounded-[12px] object-cover" />
        ) : null}
        <div className="grid gap-3.5">
          <Field label="Nom de l’ardoise">
            {(props) => (
              <Input {...props} value={currentName} onChange={(change) => setName(change.target.value)} maxLength={120} />
            )}
          </Field>
          <Field label="Description" optional>
            {(props) => (
              <Textarea {...props} value={currentDescription} onChange={(change) => setDescription(change.target.value)} rows={2} />
            )}
          </Field>
          <Field label="Photo de couverture" optional>
            {(props) => (
              <Input
                {...props}
                type="file"
                accept="image/*"
                onChange={(change) => setCoverFile(change.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          <div>
            <Button icon="arrow" disabled={isSaving} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        id="ardoise-share-panel"
        title="Code de partage"
        description="Un code par ardoise, comme le token du foyer. L’arrêt coupe le code, pas l’historique."
        action={<CountBadge value={summary?.useCount ?? 0} label="utilisations" />}
      >
        {summaryQuery.isLoading ? (
          <LoadingRows rows={1} />
        ) : (
          <div className="grid gap-3">
            <p className="m-0 text-[12px] text-muted" role="status">
              {summary?.hasCode
                ? `Partage ${summary.isActive ? 'actif' : 'coupé'} · ${summary.useCount}${summary.maxUses ? `/${summary.maxUses}` : ''} utilisations${summary.expiresAt ? ` · expire le ${summary.expiresAt.slice(0, 10)}` : ''}.`
                : 'Aucun code actif. Générez-en un pour inviter.'}
            </p>
            {lastCode ? (
              <p className="m-0 rounded-[11px] bg-bg px-3 py-2.5 font-mono text-[13px] break-all" role="status">
                {lastCode}
              </p>
            ) : summary?.hasCode ? (
              <p className="m-0 text-[12px] text-muted">
                Code actif créé ailleurs : régénérez pour l’afficher sur cet appareil.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="plus"
                onClick={() => {
                  void createInviteCode(ardoiseId)
                    .then((created) => {
                      rememberCode(created.code);
                      summaryQuery.refetch();
                      toast('Nouveau code généré : l’ancien est invalidé.');
                    })
                    .catch((inviteError: unknown) =>
                      toast(inviteError instanceof Error ? inviteError.message : 'Code impossible.', 'error'),
                    );
                }}
              >
                {summary?.hasCode ? 'Régénérer' : 'Générer un code'}
              </Button>
              {lastCode ? (
                <>
                  <Button variant="secondary" onClick={() => void copyCode(lastCode)}>
                    Copier
                  </Button>
                  <Button variant="secondary" onClick={() => void shareCode(lastCode)}>
                    Partager
                  </Button>
                </>
              ) : null}
              {summary?.hasCode ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void revokeInviteCode(ardoiseId)
                      .then(() => {
                        rememberCode(null);
                        summaryQuery.refetch();
                        toast('Partage arrêté : le code ne passe plus.');
                      })
                      .catch((inviteError: unknown) =>
                        toast(inviteError instanceof Error ? inviteError.message : 'Arrêt impossible.', 'error'),
                      );
                  }}
                >
                  Arrêter le partage
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
