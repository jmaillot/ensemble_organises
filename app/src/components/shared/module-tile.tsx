import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { assetUrl, type ModuleEntry } from '@/lib/modules';
import { Icon } from './icon';

export interface ModuleTileProps {
  entry: ModuleEntry;
  className?: string;
  onNavigate?: (key: string) => void;
}

/**
 * Tuile cliquable à photo : fond photographique, voile dégradé pour le
 * contraste WCAG AA, icône et libellé.
 */
export function ModuleTile({ entry, className, onNavigate }: ModuleTileProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={cn(
        'relative isolate min-h-[154px] overflow-hidden rounded-[16px] text-left text-surface shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] active:translate-y-[-1px]',
        className,
      )}
      onClick={() => (onNavigate ? onNavigate(entry.key) : navigate(`/${entry.key}`))}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-2 bg-cover bg-center transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] group-hover:scale-[1.04] hover:scale-[1.04]"
        style={{ backgroundImage: `url(${assetUrl(entry.image)})` }}
      />
      <span aria-hidden="true" className="tile-overlay absolute inset-0 -z-1" />
      <span
        aria-hidden="true"
        className="absolute top-[13px] right-[13px] grid size-[29px] place-items-center rounded-[10px] border border-surface/20 bg-[oklch(20%_0.02_240/0.28)]"
      >
        <Icon name="arrow" size="sm" />
      </span>
      <span className="absolute right-[13px] bottom-[14px] left-[15px] grid gap-0.5">
        <span className="text-[10px] font-[750] tracking-[0.08em] text-on-dark uppercase">{entry.kicker}</span>
        <strong className="font-display text-lg tracking-[-0.03em]">{entry.label}</strong>
        <span className="text-[11px] text-on-dark">{entry.detail}</span>
      </span>
    </button>
  );
}
