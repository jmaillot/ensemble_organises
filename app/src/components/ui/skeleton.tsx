import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[11px] bg-accent-faint', className)} aria-hidden="true" />;
}
