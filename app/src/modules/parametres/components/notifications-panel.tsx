import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
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
  fromProfileColumns,
  getPushPermissionState,
  pushPermissionHints,
  pushPermissionLabels,
  readPushServerState,
  sendTestPush,
  toProfileColumns,
  type PushPermissionState,
  type PushServerState,
  type ReminderPreferences,
} from '../lib/push';
import { reminderFrequencies, reminderFrequencyLabel } from '../types';

type ServerState = PushServerState & { loaded: boolean; error: string | null };

const EMPTY_STATE: ServerState = { vapidPublicKey: null, pushConfigured: false, devices: [], loaded: false, error: null };

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

  const refresh = useCallback(async () => {
    if (isLocalMode) {
      setServer({ ...EMPTY_STATE, loaded: true });
      return;
    }
    try {
      setServer({ ...(await readPushServerState()), loaded: true, error: null });
    } catch (error) {
      const message = error instanceof PushRequestError ? error.message : 'Service de notifications inaccessible.';
      setServer({ ...EMPTY_STATE, loaded: true, error: message });
    }
  }, []);

  useEffect(() => {
    setPermission(getPushPermissionState());
    void refresh();
  }, [refresh]);

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
                const result = await enablePush();
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
        </div>

        {hasDevice ? (
          <div className="mt-5 border-t border-border pt-1">
            <h3 className="mt-3 mb-1 text-xs font-extrabold">Appareils enregistrés</h3>
            <ul className="m-0 grid list-none gap-2 p-0">
              {devices.map((device) => (
                <li key={device.id} className="flex items-baseline justify-between gap-3 py-1 text-[11px] text-muted">
                  <span className="truncate">{device.device}</span>
                  <span className="shrink-0">
                    {device.failure_count > 0 ? `${device.failure_count} envoi(s) sans succès · ` : ''}
                    {formatDeviceDate(device.last_success_at)}
                  </span>
                </li>
              ))}
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
    </div>
  );
}
