import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Titre de section interne des vues éditoriales (pages légales, panneaux).
 * Display 19px, chasse resserrée, respiration mb-2.
 */
export function SectionHeading({ className, ...rest }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('mb-2 font-display text-[19px] tracking-[-0.02em]', className)} {...rest} />;
}
