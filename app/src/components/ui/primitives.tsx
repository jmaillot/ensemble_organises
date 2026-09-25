import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';

export function Switch({ className, ...rest }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'flex h-[22px] w-[38px] shrink-0 items-center rounded-full border-2 border-transparent bg-border p-0.5 transition-colors duration-[var(--duration-quick)] data-[state=checked]:bg-accent',
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] rounded-full bg-surface shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-quick)] data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...rest }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'grid size-[19px] shrink-0 place-items-center rounded-[6px] border-[1.5px] border-border bg-surface text-transparent transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent-strong data-[state=checked]:text-surface',
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator>
        <Icon name="check" size="sm" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...rest }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('scrollbar-slim mb-3.5 flex gap-1 overflow-x-auto border-b border-border', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'min-h-10 shrink-0 border-b-2 border-transparent px-2.5 text-xs font-[750] whitespace-nowrap text-muted transition-colors duration-[var(--duration-quick)] hover:text-accent-strong data-[state=active]:border-accent data-[state=active]:text-accent-strong',
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...rest} />;
}

export function Badge({ className, tone = 'accent', ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'accent' | 'coral' | 'amber' | 'muted' }) {
  const tones = {
    accent: 'bg-accent-soft text-accent-strong',
    coral: 'bg-coral-soft text-coral',
    amber: 'bg-amber-soft text-[oklch(52%_0.11_78)]',
    muted: 'bg-bg text-muted',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-extrabold',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

export function Progress({ value, label, className }: { value: number; label?: string; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn('mt-3 h-[9px] overflow-hidden rounded-full bg-accent-faint', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]" style={{ width: `${clamped}%` }} />
    </div>
  );
}
