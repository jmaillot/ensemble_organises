import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/shared/icon';
import { QrCode } from '@/components/shared/qr-code';
import { cn } from '@/lib/utils';
import { loyaltyBrandChip, loyaltyBrandColors, loyaltyCodeTypeLabel, type LoyaltyCard } from '../types';

export interface CardCodeDialogProps {
  card: LoyaltyCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMutating: boolean;
  onScan: () => void;
  onMarkUsed: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Affichage plein écran du code, prêt à présenter en caisse : contraste
 * maximal, enseigne visible, aucune information superflue à l'écran.
 */
export function CardCodeDialog({
  card,
  open,
  onOpenChange,
  isMutating,
  onScan,
  onMarkUsed,
  onEdit,
  onDelete,
}: CardCodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] border-0 bg-fg p-6 text-surface sm:p-7">
        {card ? (
          <>
            <DialogHeader className="pr-0">
              <p className="eyebrow mb-2 text-on-dark">Code de fidélité</p>
              <DialogTitle className="mb-1.5 text-[28px] text-surface">{card.name}</DialogTitle>
              <DialogDescription className="mb-4 flex flex-wrap items-center gap-2 text-on-dark">
                <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-extrabold text-surface', loyaltyBrandChip[card.brandColor ?? 'accent'])}>
                  {loyaltyBrandColors.find((option) => option.value === (card.brandColor ?? 'accent'))?.label}
                </span>
                <span>{loyaltyCodeTypeLabel[card.codeType]}</span>
                <span aria-hidden="true">·</span>
                <span>{card.memberName ?? 'Foyer entier'}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-[16px] bg-surface p-5 text-fg">
              {card.codeType === 'qr' ? (
                <div className="flex justify-center py-1">
                  <QrCode value={card.codeValue} size={248} label={`QR code de fidélité de ${card.name}`} />
                </div>
              ) : (
                <div className="barcode-stripes my-1" aria-hidden="true" />
              )}
              <p className="mt-3 mb-0 break-all text-center font-mono text-[clamp(15px,2.4vw,22px)] tracking-[0.16em] text-fg">
                {card.codeValue}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" icon="check" onClick={onMarkUsed} disabled={isMutating}>
                Marquer comme utilisée
              </Button>
              <Button variant="secondary" icon="scan" onClick={onScan}>
                Scanner
              </Button>
              <Button variant="secondary" icon="edit" onClick={onEdit}>
                Modifier
              </Button>
              <Button variant="danger" icon="trash" onClick={onDelete}>
                Supprimer
              </Button>
              <Button variant="ghost" icon="close" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </div>

            <p className="mt-4 mb-0 flex items-center gap-2 text-[11px] text-on-dark">
              <Icon name="info" size="sm" />
              À présenter au moment de passer en caisse, écran à pleine luminosité.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
