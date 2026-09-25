import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { moduleMap, type ModuleKey } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { Icon } from './icon';

export interface ModuleHeaderProps {
  module: ModuleKey;
  actions?: ReactNode;
  title?: string;
  description?: string;
  kicker?: string;
  className?: string;
}

/** En-tête de module : retour, sur-titre, titre, accroche et actions. */
export function ModuleHeader({ module, actions, title, description, kicker, className }: ModuleHeaderProps) {
  const navigate = useNavigate();
  const entry = moduleMap[module];
  return (
    <div className={cn('mb-7 flex items-start justify-between gap-5 max-[650px]:block', className)}>
      <div>
        <Button variant="quiet" size="sm" icon="arrowLeft" onClick={() => navigate('/')} className="mb-3 -ml-2">
          Retour à la maison
        </Button>
        <p className="eyebrow mb-2">{kicker ?? entry?.kicker ?? 'Espace du foyer'}</p>
        <h1 className="mb-2 text-[length:var(--text-module)] leading-[1.06]">{title ?? entry?.label ?? 'Espace'}</h1>
        <p className="lede mb-0 max-w-[620px] text-[15px]">{description ?? entry?.detail ?? ''}</p>
      </div>
      {actions ? <div className="flex flex-wrap justify-end gap-2 max-[650px]:mt-4 max-[650px]:justify-start">{actions}</div> : null}
    </div>
  );
}

export function ModuleShell({ module, children, actions }: { module: ModuleKey; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[1180px]" data-module={module}>
      <ModuleHeader module={module} actions={actions} />
      {children}
    </section>
  );
}

export interface PanelProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Panel({ title, description, action, children, className, id }: PanelProps) {
  return (
    // `min-w-0` : une carte peut toujours rétrécir sous la largeur de sa colonne
    // de grille, sinon son contenu le plus large ferait déborder la page.
    <section id={id} className={cn('panel-surface min-w-0 rounded-[16px] p-[19px]', className)}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 max-[650px]:flex-col max-[650px]:gap-2.5">
          <div>
            {title ? <h3 className="mb-0.5 font-display text-lg tracking-[-0.035em]">{title}</h3> : null}
            {description ? <p className="m-0 text-xs text-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface MetricItem {
  label: string;
  value: string | number;
  caption: string;
}

export function MetricRow({ items, className }: { items: MetricItem[]; className?: string }) {
  return (
    <div className={cn('mb-5 grid grid-cols-4 gap-3 max-[650px]:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-[16px] border border-border bg-surface px-4 py-[15px]">
          <p className="eyebrow mb-1">{item.label}</p>
          <strong className="block font-display text-2xl tracking-[-0.05em] max-[650px]:text-[21px]">{item.value}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{item.caption}</small>
        </div>
      ))}
    </div>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-4">
      <div>
        <h2 className="mb-0 font-display text-[length:var(--text-section)] tracking-[-0.035em]">{title}</h2>
        {description ? <p className="m-0 text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CountBadge({ value, label }: { value: number | string; label?: string }) {
  return (
    <span className="inline-grid h-6 min-w-7 place-items-center rounded-full bg-accent-soft px-2 text-[11px] font-extrabold text-accent-strong">
      {value}
      {label ? <span className="sr-only"> {label}</span> : null}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: 'haute' | 'normale' | 'basse' }) {
  const map = {
    haute: { label: 'Haute', className: 'bg-coral-soft text-coral' },
    normale: { label: 'Normale', className: 'bg-amber-soft text-[oklch(52%_0.11_78)]' },
    basse: { label: 'Basse', className: 'bg-bg text-muted' },
  } as const;
  const entry = map[priority];
  return <span className={cn('inline-flex min-h-[25px] items-center rounded-full px-2 text-[10px] font-extrabold', entry.className)}>{entry.label}</span>;
}

export function MemberBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] text-muted', className)}>
      <Icon name="user" size="sm" />
      {name}
    </span>
  );
}
