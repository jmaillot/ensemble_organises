import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { clearDatabase } from '@/lib/data/dexie';
import { isLocalMode } from '@/lib/data';
import { useInstallPrompt } from '@/hooks/use-pwa';
import { dataModeLabel } from '../types';

// `unknown` signale « construit hors pipeline estampillé » (D-02) : sans
// injection de SHA, afficher `0.1.0` — le semver du `package.json` — serait
// une version fausse avec assurance, car un build local diffère déjà de
// l'image servie (`.dockerignore` exclut les tests et `docs`, Tailwind émet
// moins de classes). `||` et non `??` : un `--build-arg GIT_SHA=` transmet
// une chaîne VIDE, qu'il faut replacer par `unknown` au même titre qu'une
// variable absente.
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';
// SHA complet (40) pour la comparaison exacte avec `git rev-parse HEAD` sur
// le clone de production, forme courte (8) pour l'œil à l'écran (D-03).
// `unknown` ne fait que 7 caractères : `slice(0, 8)` le laisse intact, aucun
// cas spécial à gérer.
const appVersionShort = appVersion.slice(0, 8);

export function OfflinePanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canInstall, install } = useInstallPrompt();
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="grid gap-[18px] max-[920px]:grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <Panel title="Données et mode de fonctionnement" description="L’application lit et écrit directement sur le serveur du foyer.">
        <div className="grid gap-0">
          <div className="flex items-center justify-between gap-2.5 py-[13px] text-xs">
            <span className="text-muted">Mode de données</span>
            <strong>{dataModeLabel(isLocalMode)}</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Version</span>
            <strong title={appVersion}>{appVersionShort}</strong>
          </div>
        </div>
        {isLocalMode ? (
          <p className="mt-4 mb-4 text-[11px] text-muted">
            En mode local, les données vivent uniquement dans ce navigateur : rien n’est envoyé sur un serveur. Videz le
            cache pour revenir au jeu de démonstration d’origine.
          </p>
        ) : (
          <p className="mt-4 mb-4 text-[11px] text-muted">
            Connecté au serveur du foyer : chaque lecture et chaque écriture part directement, et une erreur réseau ou
            serveur s’affiche telle quelle. Une connexion est nécessaire pour utiliser l’application.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon="trash"
            disabled={clearing}
            onClick={() => setConfirmClear(true)}
          >
            Vider le cache local
          </Button>
          {canInstall ? (
            <Button icon="download" onClick={() => void install()}>
              Installer l’application
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Application web" description="Installable, sans magasin d’applications.">
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>Application web installable (manifeste + service worker).</li>
          <li>Les rappels arrivent en notification push, réglables dans le panneau notifications.</li>
        </ul>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Version <span title={appVersion}>{appVersionShort}</span> · service worker mis à jour automatiquement à chaque
          déploiement.
        </p>
      </Panel>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider le cache local ?"
        description="Les données enregistrées sur cet appareil seront supprimées. Le jeu de démonstration sera rechargé à la prochaine lecture."
        confirmLabel="Vider le cache"
        onConfirm={async () => {
          setClearing(true);
          try {
            await clearDatabase();
            await queryClient.invalidateQueries();
            toast('Cache local vidé.');
          } catch (clearError) {
            toast(clearError instanceof Error ? clearError.message : 'Vidage impossible.', 'error');
          } finally {
            setClearing(false);
            setConfirmClear(false);
          }
        }}
      />
    </div>
  );
}
