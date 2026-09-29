import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { Panel } from '@/components/shared/module-shell';
import { Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useSessionUser } from '@/hooks/use-auth';
import { data, isLocalMode } from '@/lib/data';
import type { ProfileRow, PushDevice } from '@/types';
import {
  PushRequestError,
  defaultReminderPreferences,
  disablePush,
  enablePush,
  friendlyDeviceName,
  fromProfileColumns,
  getPushPermissionState,
  isPushSupported,
  pingServiceWorkerVersion,
  pushPermissionHints,
  pushPermissionLabels,
  readLastPushReceipt,
  readLocalEndpoint,
  readPushServerState,
  removePushDevice,
  renamePushDevice,
  repairServiceWorker,
  resyncPush,
  sendTestPush,
  toProfileColumns,
  type PushPermissionState,
  type PushReceipt,
  type PushServerState,
  type ReminderPreferences,
} from '../lib/push';
import { reminderFrequencies, reminderFrequencyLabel } from '../types';

type ServerState = PushServerState & { loaded: boolean; error: string | null };

const EMPTY_STATE: ServerState = { vapidPublicKey: null, pushConfigured: false, devices: [], loaded: false, error: null };

/** Date et heure courtes en français pour le reçu du dernier push. */
function formatReceiptDate(value: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Date courte en français : la colonne « dernier envoi » ne demande pas plus. */
function formatDeviceDate(value: string | null): string {
  if (!value) return 'jamais';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'jamais';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

export function NotificationsPanel() {
  const toast = useToast();
  const user = useSessionUser();
  const [permission, setPermission] = useState<PushPermissionState>(() => getPushPermissionState());
  const [pending, setPending] = useState(false);
  const [server, setServer] = useState<ServerState>(EMPTY_STATE);
  const [preferences, setPreferences] = useState<ReminderPreferences>(defaultReminderPreferences);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState<PushDevice | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);
  const [swVersion, setSwVersion] = useState<string | null | undefined>(undefined);
  const [receipt, setReceipt] = useState<PushReceipt | null>(null);

  const refresh = useCallback(async () => {
    if (isLocalMode) {
      setServer({ ...EMPTY_STATE, loaded: true });
      return;
    }
    try {
      const [state, endpoint] = await Promise.all([readPushServerState(), readLocalEndpoint()]);
      setServer({ ...state, loaded: true, error: null });
      setLocalEndpoint(endpoint);
    } catch (error) {
      const message = error instanceof PushRequestError ? error.message : 'Service de notifications inaccessible.';
      setServer({ ...EMPTY_STATE, loaded: true, error: message });
    }
  }, []);

  useEffect(() => {
    setPermission(getPushPermissionState());
    void refresh();
    // Quel worker est réellement actif ? Un worker obsolète reçoit les push
    // sans savoir les afficher : aucun popup, aucune notification, sans erreur.
    let cancelled = false;
    if (isPushSupported()) {
      void pingServiceWorkerVersion().then((version) => {
        if (!cancelled) setSwVersion(version);
      });
    } else {
      setSwVersion(null);
    }
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void readLastPushReceipt().then((value) => {
      if (!cancelled) setReceipt(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Les préférences sont lues sur le profil : un interrupteur doit refléter ce
  // que le serveur applique réellement, y compris depuis un autre appareil.
  useEffect(() => {
    let cancelled = false;
    if (!user) return undefined;
    void (async () => {
      const [profile] = await data.list<ProfileRow>('profiles', { id: user.id });
      if (cancelled || !profile) return;
      setPreferences(fromProfileColumns(profile));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = async (values: Partial<ReminderPreferences>) => {
    const next = { ...preferences, ...values };
    setPreferences(next);
    if (!user) return;
    try {
      await data.update<ProfileRow>('profiles', user.id, toProfileColumns(next));
    } catch {
      // L'écriture a échoué : revenir à l'état précédent vaut mieux qu'un
      // interrupteur qui ment sur ce qui est appliqué.
      setPreferences(preferences);
      toast('Préférence non enregistrée.');
    }
  };

  const devices: PushDevice[] = server.devices;
  const hasDevice = devices.length > 0;

  const confirmDelete = async () => {
    if (!deleting || deletingPending) return;
    setDeletingPending(true);
    try {
      const result = await removePushDevice(deleting.endpoint);
      toast(
        result.removed
          ? 'Appareil supprimé : il ne recevra plus les rappels.'
          : 'Appareil introuvable sur ce compte.',
      );
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setDeletingPending(false);
    }
  };

  const startRename = (device: PushDevice) => {
    setRenamingId(device.id);
    setDraft(device.device_label ?? friendlyDeviceName(device.device));
  };

  const saveRename = async (device: PushDevice) => {
    if (renaming) return;
    setRenaming(true);
    try {
      await renamePushDevice(device.id, draft);
      toast(draft.trim() ? 'Appareil renommé.' : 'Nom effacé.');
      setRenamingId(null);
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Renommage impossible.');
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="grid gap-[18px] max-[920px]:grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <Panel
        title="Notifications push"
        description="Rappels de tâches, d’événements et de routines, sur cet appareil."
        action={
          <span
            className={`inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-extrabold ${
              permission === 'autorise' ? 'bg-accent-soft text-accent-strong' : permission === 'refuse' ? 'bg-coral-soft text-coral' : 'bg-bg text-muted'
            }`}
          >
            {pushPermissionLabels[permission]}
          </span>
        }
      >
        <p className="mb-4 mt-0 text-xs text-muted">{pushPermissionHints[permission]}</p>

        {isLocalMode ? (
          <p className="mb-4 mt-0 rounded-[10px] bg-bg px-3 py-2 text-[11px] text-muted">
            Mode démonstration : les notifications push demandent une session et un serveur de notifications. Elles resteront
            inactives tant que l’application n’est pas connectée.
          </p>
        ) : null}

        {server.error ? (
          <p className="mb-4 mt-0 rounded-[10px] bg-coral-soft px-3 py-2 text-[11px] text-coral">{server.error}</p>
        ) : null}

        {server.loaded && !server.pushConfigured && !isLocalMode ? (
          <p className="mb-4 mt-0 rounded-[10px] bg-amber-soft px-3 py-2 text-[11px] text-[oklch(52%_0.11_78)]">
            Le serveur n’a pas de clé VAPID configurée. Générez-la avec <code>sh scripts/generate-vapid-keys.sh</code>, puis
            redémarrez le service des fonctions.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            icon="bell"
            disabled={pending || permission === 'refuse' || permission === 'indisponible'}
            onClick={async () => {
              setPending(true);
              try {
                // Un appareil déjà enregistré est RENOUVELÉ, pas réutilisé :
                // si les clés serveur ne correspondent plus à celles du
                // navigateur, le service Push accepte (201) mais le navigateur
                // jette sans afficher. Seul un abonnement neuf réaligne.
                const result = hasDevice ? await resyncPush() : await enablePush();
                setPermission(result.state);
                await refresh();
                toast(result.message);
              } catch (error) {
                toast(error instanceof Error ? error.message : 'Activation impossible.');
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Demande…' : hasDevice ? 'Synchroniser cet appareil' : 'Activer les notifications'}
          </Button>

          {hasDevice ? (
            <Button
              variant="secondary"
              icon="close"
              onClick={async () => {
                setPending(true);
                try {
                  const result = await disablePush();
                  await refresh();
                  // Les deux étapes sont rapportées séparément : annoncer
                  // « désactivé » alors que le serveur ignore encore
                  // l'abonnement laisserait l'utilisateur croire à un silence
                  // qui ne viendra pas.
                  toast(
                    result.serverConfirmed
                      ? 'Abonnement push supprimé de cet appareil.'
                      : result.unsubscribed
                        ? 'Appareil désabonné, mais le serveur n’a pas confirmé. Réessayez dans un instant.'
                        : 'Cet appareil n’a pas pu être désabonné. Vérifiez les réglages du navigateur.',
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Désactiver sur cet appareil
            </Button>
          ) : null}

          {hasDevice && server.pushConfigured ? (
            <Button
              variant="secondary"
              icon="bell"
              onClick={async () => {
                setPending(true);
                try {
                  const result = await sendTestPush();
                  toast(
                    result.delivered > 0
                      ? 'Notification de test envoyée.'
                      : 'Aucun envoi confirmé : vérifiez les réglages du navigateur.',
                  );
                  await refresh();
                } catch (error) {
                  toast(error instanceof Error ? error.message : 'Test impossible.');
                } finally {
                  setPending(false);
                }
              }}
            >
              Envoyer un test
            </Button>
          ) : null}

          {server.loaded && isPushSupported() && swVersion === null ? (
            <Button
              variant="secondary"
              icon="refresh"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const repaired = await repairServiceWorker();
                  if (!repaired) {
                    toast('Aucun service worker à réparer : réinstallez en effaçant les données du site.');
                  }
                } finally {
                  setPending(false);
                }
              }}
            >
              Réparer le service worker
            </Button>
          ) : null}
        </div>

        {hasDevice && localEndpoint !== null && !devices.some((device) => device.endpoint === localEndpoint) ? (
          <p className="mb-4 mt-0 rounded-[10px] bg-amber-soft px-3 py-2 text-[11px] text-[oklch(52%_0.11_78)]">
            Cet appareil n’est pas enregistré : le serveur notifie peut-être un ancien abonnement. Appuyez sur «
            Synchroniser cet appareil » depuis CE téléphone.
          </p>
        ) : null}

        {hasDevice ? (
          <div className="mt-5 border-t border-border pt-1">
            <h3 className="mt-3 mb-1 text-xs font-extrabold">Appareils enregistrés</h3>
            {isPushSupported() ? (
              <p className="m-0 mb-1 text-[10px] text-muted">
                Service worker local :{' '}
                {swVersion === undefined
                  ? 'vérification…'
                  : swVersion === null
                    ? 'injoignable — réinstallez en effaçant les données du site'
                    : `actif (${swVersion})`}
              </p>
            ) : null}
            {receipt ? (
              <p className="m-0 mb-1 text-[10px] text-muted">
                Dernier push reçu : {formatReceiptDate(receipt.at)} (« {receipt.title} ») ·{' '}
                {receipt.error ? `échec d’affichage (${receipt.error})` : receipt.shown ? 'affiché' : 'reçu'}
              </p>
            ) : null}
            <ul className="m-0 grid list-none gap-2 p-0">
              {devices.map((device) => {
                const label = device.device_label ?? friendlyDeviceName(device.device);
                const editing = renamingId === device.id;
                const isCurrent = localEndpoint !== null && device.endpoint === localEndpoint;
                return (
                  <li key={device.id} className="grid gap-1 border-t border-border py-2 first:border-t-0 first:pt-0">
                    {editing ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveRename(device);
                        }}
                      >
                        <Input
                          value={draft}
                          maxLength={80}
                          onChange={(event) => setDraft(event.target.value)}
                          aria-label={`Nom de l’appareil ${label}`}
                          autoFocus
                          disabled={renaming}
                        />
                        <Button size="sm" type="submit" disabled={renaming}>
                          {renaming ? '…' : 'OK'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          disabled={renaming}
                          onClick={() => setRenamingId(null)}
                        >
                          Annuler
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold text-fg" title={device.device}>
                            {label}
                          </span>
                          {isCurrent ? (
                            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold text-accent-strong">
                              Cet appareil
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-muted">
                          <span>
                            {device.failure_count > 0 ? `${device.failure_count} envoi(s) sans succès · ` : ''}
                            {formatDeviceDate(device.last_success_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() => startRename(device)}
                            aria-label={`Renommer ${label}`}
                            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors hover:bg-accent-faint hover:text-fg"
                          >
                            <Icon name="edit" size="sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(device)}
                            aria-label={`Supprimer ${label}`}
                            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors hover:bg-coral-soft hover:text-coral"
                          >
                            <Icon name="trash" size="sm" />
                          </button>
                        </span>
                      </div>
                    )}
                    <p className="m-0 text-[10px] text-muted">
                      Ajouté le {formatDeviceDate(device.created_at)}
                      {device.last_status !== null ? ` · dernier code ${device.last_status}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 grid gap-0 border-t border-border pt-1">
          <div className="flex items-center justify-between gap-3 py-3">
            <label htmlFor="reminder-tasks" className="text-xs">
              Rappels de tâches
            </label>
            <Switch
              id="reminder-tasks"
              checked={preferences.taskReminders}
              onCheckedChange={(checked) => void update({ taskReminders: checked })}
              aria-label="Rappels de tâches"
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border py-3">
            <label htmlFor="reminder-events" className="text-xs">
              Rappels d’événements
            </label>
            <Switch
              id="reminder-events"
              checked={preferences.eventReminders}
              onCheckedChange={(checked) => void update({ eventReminders: checked })}
              aria-label="Rappels d’événements"
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border py-3">
            <label htmlFor="reminder-routines" className="text-xs">
              Rappels de routines
            </label>
            <Switch
              id="reminder-routines"
              checked={preferences.routineReminders}
              onCheckedChange={(checked) => void update({ routineReminders: checked })}
              aria-label="Rappels de routines"
            />
          </div>
        </div>
        <div className="mt-3">
          <Field label="Fréquence des rappels" hint="Appliquée aux rappels automatiques du foyer.">
            {(props) => (
              <Select
                value={preferences.frequency}
                onChange={(event) => void update({ frequency: event.target.value as ReminderPreferences['frequency'] })}
                {...props}
              >
                {reminderFrequencies.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Fréquence enregistrée : {reminderFrequencyLabel(preferences.frequency)}. Les rappels sont unitaires : ils partent dès
          que l’heure est atteinte.
        </p>
      </Panel>

      <Panel title="Comment ça arrive" description="Le parcours d’un rappel, du foyer à l’écran.">
        <ol className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>1. Une tâche, un événement ou une routine porte une heure de rappel.</li>
          <li>2. Toutes les quinze minutes, la base rassemble les rappels dus et les membres concernés.</li>
          <li>3. Chaque membre reçoit sur ses appareils enregistrés, sauf ceux qui ont coupé ce type de rappel.</li>
          <li>4. Le rappel est retiré une fois reçu : il ne se répète pas.</li>
        </ol>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Les clés de chiffrement de vos appareils ne quittent jamais le serveur : le navigateur vous envoie son adresse de
          Push, et rien d’autre.
        </p>
      </Panel>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={
          deleting
            ? `Supprimer « ${deleting.device_label ?? friendlyDeviceName(deleting.device)} »`
            : 'Supprimer l’appareil'
        }
        description="Cet appareil ne recevra plus les rappels du foyer. Pour le réenregistrer, réactivez les notifications dessus."
        confirmLabel={deletingPending ? 'Suppression…' : 'Supprimer'}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
