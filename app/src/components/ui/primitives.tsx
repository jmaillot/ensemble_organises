import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';

const SWITCH_TRACK_CLASSES =
  'flex h-[22px] w-[38px] shrink-0 items-center rounded-full border-2 border-transparent bg-border p-0.5 transition-colors duration-[var(--duration-quick)] data-[state=checked]:bg-accent';
// G-17-3 : piste w-[38px] border-box − border-2 (2px×2) − p-0.5 (2px×2)
// = 30px utiles ; pastille 18px + translate-x-3 (12px) = 30px = contenue.
// translate-x-4 (16px) donnait 34px > 30px, soit ~4px de dépassement à ON.
// Taille visuelle 38px inchangée.
const SWITCH_THUMB_CLASSES =
  'pointer-events-none block size-[18px] rounded-full bg-surface shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-quick)] data-[state=checked]:translate-x-3';

export function Switch({ className, children, ...rest }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const thumb = <SwitchPrimitive.Thumb className={SWITCH_THUMB_CLASSES} />;
  if (rest.asChild && React.isValidElement(children)) {
    // asChild (ex. cuisine-toggle : visuel seul dans un <button>, jamais de
    // <button> imbriqué) : le Slot Radix fusionnerait les classes piste +
    // pastille sur le seul enfant — plus de pastille distincte et tout le
    // bloc glissait à ON. On y injecte la pastille pour garder piste > pastille.
    return (
      <SwitchPrimitive.Root className={cn(SWITCH_TRACK_CLASSES, className)} {...rest}>
        {React.cloneElement(children as React.ReactElement<{ children?: React.ReactNode }>, {}, thumb)}
      </SwitchPrimitive.Root>
    );
  }
  return (
    <SwitchPrimitive.Root className={cn(SWITCH_TRACK_CLASSES, className)} {...rest}>
      {thumb}
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
      className={cn('scrollbar-slim mb-3.5 flex gap-1.5 overflow-x-auto', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'min-h-10 shrink-0 rounded-full border border-border bg-surface px-3.5 text-[12px] font-bold whitespace-nowrap text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:text-fg data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-surface',
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
    amber: 'bg-amber-soft text-amber-strong',
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
