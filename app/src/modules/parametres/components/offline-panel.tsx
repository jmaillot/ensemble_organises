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

const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0';

export function OfflinePanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canInstall, install } = useInstallPrompt();
  const [pending, setPending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="grid gap-[18px] max-[920px]:grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <Panel title="Données et mode de fonctionnement" description="L’application fonctionne hors ligne et se resynchronise ensuite.">
        <div className="grid gap-0">
          <div className="flex items-center justify-between gap-2.5 py-[13px] text-xs">
            <span className="text-muted">Mode de données</span>
            <strong>{dataModeLabel(isLocalMode)}</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Cache local</span>
            <strong>IndexedDB (Dexie)</strong>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
            <span className="text-muted">Version</span>
            <strong>{appVersion}</strong>
          </div>
        </div>
        <p className="mt-4 mb-4 text-[11px] text-muted">
          En mode local, les données vivent uniquement dans ce navigateur : rien n’est envoyé sur un serveur. Videz le
          cache pour revenir au jeu de démonstration d’origine.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon="trash"
            disabled={pending}
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

      <Panel title="Application web" description="Installable, utilisable hors ligne, sans magasin d’applications.">
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>Application web installable (manifeste + service worker).</li>
          <li>Utilisable hors ligne : les pages et les données déjà consultées restent accessibles.</li>
          <li>Les écritures hors ligne sont mises en file et rejouées à la reconnexion.</li>
        </ul>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Version {appVersion} · service worker mis à jour automatiquement à chaque déploiement.
        </p>
      </Panel>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider le cache local ?"
        description="Les données enregistrées sur cet appareil seront supprimées. Le jeu de démonstration sera rechargé à la prochaine lecture."
        confirmLabel="Vider le cache"
        onConfirm={async () => {
          setPending(true);
          try {
            await clearDatabase();
            await queryClient.invalidateQueries();
            toast('Cache local vidé.');
          } catch (clearError) {
            toast(clearError instanceof Error ? clearError.message : 'Vidage impossible.', 'error');
          } finally {
            setPending(false);
            setConfirmClear(false);
          }
        }}
      />
    </div>
  );
}
