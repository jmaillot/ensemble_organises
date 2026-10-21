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
  /** Destination du bouton retour (`/accueil` par défaut, p. ex. `/voyages` depuis une fiche). */
  backTo?: string;
  /** Libellé du bouton retour (`Retour à la maison` par défaut). */
  backLabel?: string;
}

/** En-tête de module : retour, sur-titre, titre, accroche et actions. */
export function ModuleHeader({ module, actions, title, description, kicker, className, backTo = '/accueil', backLabel = 'Retour à la maison' }: ModuleHeaderProps) {
  const navigate = useNavigate();
  const entry = moduleMap[module];
  return (
    <div className={cn('mb-8 max-[650px]:mb-5', className)}>
      <div className="flex items-start justify-between gap-6 max-[650px]:block">
        <div className="flex min-w-0 items-start gap-4 max-[650px]:gap-2.5">
          {/* `/` est la page publique de l'authentification, pas le tableau de
              bord : y renvoyer sortait l'utilisateur de l'application. */}
          <Button
            variant="secondary"
            size="icon"
            icon="arrowLeft"
            onClick={() => navigate(backTo)}
            className="mt-1 size-11 rounded-full max-[650px]:mt-0 max-[650px]:size-10"
          >
            <span className="sr-only">{backLabel}</span>
          </Button>
          <div className="min-w-0">
            <p className="eyebrow mb-2 max-[650px]:mb-1">{kicker ?? entry?.kicker ?? 'Espace du foyer'}</p>
            <h1 className="mb-2 text-[length:var(--text-module)] leading-[1.02] font-semibold max-[650px]:mb-0 max-[650px]:text-[30px] max-[650px]:leading-[1.08]">
              {title ?? entry?.label ?? 'Espace'}
            </h1>
            <p className="lede mb-0 max-w-[560px] text-[15px] max-[650px]:hidden">
              {description ?? entry?.detail ?? ''}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 max-[650px]:mt-3 max-[650px]:flex-wrap max-[650px]:justify-start">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ModuleShell({ module, children, actions, backTo, backLabel }: { module: ModuleKey; children: ReactNode; actions?: ReactNode; backTo?: string; backLabel?: string }) {
  return (
    <section className="mx-auto w-full max-w-[1180px]" data-module={module}>
      <ModuleHeader module={module} actions={actions} backTo={backTo} backLabel={backLabel} />
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
  /**
   * En-tête inline sur mobile (G-17-2, D-12) : quand vrai, l'en-tête garde
   * la rangée titre-à-gauche/action-à-droite sous 650px au lieu de
   * s'empiler en colonne. Faux par défaut : rendu strictement identique
   * pour tous les autres consommateurs. Seuls les deux panneaux Étapes
   * (membre + invité) l'activent pour garder le toggle Mode cuisine en
   * haut à droite sur mobile.
   */
  headerInlineOnMobile?: boolean;
}

export function Panel({ title, description, action, children, className, id, headerInlineOnMobile = false }: PanelProps) {
  return (
    // `min-w-0` : une carte peut toujours rétrécir sous la largeur de sa colonne
    // de grille, sinon son contenu le plus large ferait déborder la page.
    <section id={id} className={cn('panel-surface min-w-0 rounded-[24px] p-[22px] max-[650px]:rounded-[20px] max-[650px]:p-[16px]', className)}>
      {title || action ? (
        headerInlineOnMobile ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 max-[650px]:flex-row max-[650px]:gap-2.5">
            <div className="min-w-0 flex-1">
              {title ? <h3 className="mb-0.5 font-display text-lg tracking-[-0.035em]">{title}</h3> : null}
              {description ? <p className="m-0 text-xs text-muted">{description}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 max-[650px]:flex-col max-[650px]:gap-2.5">
            <div>
              {title ? <h3 className="mb-0.5 font-display text-lg tracking-[-0.035em]">{title}</h3> : null}
              {description ? <p className="m-0 text-xs text-muted">{description}</p> : null}
            </div>
            {action}
          </div>
        )
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
        <div key={item.label} className="rounded-[20px] border border-border/70 bg-surface px-5 py-4 shadow-[var(--shadow-sm)] max-[650px]:rounded-[16px] max-[650px]:px-4 max-[650px]:py-3">
          <p className="eyebrow mb-1">{item.label}</p>
          <strong className="block font-display text-[26px] leading-tight font-semibold tracking-[-0.03em] max-[650px]:text-[22px]">{item.value}</strong>
          <small className="mt-0.5 block text-[11.5px] text-muted">{item.caption}</small>
        </div>
      ))}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  stackOnMobile = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  stackOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        'mb-3.5 flex gap-4',
        stackOnMobile
          ? 'flex-col items-start min-[651px]:flex-row min-[651px]:items-end min-[651px]:justify-between'
          : 'items-end justify-between',
      )}
    >
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
    normale: { label: 'Normale', className: 'bg-amber-soft text-[oklch(45%_0.11_78)]' },
    basse: { label: 'Basse', className: 'bg-sand text-muted' },
  } as const;
  const entry = map[priority];
  return <span className={cn('inline-flex min-h-[24px] items-center rounded-full px-2.5 text-[10px] font-extrabold', entry.className)}>{entry.label}</span>;
}

export function MemberBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] text-muted', className)}>
      <Icon name="user" size="sm" />
      {name}
    </span>
  );
}
