import { useCallback, useEffect, useId, useState } from 'react';
import { MetricRow, ModuleShell, SectionHeading } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { QrCode } from '@/components/shared/qr-code';
import { cn } from '@/lib/utils';
import { CardCodeDialog } from './components/card-code-dialog';
import { CardFormDialog } from './components/card-form-dialog';
import { useFidelite } from './hooks/use-fidelite';
import { useBarcodeScanner } from './hooks/use-barcode-scanner';
import { loyaltyCodeTypeLabel, loyaltyIconTone, type LoyaltyCard, type LoyaltyCardInput } from './types';

export default function FidelitePage() {
  const { cards, total, barcodes, qrCodes, isLoading, isFetching, isError, error, isMutating, refetch, addCard, editCard, removeCard, markUsed } =
    useFidelite();
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyCard | null>(null);
  const [prefill, setPrefill] = useState<Partial<LoyaltyCardInput> | undefined>(undefined);
  const [preview, setPreview] = useState<LoyaltyCard | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LoyaltyCard | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const openCreate = useCallback((values?: Partial<LoyaltyCardInput>) => {
    setEditing(null);
    setPrefill(values);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((card: LoyaltyCard) => {
    setPreview(null);
    setEditing(card);
    setPrefill(undefined);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }, []);

  const saveCard = useCallback(
    async (input: LoyaltyCardInput) => {
      try {
        if (editing) {
          await editCard(editing, input);
          toast('Carte mise à jour.', 'success');
        } else {
          await addCard(input);
          toast('Carte de fidélité enregistrée.', 'success');
        }
      } catch (caught) {
        toast(caught instanceof Error ? caught.message : 'Enregistrement impossible.', 'error');
      }
    },
    [addCard, editCard, editing, toast],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    setPendingDelete(null);
    setPreview(null);
    try {
      await removeCard(pendingDelete);
      toast(`Carte ${name} supprimée.`, 'success');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Suppression impossible.', 'error');
    }
  }, [pendingDelete, removeCard, toast]);

  const markCardUsed = useCallback(async () => {
    if (!preview) return;
    try {
      await markUsed(preview);
      toast('Carte marquée comme utilisée : elle remonte dans la liste.', 'success');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Mise à jour impossible.', 'error');
    }
  }, [markUsed, preview, toast]);

  return (
    <ModuleShell
      module="fidelite"
      actions={
        <>
          <Button variant="secondary" icon="scan" onClick={() => setScannerOpen(true)}>
            Scanner une carte
          </Button>
          <Button icon="plus" onClick={() => openCreate()}>
            Ajouter une carte
          </Button>
        </>
      }
    >
      <MetricRow
        items={[
          { label: 'Cartes', value: total, caption: 'fidélités sauvegardées' },
          { label: 'Code-barres', value: barcodes, caption: 'scannables' },
          { label: 'QR Codes', value: qrCodes, caption: 'prêts à scanner' },
          { label: 'Synchronisation', value: 'Auto', caption: 'sur cet appareil' },
        ]}
      />

      <SectionHeading
        title="Les cartes du foyer"
        description="Touchez une carte pour l’afficher en plein écran, prête à présenter en caisse."
        action={
          <span className="text-[11px] text-muted" aria-live="polite">
            {isFetching ? 'Actualisation…' : `${cards.length} carte${cards.length > 1 ? 's' : ''}`}
          </span>
        }
      />

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : isError ? (
        <ErrorState message={error?.message ?? 'Les cartes de fidélité n’ont pas pu être chargées.'} onRetry={refetch} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="Aucune carte de fidélité"
          description="Enregistrez la carte de votre enseigne pour retrouver son code au moment de passer en caisse."
          actionLabel="Ajouter une carte"
          onAction={() => openCreate()}
          secondaryActionLabel="Scanner une carte"
          onSecondaryAction={() => setScannerOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1" aria-busy={isFetching}>
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setPreview(card)}
              aria-label={`Afficher le code de ${card.name} en plein écran`}
              className={cn(
                'panel-surface w-full rounded-[16px] p-[17px] text-left transition-[transform,border-color] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent',
                index % 2 === 1 && 'border-accent/25 bg-accent-faint',
              )}
            >
              <div className="flex items-start gap-[11px]">
                <span className={cn('grid size-[42px] shrink-0 place-items-center rounded-[13px]', loyaltyIconTone[card.brandColor ?? 'accent'])}>
                  <Icon name="wallet" size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block truncate font-display text-[17px] tracking-[-0.035em]">{card.name}</span>
                  <span className="block text-[11px] text-muted">
                    {loyaltyCodeTypeLabel[card.codeType]} · {card.memberName ?? 'Foyer entier'}
                  </span>
                </span>
              </div>

              {card.codeType === 'qr' ? (
                <span className="mt-[18px] mb-[9px] flex justify-center">
                  <QrCode value={card.codeValue} size={116} label={`QR code de fidélité de ${card.name}`} />
                </span>
              ) : (
                <span className="barcode-stripes mt-[18px] mb-[9px] block" aria-hidden="true" />
              )}

              <span className="block font-mono text-[11px] tracking-[0.1em] break-all text-muted">{card.codeValue}</span>
            </button>
          ))}
        </div>
      )}

      <CardFormDialog
        key={`form-${editing?.id ?? 'new'}-${formKey}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
        prefill={prefill}
        isSaving={isMutating}
        onSubmit={saveCard}
      />

      <CardCodeDialog
        card={preview}
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        isMutating={isMutating}
        onScan={() => {
          setPreview(null);
          setScannerOpen(true);
        }}
        onMarkUsed={markCardUsed}
        onEdit={() => {
          if (preview) openEdit(preview);
        }}
        onDelete={() => {
          if (preview) setPendingDelete(preview);
        }}
      />

      <ScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onManual={() => {
          setScannerOpen(false);
          openCreate();
        }}
        onDetected={(value, codeType) => {
          setScannerOpen(false);
          openCreate({ codeValue: value, codeType });
          toast(`Code détecté : ${value}`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Supprimer cette carte ?"
        description={`La carte ${pendingDelete?.name ?? ''} et son code seront supprimés du foyer.`}
        confirmLabel="Supprimer la carte"
        onConfirm={confirmDelete}
      />
    </ModuleShell>
  );
}

interface ScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
  onDetected: (value: string, codeType: 'barcode' | 'qr') => void;
}

/** Boîte de scan : caméra plein écran, état lisible et repli saisie manuelle. */
function ScannerDialog({ open, onOpenChange, onManual, onDetected }: ScannerDialogProps) {
  const hostId = useId();
  // Le `<video>` vit dans un portail Radix monté après le premier effet :
  // une ref callback le réinjecte dans un état pour démarrer au bon moment.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const scanner = useBarcodeScanner(
    useCallback((result) => onDetected(result.value, result.format === 'qr_code' ? 'qr' : 'barcode'), [onDetected]),
  );
  const { start, stop, supported, status, error, result, engine } = scanner;

  useEffect(() => {
    if (!open || !video) return;
    void start(video);
    return () => stop();
  }, [open, start, stop, video]);

  const running = status === 'starting' || status === 'scanning';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <p className="eyebrow mb-2">Fidélité</p>
          <DialogTitle>Scanner une carte</DialogTitle>
          <DialogDescription>
            Cadrez le code-barres ou le QR code de l’enseigne. La carte sera pré-remplie.
          </DialogDescription>
        </DialogHeader>

        <div id={hostId} className="relative overflow-hidden rounded-[16px] bg-ink-soft">
          <video
            ref={setVideo}
            muted
            playsInline
            aria-label="Aperçu de la caméra"
            className={cn('aspect-[4/3] w-full object-cover', engine === 'fallback' && 'hidden')}
          />
          {!supported || !running ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <span className="text-[12px] text-on-dark">
                {!supported ? 'Caméra non disponible sur cet appareil.' : status === 'starting' ? 'Ouverture de la caméra…' : 'Caméra arrêtée.'}
              </span>
            </div>
          ) : null}
        </div>

        <p className="mt-3 mb-0 text-[12px] text-muted" role="status" aria-live="polite">
          {result
            ? `Code détecté : ${result.value}`
            : error ??
              (status === 'scanning'
                ? 'Caméra active · maintenez le code dans le cadre.'
                : status === 'starting'
                  ? 'Démarrage de la caméra…'
                  : 'Caméra arrêtée.')}
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" icon="edit" onClick={onManual}>
            Saisir le code à la main
          </Button>
          {running ? (
            <Button icon="close" onClick={() => onOpenChange(false)}>
              Arrêter
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon="scan"
              onClick={() => {
                if (video) void start(video);
              }}
            >
              Relancer la caméra
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
