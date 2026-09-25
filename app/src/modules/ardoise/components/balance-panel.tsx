import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { Panel } from '@/components/shared/module-shell';
import { memberTagClass } from '@/components/shared/member-avatar';
import { formatEuro } from '@/lib/utils';
import type { Balance } from '../types';

const NBSP = '\u00a0';

export interface BalanceCardProps {
  total: number;
  monthLabel: string;
  onAddExpense: () => void;
  onInvite: () => void;
}

/** Carte sombre d'ouverture : le total de l'ardoise et les deux actions clés. */
export function BalanceCard({ total, monthLabel, onAddExpense, onInvite }: BalanceCardProps) {
  return (
    <div className="mb-[18px] rounded-[22px] bg-fg p-[23px] text-surface">
      <p className="eyebrow mb-2 text-on-dark">{`Ardoise\u00a0· ${monthLabel}`}</p>
      <strong data-testid="balance-total" className="font-display text-[46px] tracking-[-0.06em]">
        {formatEuro(total)}
      </strong>
      <p className="mt-2 mb-0 text-[12px] text-on-dark">
        Répartis automatiquement, selon les membres choisis pour chaque dépense.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button icon="plus" onClick={onAddExpense} className="bg-surface text-fg hover:bg-[oklch(96%_0.01_240)]">
          Ajouter une dépense
        </Button>
        <Button variant="secondary" icon="people" onClick={onInvite} className="border-transparent bg-transparent text-surface hover:bg-[oklch(28%_0.025_240)]">
          Inviter un membre
        </Button>
      </div>
    </div>
  );
}

export interface MemberBalancesProps {
  balances: Balance[];
}

/** Solde signé de chaque participant : ce que le foyer lui doit, ou l'inverse. */
export function MemberBalances({ balances }: MemberBalancesProps) {
  return (
    <Panel title="Qui doit quoi ?" description="Calcul automatique à chaque ajout.">
      <div aria-live="polite">
        {balances.map((balance) => {
          const positive = balance.amount > 0.005;
          const negative = balance.amount < -0.005;
          return (
            <div
              key={balance.key}
              data-testid={`balance-row-${balance.key}`}
              className="flex items-center justify-between gap-2 border-t border-border py-[7px] text-xs first-of-type:border-t-0"
            >
              <span className="flex items-center gap-2">
                <i
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${balance.colorTag ? memberTagClass(balance.colorTag) : 'bg-muted'}`}
                />
                {balance.name}
                {balance.kind === 'externe' ? <Badge tone="muted">externe</Badge> : null}
              </span>
              <strong
                className={
                  positive ? 'text-accent-strong' : negative ? 'text-coral' : 'text-muted'
                }
              >
                {positive ? `+${formatEuro(balance.amount)}` : formatEuro(balance.amount)}
              </strong>
            </div>
          );
        })}
        <p className="mt-3 mb-0 text-[11px] text-muted">
          {`+${NBSP}: le foyer vous doit\u00a0· −${NBSP}: vous devez au foyer`}
        </p>
      </div>
    </Panel>
  );
}
