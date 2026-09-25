import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Icon } from '@/components/shared/icon';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

/**
 * Confirmation obligatoire pour toute action destructrice : jamais de
 * suppression en un seul geste.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(20%_0.02_240/0.42)] backdrop-blur-[6px]" />
        <AlertDialogPrimitive.Content
          className={cn(
            // Centré par lui-même : overlay et contenu sont des frères.
            'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-40px)] w-[calc(100vw-40px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] bg-surface p-6 shadow-[var(--shadow-lg)]',
          )}
        >
          <div className="mb-4 grid size-12 place-items-center rounded-[16px] bg-coral-soft text-coral">
            <Icon name="trash" size="lg" />
          </div>
          <AlertDialogPrimitive.Title className="mb-2 font-display text-xl tracking-[-0.035em]">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mb-5 text-xs text-muted">
            {description ?? 'Cette action est définitive.'}
          </AlertDialogPrimitive.Description>
          {children}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
