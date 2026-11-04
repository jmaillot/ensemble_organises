import { useBannerStore } from './banner-store';
import { UpdateBanner } from './update-banner';
import { updateSW } from '@/lib/sw-register';

/**
 * Slot de bandeaux hauts (D-04) — infrastructure empilable/priorisée. Les
 * bandeaux s'insèrent entre le header et le contenu principal. Le mapping
 * kind → composant ignore tout kind inconnu (un type non rendu ne doit pas
 * planter le shell).
 */

const banners: Record<string, () => React.ReactNode> = {
  'sw-update': () => <UpdateBanner updateSW={updateSW} />,
};

export function BannerSlot() {
  const sorted = useBannerStore((s) => s.sorted);
  const rendered = sorted
    .map((entry) => {
      const render = banners[entry.kind];
      return render ? <div key={entry.kind}>{render()}</div> : null;
    })
    .filter((node) => node !== null);
  if (rendered.length === 0) return null;
  return <div>{rendered}</div>;
}
