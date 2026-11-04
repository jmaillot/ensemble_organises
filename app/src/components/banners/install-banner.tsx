import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useBannerStore } from './banner-store';
import { useInstallPrompt, usePwaInstalled } from '@/hooks/use-pwa';

/** Enterrement 30 jours (D-02) : timestamp ms en localStorage. */
const DISMISS_KEY = 'eo-install-banner-dismissed-at';
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

/**
 * Parse défensif (prohibition du plan) : une clé corrompue doit laisser la
 * bannière VISIBLE, pas la masquer — le repli sûr est la visibilité.
 */
function buriedAt(): number | null {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (raw === null) return null;
  const at = Number(raw);
  if (!Number.isFinite(at)) return null;
  return at;
}

function isBuried(): boolean {
  const at = buriedAt();
  return at !== null && Date.now() - at < THIRTY_DAYS;
}

/** Détection iOS par UA — Safari iPhone/iPad n'expose pas beforeinstallprompt. */
export function detectIosUa(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Contrôleur d'éligibilité, monté UNE fois dans app-shell (hors du slot) :
 * c'est lui qui pousse/retire l'entrée `install` du store. La bannière
 * visible, elle, est rendue par le slot seulement si l'entrée existe —
 * si le push vivait dans la bannière elle-même, le composant qui doit créer
 * l'entrée ne serait jamais monté (défaut trouvé en UAT du 04/11/2026).
 */
export function InstallBannerGate() {
  const installed = usePwaInstalled();
  const { canInstall } = useInstallPrompt();
  const isIos = detectIosUa();

  const push = useBannerStore((s) => s.push);
  const dismiss = useBannerStore((s) => s.dismiss);

  const eligible = !installed && !isBuried() && (canInstall || isIos);

  useEffect(() => {
    if (eligible) push({ kind: 'install', priority: 2 });
    else dismiss('install');
  }, [eligible, push, dismiss]);

  return null;
}

interface InstallBannerProps {
  /** Test uniquement : force la branche iOS sans dépendre de l'UA du navigateur. */
  isIosOverride?: boolean;
}

/**
 * Bannière d'installation (D-01) : premier niveau de découvrabilité, sous le
 * bandeau sw-update (priorité 2). Présentation seule — l'éligibilité et le
 * push sont le travail d'`InstallBannerGate`. Le pas-à-pas iOS vit DANS la
 * bannière dépliable — pas de page dédiée.
 */
export function InstallBanner({ isIosOverride = false }: InstallBannerProps) {
  const { canInstall, install } = useInstallPrompt();
  const isIos = isIosOverride || detectIosUa();

  const dismiss = useBannerStore((s) => s.dismiss);

  const bury = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    dismiss('install');
  };

  return (
    <div
      role="status"
      className="border-b border-border bg-surface px-[inherit] py-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 font-[650]">Installez Ensemble sur cet appareil</p>
        <div className="flex gap-2">
          {canInstall ? (
            <Button variant="primary" onClick={() => void install()}>
              Installer
            </Button>
          ) : null}
          <Button variant="quiet" onClick={bury}>
            Plus tard
          </Button>
        </div>
      </div>
      {isIos && !canInstall ? <IosSteps /> : null}
    </div>
  );
}

/** Pas-à-pas Safari iOS, dépliable dans la bannière elle-même (D-01). */
function IosSteps() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        className="cursor-pointer text-[13px] text-accent-strong"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        Comment installer sur iPhone / iPad
      </button>
      <ol
        className="mb-0 mt-2 grid gap-1 pl-5 text-[13px] text-muted"
        hidden={!expanded}
      >
        <li>Dans Safari, touchez le bouton Partager (le carré avec une flèche).</li>
        <li>Choisissez « Sur l’écran d’accueil ».</li>
        <li>Confirmez avec « Ajouter ».</li>
      </ol>
    </div>
  );
}
