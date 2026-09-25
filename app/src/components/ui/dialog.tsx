import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(function DialogContent({ className, children, hideClose, ...rest }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(20%_0.02_240/0.42)] backdrop-blur-[6px]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Radix rend l'overlay et le contenu en frères : le panneau est donc
          // centré par lui-même au-dessus du voile, sinon il tomberait dans le
          // flux normal de la page, sous la ligne de flottaison.
          'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-40px)] w-[calc(100vw-40px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] bg-surface p-[23px] shadow-[var(--shadow-lg)] sm:max-h-[720px]',
          className,
        )}
        {...rest}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute top-4 right-4 grid size-[42px] place-items-center rounded-[13px] border border-border bg-surface text-fg transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint"
            aria-label="Fermer"
          >
            <Icon name="close" size="sm" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pr-9', className)} {...rest} />;
}

export const DialogTitle = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('mb-1.5 font-display text-2xl tracking-[-0.035em]', className)}
      {...rest}
    />
  );
});

export const DialogDescription = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Description ref={ref} className={cn('mb-5 text-xs text-muted', className)} {...rest} />
  );
});

export function DialogActions({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex flex-wrap justify-end gap-2', className)} {...rest} />;
}
