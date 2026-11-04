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

interface InstallBannerProps {
  /** Test uniquement : force la branche iOS sans dépendre de l'UA du navigateur. */
  isIosOverride?: boolean;
}

/**
 * Bannière d'installation (D-01) : premier niveau de découvrabilité, sous le
 * bandeau sw-update (priorité 2). Conditions d'affichage TOUTES requises
 * (D-02, D-03) : non installée, non enterrée, et un moyen d'installer existe.
 * Le pas-à-pas iOS vit DANS la bannière dépliable — pas de page dédiée.
 */
export function InstallBanner({ isIosOverride = false }: InstallBannerProps) {
  const installed = usePwaInstalled();
  const { canInstall, install } = useInstallPrompt();
  const isIos = isIosOverride || detectIosUa();

  const push = useBannerStore((s) => s.push);
  const dismiss = useBannerStore((s) => s.dismiss);

  const eligible = !installed && !isBuried() && (canInstall || isIos);

  useEffect(() => {
    if (eligible) push({ kind: 'install', priority: 2 });
    else dismiss('install');
  }, [eligible, push, dismiss]);

  if (!eligible) return null;

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
