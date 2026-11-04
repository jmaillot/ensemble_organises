import { Button } from '@/components/ui/button';
import { useBannerStore } from './banner-store';
import { useOutboxGate } from '@/hooks/use-outbox-gate';

interface UpdateBannerProps {
  /** Retour de `registerSW` (mode prompt) — extrait dans `sw-register.ts`. */
  updateSW: () => Promise<void>;
}

/**
 * Bandeau « mise à jour disponible » (D-09) : aucun reload sans action
 * (INST-03). Le bouton est désactivé tant que la file sortante n'est pas
 * vide (D-10) — la gate désactive le bouton, elle ne filtre jamais l'appel.
 * « Plus tard » referme (D-11) ; la re-proposition à chaque session vient
 * de `onNeedRefresh` lui-même, la déduplication vient du store (Pitfall 4).
 */
export function UpdateBanner({ updateSW }: UpdateBannerProps) {
  const dismiss = useBannerStore((s) => s.dismiss);
  const { isEmpty } = useOutboxGate();
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-[inherit] py-3 text-sm"
    >
      <p className="m-0">Une mise à jour est disponible</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!isEmpty}
          onClick={() => void updateSW()}
        >
          {isEmpty ? 'Recharger' : 'Mise à jour en préparation…'}
        </Button>
        <Button variant="quiet" onClick={() => dismiss('sw-update')}>
          Plus tard
        </Button>
      </div>
    </div>
  );
}
