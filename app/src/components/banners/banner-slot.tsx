import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useBannerStore } from './banner-store';
import { OUTBOX_BANNER_KIND } from '@/hooks/use-outbox-replay-badge';
import { UpdateBanner } from './update-banner';
import { InstallBanner } from './install-banner';
import { updateSW } from '@/lib/sw-register';

/**
 * Slot de bandeaux hauts (D-04) — infrastructure empilable/priorisée. Les
 * bandeaux s'insèrent entre le header et le contenu principal. Le mapping
 * kind → composant ignore tout kind inconnu (un type non rendu ne doit pas
 * planter le shell).
 */

const banners: Record<string, () => React.ReactNode> = {
  'sw-update': () => <UpdateBanner updateSW={updateSW} />,
  install: () => <InstallBanner />,
  // Phase 34 (D-11/D-13) : badge « N en attente » / « N bloquées » de la file
  // d'écriture hors-ligne — un AJOUT de cas de rendu, le contrat de la
  // phase 32 (slot, priorités, déduplication) est inchangé.
  'outbox-pending': () => <OutboxBanner />,
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

/**
 * Bandeau de la file d'écriture hors-ligne (phase 34, WRQ-05). Le payload
 * est écrit par `use-outbox-replay-badge` (source unique, D-13) :
 *
 * - `failed === 0` : « N en attente » — visible en ligne comme hors ligne,
 *   non cliquable (rien à décider, le rejeu s'en occupe) ;
 * - `failed > 0` : « N bloquées » — cliquable vers le panneau offline de
 *   Paramètres (D-11), seul endroit où une écriture peut être réessayée ou
 *   abandonnée. Un seul point d'observation.
 *
 * Copie et structure : pattern des bandeaux existants (`role="status"`,
 * `px-[inherit]`), zone tactile ≥ 44 px portée par le Button (AGENTS §6).
 */
function OutboxBanner() {
  const navigate = useNavigate();
  const entry = useBannerStore((s) => s.entries.find((e) => e.kind === OUTBOX_BANNER_KIND));
  const payload = entry?.payload as { pending?: number; failed?: number } | undefined;
  const pending = payload?.pending ?? 0;
  const failed = payload?.failed ?? 0;
  if (pending === 0 && failed === 0) return null;
  const blocked = failed > 0;
  const label = blocked
    ? failed === 1
      ? '1 écriture bloquée'
      : `${failed} écritures bloquées`
    : pending === 1
      ? '1 écriture en attente'
      : `${pending} écritures en attente`;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber/30 bg-amber-soft px-[inherit] py-3 text-sm text-amber-strong"
    >
      <p className="m-0">
        {label}
        {!blocked && pending > 0 ? ' — elles partiront au retour du réseau' : ''}
      </p>
      {blocked ? (
        <Button variant="secondary" onClick={() => navigate('/parametres')}>
          Voir les détails
        </Button>
      ) : null}
    </div>
  );
}
