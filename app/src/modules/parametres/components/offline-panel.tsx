import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { clearDatabase } from '@/lib/data/dexie';
import { isLocalMode } from '@/lib/data';
import { useInstallPrompt } from '@/hooks/use-pwa';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { dataModeLabel } from '../types';

const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0';

function formatLastSync(value: number | null): string {
  if (value === null) return 'Jamais';
  try {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return 'Inconnue';
  }
}

export function OfflinePanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canInstall, install } = useInstallPrompt();
  const { online, pending, syncing, lastSyncedAt, syncNow } = useOfflineSync();
  const [clearing, setClearing] = useState(false);
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
          {!isLocalMode ? (
            <>
              <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
                <span className="text-muted">État du réseau</span>
                <strong>{online ? 'En ligne' : 'Hors ligne'}</strong>
              </div>
              <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
                <span className="text-muted">Modifications en attente</span>
                <strong>{pending === 0 ? 'Aucune' : `${pending} en attente`}</strong>
              </div>
              <div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
                <span className="text-muted">Dernière synchronisation</span>
                <strong>{formatLastSync(lastSyncedAt)}</strong>
              </div>
            </>
          ) : null}
        </div>
        {!isLocalMode ? (
          <>
            <p className="mt-4 mb-4 text-[11px] text-muted">
              En cas de panne réseau, les données déjà consultées sont servies depuis le cache local et marquées
              comme périmées. Toute écriture qui échoue (hors ligne, timeout, erreur serveur) est mise en file et
              rejouée dans l’ordre à la reconnexion — y compris les retraits de lignes liées. En cas de conflit, le
              dernier écrivain gagne, sans fusion. Les créations et mises à jour en attente n’apparaissent qu’après
              synchronisation. Les invitations et la création de foyer exigent une connexion : ils ne sont jamais
              mis en file.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="refresh" disabled={syncing || pending === 0} onClick={() => void syncNow()}>
                {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-4 mb-4 text-[11px] text-muted">
            En mode local, les données vivent uniquement dans ce navigateur : rien n’est envoyé sur un serveur. Videz le
            cache pour revenir au jeu de démonstration d’origine.
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

      <Panel title="Application web" description="Installable, utilisable hors ligne, sans magasin d’applications.">
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>Application web installable (manifeste + service worker).</li>
          {isLocalMode ? (
            <>
              <li>Utilisable hors ligne : les pages et les données déjà consultées restent accessibles.</li>
              <li>Les écritures hors ligne sont mises en file et rejouées à la reconnexion.</li>
            </>
          ) : (
            <>
              <li>Hors ligne : les données déjà consultées restent accessibles, marquées comme périmées.</li>
              <li>
                {pending === 0
                  ? 'Aucune modification en attente de synchronisation.'
                  : `${pending} modification(s) en attente de synchronisation, rejouées dans l’ordre.`}
              </li>
              <li>Les invitations et la création de foyer exigent une connexion.</li>
            </>
          )}
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
