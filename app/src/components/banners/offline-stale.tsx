import { useBannerStore } from './banner-store';
import { useOfflineStaleBanner } from '@/hooks/use-offline-stale-banner';

/**
 * Bandeau ambre « dernier état connu le [horodatage] » (OFFR-02).
 *
 * SÉMANTIQUE COULEUR (T-33-17, UI-SPEC Color). Le bandeau stale n'est JAMAIS
 * corail : il ne signale pas une panne, il date une information. Corail = la
 * coupure (`offline-banner.tsx`) ; ambre = l'affichage peut dater. Le
 * composant NE FUSIONNE PAS avec le bandeau corail (idée v1.x, hors
 * périmètre) : le corail porte des pages entières, l'ambre porte une
 * fraîcheur datée.
 *
 * NON-DISMISSABLE (D-13). Masquer l'horodatage reviendrait à présenter la
 * donnée comme fraîche : AUCUN bouton — le bandeau se retire seul au retour
 * du réseau, via le dismiss du hook. Copie exacte de l'UI-SPEC, jamais « à
 * jour », jamais d'horodatage relatif flou.
 *
 * STRUCTURE. Pattern exact d'`update-banner.tsx` : `role="status"`, mêmes
 * classes, horodatage en `font-semibold` (UI-SPEC Typography), `flex-wrap`
 * pour l'overflow de l'horodatage sur petits écrans. Tokens ambre existants
 * de `app.css` — aucun nouveau token.
 */
export function OfflineStaleBanner() {
  useOfflineStaleBanner();
  const entry = useBannerStore((s) => s.entries.find((e) => e.kind === 'offline-stale'));
  const lastKnownAt =
    entry !== undefined ? (entry.payload as { lastKnownAt?: string } | undefined)?.lastKnownAt : undefined;
  if (!lastKnownAt) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber/30 bg-amber-soft px-[inherit] py-3 text-sm text-amber-strong"
    >
      <p className="m-0">
        Dernier état connu le <span className="font-semibold">{lastKnownAt}</span>
      </p>
    </div>
  );
}
