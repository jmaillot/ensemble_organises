import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Panel } from '@/components/shared/module-shell';
import { Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  clearPushSubscription,
  getPushPermissionState,
  pushPermissionHints,
  pushPermissionLabels,
  readReminderPreferences,
  readStoredSubscription,
  requestPushPermission,
  saveReminderPreferences,
  vapidPublicKey,
  type PushPermissionState,
  type ReminderPreferences,
} from '../lib/push';
import { reminderFrequencies, reminderFrequencyLabel } from '../types';

export function NotificationsPanel() {
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermissionState>(() => getPushPermissionState());
  const [pending, setPending] = useState(false);
  const [preferences, setPreferences] = useState<ReminderPreferences>(() => readReminderPreferences());
  const [subscribed, setSubscribed] = useState(() => readStoredSubscription() !== null);

  useEffect(() => {
    setPermission(getPushPermissionState());
  }, []);

  const update = (values: Partial<ReminderPreferences>) => {
    const next = { ...preferences, ...values };
    setPreferences(next);
    saveReminderPreferences(next);
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
        <div className="flex flex-wrap gap-2">
          <Button
            icon="bell"
            disabled={pending || permission === 'autorise' || permission === 'indisponible'}
            onClick={async () => {
              setPending(true);
              try {
                const next = await requestPushPermission();
                setPermission(next);
                setSubscribed(readStoredSubscription() !== null);
                toast(
                  next === 'autorise'
                    ? 'Notifications activées sur cet appareil.'
                    : 'Notifications non activées : vérifiez les réglages de votre navigateur.',
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Demande…' : 'Activer les notifications'}
          </Button>
          {permission === 'autorise' || subscribed ? (
            <Button
              variant="secondary"
              icon="close"
              onClick={async () => {
                await clearPushSubscription();
                setSubscribed(false);
                toast('Abonnement push supprimé de cet appareil.');
              }}
            >
              Désactiver sur cet appareil
            </Button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-0 border-t border-border pt-1">
          <div className="flex items-center justify-between gap-3 py-3">
            <label htmlFor="reminder-tasks" className="text-xs">
              Rappels de tâches
            </label>
            <Switch
              id="reminder-tasks"
              checked={preferences.taskReminders}
              onCheckedChange={(checked) => update({ taskReminders: checked })}
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
              onCheckedChange={(checked) => update({ eventReminders: checked })}
              aria-label="Rappels d’événements"
            />
          </div>
        </div>
        <div className="mt-3">
          <Field label="Fréquence des rappels" hint="Appliquée aux rappels automatiques du foyer.">
            {(props) => (
              <Select
                value={preferences.frequency}
                onChange={(event) => update({ frequency: event.target.value as ReminderPreferences['frequency'] })}
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
          Fréquence enregistrée : {reminderFrequencyLabel(preferences.frequency)}.
        </p>
      </Panel>

      <Panel title="Ce qui reste à faire" description="L’envoi des notifications est une opération serveur.">
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[11px] text-muted">
          <li>1. Exposer la clé publique VAPID dans le build : {vapidPublicKey ? 'déjà présente.' : 'VITE_VAPID_PUBLIC_KEY est absente.'}</li>
          <li>2. Enregistrer l’abonnement par membre dans une Edge Function sécurisée.</li>
          <li>3. Envoyer les rappels depuis une Edge Function déclenchée par pg_cron.</li>
          <li>4. Ajouter les préférences de notification au profil (migration SQL).</li>
        </ul>
        <p className="mt-4 mb-0 text-[11px] text-muted">
          Tant que l’envoi n’existe pas, l’abonnement est conservé sur cet appareil et les rappels restent inactifs.
        </p>
      </Panel>
    </div>
  );
}
