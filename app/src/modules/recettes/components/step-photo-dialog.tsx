import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface StepPhotoDialogProps {
  /** URL affichable de la photo (jamais un chemin brut), ou `null`. */
  src: string | null;
  /** Texte alternatif et titre de l'image. */
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Affichage plein écran de la photo d'une étape (D-07) : jumeau de
 * `CardCodeDialog` paramétré par une URL — fond sombre, image contenue,
 * refermable au bouton et au clavier. Jamais une réutilisation du dialogue de
 * la carte de fidélité, dont la signature est liée à un autre domaine.
 */
export function StepPhotoDialog({ src, alt, open, onOpenChange }: StepPhotoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] border-0 bg-fg p-4 text-surface sm:p-5">
        {src ? (
          <>
            <DialogHeader className="pr-9">
              <DialogTitle className="mb-2 text-[15px] text-surface">{alt}</DialogTitle>
              <DialogDescription className="sr-only">{alt}</DialogDescription>
            </DialogHeader>
            <img src={src} alt={alt} className="mx-auto max-h-[72dvh] w-auto rounded-[12px] object-contain" />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
