import { Switch } from '@/components/ui/primitives';

export interface CuisineToggleProps {
  active: boolean;
  onToggle: () => void;
}

/**
 * Interrupteur « Mode cuisine » en haut à droite du panneau Étapes
 * (`Panel action`, D-12, R1).
 *
 * Un seul tab stop : `<button type="button" aria-pressed>` portant le
 * libellé 14px/700 + le visuel `Switch` rendu `asChild` vers un `span`
 * (`tabIndex={-1}`, `aria-hidden`) — jamais de `<button>` imbriqué
 * (piège Pitfall 1). Le clic sur le visuel remonte au bouton (un seul
 * basculement, prouvé par test). Hauteur 44px (zone tactile).
 */
export function CuisineToggle({ active, onToggle }: CuisineToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 text-fg transition-colors hover:border-accent hover:bg-accent-faint"
    >
      <span className="text-[14px] font-bold">Mode cuisine</span>
      <Switch checked={active} tabIndex={-1} aria-hidden="true" asChild>
        <span />
      </Switch>
    </button>
  );
}
