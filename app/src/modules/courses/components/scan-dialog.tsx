import { useCallback, useEffect, useId, useState } from 'react';
import { useBarcodeScanner } from '@/modules/fidelite/hooks/use-barcode-scanner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Création sans code (EAN illisible ou absent) : la fiche manuelle s'ouvre. */
  onManual: () => void;
  /** EAN détecté par la caméra ou tapé à la main, transmis brut (trim + validation côté page, T-04-05). */
  onDetected: (value: string) => void;
}

/**
 * Boîte de scan Courses : reprend tel quel le motif ScannerDialog de
 * Fidélité (ref callback vidéo, cycle start/stop sur open+video, messages
 * d'état FR, repli saisie manuelle). La saisie manuelle suit le même chemin
 * `onDetected` que la caméra : aucun réseau requis pour un EAN déjà connu
 * en Dexie (D-06).
 */
export function ScanDialog({ open, onOpenChange, onManual, onDetected }: ScanDialogProps) {
  const hostId = useId();
  // Le `<video>` vit dans un portail Radix monté après le premier effet :
  // une ref callback le réinjecte dans un état pour démarrer au bon moment.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [draft, setDraft] = useState('');
  const scanner = useBarcodeScanner(
    useCallback((result) => onDetected(result.value), [onDetected]),
  );
  const { start, stop, supported, status, error, result, engine } = scanner;

  useEffect(() => {
    if (!open || !video) return;
    void start(video);
    return () => stop();
  }, [open, start, stop, video]);

  // Le brouillon est vidé à chaque ouverture : un EAN précédent ne doit
  // jamais survivre d'un scan à l'autre.
  useEffect(() => {
    if (open) setDraft('');
  }, [open ]);

  const running = status === 'starting' || status === 'scanning';

  const submitDraft = () => {
    const code = draft.trim();
    if (!code) return;
    onDetected(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <p className="eyebrow mb-2">Courses</p>
          <DialogTitle>Scanner un produit</DialogTitle>
          <DialogDescription>
            Cadrez le code-barres du produit. La fiche sera pré-remplie depuis Open Food Facts.
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

        <form
          className="mt-3 grid gap-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitDraft();
          }}
        >
          <Field
            label="Code-barres"
            hint="Caméra refusée ou code illisible : saisissez le code à la main, sans écran blanc."
          >
            {(props) => (
              <Input
                {...props}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ex. 3017620422003"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="numeric"
                enterKeyHint="go"
              />
            )}
          </Field>
        </form>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" icon="edit" onClick={onManual}>
            Créer sans code
          </Button>
          <Button variant="secondary" icon="check" disabled={!draft.trim()} onClick={submitDraft}>
            Utiliser ce code
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
