import { Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { formatEuro } from '@/lib/utils';
import type { Settlement } from '../types';

export interface SettlementsPanelProps {
  settlements: Settlement[];
  className?: string;
}

/**
 * Compensation proposée : l'algorithme glouton sert d'abord les plus gros
 * créanciers, ce qui réduit le nombre de versements pour l'ensemble du foyer.
 */
export function SettlementsPanel({ settlements, className }: SettlementsPanelProps) {
  const toast = useToast();

  const copy = async (settlement: Settlement) => {
    const line = `${settlement.fromName} → ${settlement.toName} : ${formatEuro(settlement.amount)}`;
    try {
      await navigator.clipboard?.writeText(line);
      toast('Règlement copié dans le presse-papiers.');
    } catch {
      toast('Copie impossible dans ce navigateur.', 'error');
    }
  };

  return (
    <Panel
      title="Simplifier les dettes"
      description="Le moins de versements possible pour tout régler."
      className={className}
    >
      {settlements.length === 0 ? (
        <p className="m-0 text-xs text-muted">Tout est à jour : personne ne doit rien à personne.</p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {settlements.map((settlement) => (
            <li
              key={settlement.id}
              className="flex min-w-0 items-center justify-between gap-2 border-t border-border py-[11px] text-xs first-of-type:border-t-0"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <Icon name="arrow" size="sm" className="shrink-0 text-muted" />
                <span className="min-w-0 truncate">
                  {`${settlement.fromName} → ${settlement.toName} : ${formatEuro(settlement.amount)}`}
                </span>
              </span>
              <button
                type="button"
                className="grid size-[31px] shrink-0 place-items-center rounded-[9px] bg-transparent text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
                aria-label={`Copier le règlement : ${settlement.fromName} vers ${settlement.toName}`}
                onClick={() => void copy(settlement)}
              >
                <Icon name="copy" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
