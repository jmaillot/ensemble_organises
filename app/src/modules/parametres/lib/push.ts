import { supabase } from '@/lib/supabase/client';
import type { PushDevice, ReminderFrequency } from '@/types';
import { isLocalMode } from '@/lib/data';

/**
 * Notifications push : autorisation du navigateur, abonnement `PushManager`, et
 * enregistrement de cet abonnement auprès du serveur.
 *
 * OÙ SONT ENREGISTRÉES LES DONNÉES
 *   L'abonnement est transmis à l'Edge Function `push-subscribe` (mode
 *   `user`), qui appelle `public.register_push_subscription`. Le navigateur
 *   n'écrit jamais dans `push_subscriptions` : la table n'a ni politique RLS ni
 *   privilège pour `authenticated`, parce qu'un `endpoint` de Push est une
 *   CAPACITÉ — quiconque le détient peut notifier cet appareil. Les clés
 *   `p256dh` et `auth` ne sont donc connues que du serveur, et ne reviennent
 *   jamais ici.
 *
 * OÙ EST LA CLÉ VAPID
 *   Auparavant `VITE_VAPID_PUBLIC_KEY`, lue dans le bundle. Elle est désormais
 *   demandée à `push-subscribe` (`action: 'config'`) : le bundle est servi en
 *   cache pendant des mois, et une rotation de clé ne doit pas exiger de
 *   reconstruire le frontend. Sans cette clé, l'abonnement échoue avec une
 *   erreur du service Push que rien n'explique.
 *
 * ÉTAT PARTAGÉ
 *   Aucune écriture dans `localStorage` : l'état affiché vient du serveur, et
 *   `localStorage` ne faisait que这些问题 du serveur — l'onglet pouvait
 *   afficher « activé » pour un abonnement supprimé côté serveur.
 */

/**
 * État de l'autorisation, en français.
 *
 * Les valeurs du navigateur sont `default`, `granted` et `denied` : les
 * reconvertir par simple cast donnait un état absent de `pushPermissionLabels`,
 * donc un badge vide dans TOUS les cas. La correspondance est donc explicite.
 */
export type PushPermissionState = 'non_demande' | 'autorise' | 'refuse' | 'indisponible';

export interface ReminderPreferences {
  frequency: ReminderFrequency;
  taskReminders: boolean;
  eventReminders: boolean;
  routineReminders: boolean;
}

export const pushPermissionLabels: Record<PushPermissionState, string> = {
  non_demande: 'Non demandé',
  autorise: 'Autorisé',
  refuse: 'Refusé',
  indisponible: 'Indisponible',
};

export const pushPermissionHints: Record<PushPermissionState, string> = {
  non_demande: 'Les rappels du foyer vous parviennent dès que vous les activez.',
  autorise: 'Les rappels push sont activés sur cet appareil.',
  refuse: 'Votre navigateur bloque les notifications. Autorisez-les dans les réglages du site.',
  indisponible: 'Ce navigateur ne gère pas les notifications push, ou la page n’est pas sécurisée (HTTPS).',
};

export const defaultReminderPreferences: ReminderPreferences = {
  frequency: 'immediat',
  taskReminders: true,
  eventReminders: true,
  routineReminders: true,
};

const FUNCTION_NAME = 'push-subscribe';
const NOTIFY_FUNCTION_NAME = 'push-notify';

export interface PushServerState {
  /** Clé publique VAPID, ou `null` si le serveur n'en a pas de configurée. */
  vapidPublicKey: string | null;
  pushConfigured: boolean;
  devices: PushDevice[];
}

// ---------------------------------------------------------------------------
// Capacités du navigateur
// ---------------------------------------------------------------------------

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponible';
  if (!isPushSupported()) return 'indisponible';
  if (Notification.permission === 'granted') return 'autorise';
  if (Notification.permission === 'denied') return 'refuse';
  return 'non_demande';
}

/** Traduit une valeur de `Notification.permission` en état d'interface. */
function getPermissionState(permission: NotificationPermission): PushPermissionState {
  if (permission === 'granted') return 'autorise';
  if (permission === 'denied') return 'refuse';
  return 'non_demande';
}

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Appels serveur
// ---------------------------------------------------------------------------

/**
 * Erreur remontée par l'Edge Function, avec son code HTTP.
 *
 * Le message vient du serveur et est écrit pour l'utilisateur ; le statut, lui,
 * décide de ce que l'interface doit faire — et distinguishes « réseau coupé »
 * de « clé VAPID absente », deux situations qu'un même texte ne distingue pas.
 */
export class PushRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PushRequestError';
    this.status = status;
  }
}

async function invoke<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new PushRequestError(0, 'Le service de notifications est inaccessible : l’application tourne en mode démonstration.');
  }

  // `functions.invoke` renvoie toujours un objet : un échec HTTP y est une
  // SUCCÈS au sens de la promesse, avec `error` renseigné. Ne pas regarder
  // `error` revient à traiter un 401 comme un abonnement.
  const { data, error, response } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    const status = typeof response?.status === 'number' ? response.status : 0;
    throw new PushRequestError(status, await readErrorMessage(response, status));
  }

  return data as T;
}

/**
 * Message d'erreur métier, lu dans le corps de la réponse.
 *
 * `@supabase/functions-js` renvoie la `Response` BRUTE d'un échec, dont le corps
 * n'a pas été consommé : le message écrit par la fonction (« aucun appareil
 * enregistré », « clé VAPID absente ») n'est donc accessible qu'après un
 * `await response.text()`. Lire `context.body` ne renverrait qu'un
 * `ReadableStream`, et l'utilisateur verrait un libellé générique.
 */
async function readErrorMessage(response: Response | undefined, status: number): Promise<string> {
  if (response) {
    try {
      // `clone()` : une seconde lecture d'un flux déjà consommé lève, au lieu de
      // de rendre le message métier.
      const text = await response.clone().text();
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Corps vide ou non JSON : les replis ci-dessous valent mieux qu'une
      // exception remontée à l'interface.
    }
  }
  if (status === 401) return 'Connectez-vous pour gérer les notifications.';
  if (status === 429) return 'Trop de tentatives. Patientez une minute.';
  if (status === 0) return 'Le service de notifications est injoignable. Vérifiez votre connexion.';
  return 'Le service de notifications est momentanément indisponible.';
}

export interface PushConfig {
  vapidPublicKey: string | null;
  pushConfigured: boolean;
}

/**
 * Configuration d'envoi du serveur, en UN appel.
 *
 * Séparée de `readPushServerState` à dessein : activer les notifications n'a
 * besoin que de la clé. Lire la liste des appareils pour l'ignorer
 * transformerait une activation en deux allers-retours, dont un que le panneau
 * refait de toute façon juste après.
 */
export async function readPushConfig(): Promise<PushConfig> {
  if (isLocalMode) {
    return { vapidPublicKey: null, pushConfigured: false };
  }

  const config = await invoke<{ vapid_public_key: string | null; push_configured: boolean }>(FUNCTION_NAME, {
    action: 'config',
  });

  return { vapidPublicKey: config?.vapid_public_key ?? null, pushConfigured: Boolean(config?.push_configured) };
}

/** Clé VAPID du serveur et appareils enregistrés pour le compte connecté. */
export async function readPushServerState(): Promise<PushServerState> {
  if (isLocalMode) {
    return { vapidPublicKey: null, pushConfigured: false, devices: [] };
  }

  const [config, devices] = await Promise.all([readPushConfig(), invoke<PushDevice[]>(FUNCTION_NAME, { action: 'list' })]);

  return {
    vapidPublicKey: config.vapidPublicKey,
    pushConfigured: config.pushConfigured,
    devices: Array.isArray(devices) ? devices : [],
  };
}

// ---------------------------------------------------------------------------
// Abonnement
// ---------------------------------------------------------------------------

/** Abonnement du navigateur, sous la forme transmise à l'Edge Function. */
export interface BrowserSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

function readSubscription(subscription: PushSubscription): BrowserSubscription | null {
  const json = subscription.toJSON() as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: Record<string, string>;
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

/** Le `applicationServerKey` d'un abonnement, sous forme d'octets. */
function subscriptionKeyBytes(subscription: PushSubscription): Uint8Array | null {
  const key = subscription.options?.applicationServerKey;
  if (!key) return null;
  return new Uint8Array(key as ArrayBuffer);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

/**
 * Abonnement du navigateur pour la clé VAPID courante, en le recréant si
 * nécessaire.
 *
 * L'argument n'est pas décoratif : une rotation de clé VAPID laisse dans le
 * navigateur un abonnement enregistré pour l'ANCIENNE clé, que le service Push
 * refusera silencieusement. Et `pushManager.subscribe()` lève alors
 * `InvalidStateError` sur un abonnement existant — sans ce contrôle, l'activation
 * resterait cassée sur tous les appareils ayant déjà activé les notifications,
 * et pour toujours.
 */
export async function ensureBrowserSubscription(vapidPublicKey: string): Promise<BrowserSubscription> {
  const registration = await navigator.serviceWorker.ready;
  const expected = decodeVapidKey(vapidPublicKey);
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    const currentKey = subscriptionKeyBytes(existing);
    if (currentKey && sameBytes(currentKey, expected)) {
      const state = readSubscription(existing);
      if (state) return state;
    }
    // Clé différente, ou abonnement incomplet : il est inutilisable, on le
    // résilie avant d'en demander un nouveau.
    await existing.unsubscribe();
  }

  const created = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected as BufferSource,
  });

  const state = readSubscription(created);
  if (!state) {
    throw new Error('Le navigateur n’a pas fourni de clés d’abonnement.');
  }
  return state;
}

export interface PushSetupResult {
  state: PushPermissionState;
  registered: boolean;
  message: string;
}

/**
 * Demande l'autorisation, crée l'abonnement et l'enregistre côté serveur.
 *
 * L'ordre compte : l'abonnement n'est créé qu'après avoir lu la clé VAPID du
 * serveur, et il n'est transmis qu'après l'accord de l'utilisateur. Créer
 * d'abord l'abonnement puis échouer sur la clé laisserait un abonnement
 * registered nowhere, que le navigateur conserverait et rejouerait à la
 * prochaine visite.
 */
export async function enablePush(): Promise<PushSetupResult> {
  if (isLocalMode) {
    return {
      state: getPushPermissionState(),
      registered: false,
      message: 'Le mode démonstration n’envoie aucune notification.',
    };
  }
  if (!isPushSupported()) {
    return { state: 'indisponible', registered: false, message: pushPermissionHints.indisponible };
  }

  const state = getPermissionState(await Notification.requestPermission());
  if (state !== 'autorise') {
    return { state, registered: false, message: pushPermissionHints[state] };
  }

  const { vapidPublicKey, pushConfigured } = await readPushConfig();
  if (!pushConfigured || !vapidPublicKey) {
    return {
      state: 'autorise',
      registered: false,
      message: 'Le service de notifications n’est pas configuré sur ce serveur (clé VAPID absente).',
    };
  }

  const subscription = await ensureBrowserSubscription(vapidPublicKey);

  await invoke(FUNCTION_NAME, {
    action: 'subscribe',
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    expirationTime: subscription.expirationTime,
    userAgent: navigator.userAgent,
  });

  return { state: 'autorise', registered: true, message: 'Notifications activées sur cet appareil.' };
}

export interface PushDisableResult {
  state: PushPermissionState;
  /** L'abonnement a été résilié DANS le navigateur. */
  unsubscribed: boolean;
  /** Le serveur a confirmé la révocation. */
  serverConfirmed: boolean;
}

/**
 * Résilie l'abonnement du navigateur, puis son enregistrement serveur.
 *
 * Les deux étapes sont rapportées SÉPARÉMENT : un réseau coupé après la
 * résiliation locale laisse le serveur convinced que l'appareil existe encore.
 * Affirmer « désactivé » dans ce cas afficherait un état que rien ne garantit,
 * et l'appareil continuerait de recevoir des rappels que l'utilisateur croit
 * avoir coupés.
 */
export async function disablePush(): Promise<PushDisableResult> {
  let unsubscribed = false;
  let serverConfirmed = false;

  if (isPushSupported()) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      if (subscription) {
        unsubscribed = await subscription.unsubscribe();
      }
      if (endpoint && !isLocalMode) {
        // Le serveur est prévenu APRÈS la résiliation locale : dans l'autre
        // sens, un échec réseau laisserait un endpoint actif que plus rien ne
        // réessaiera.
        try {
          const result = await invoke<{ removed?: boolean }>(FUNCTION_NAME, { action: 'unsubscribe', endpoint });
          serverConfirmed = result?.removed === true;
        } catch {
          serverConfirmed = false;
        }
      }
    } catch {
      // Le navigateur refuse parfois de désabonner : l'état affiché doit alors
      // refléter la réalité, et non l'intention.
    }
  }

  return { state: getPushPermissionState(), unsubscribed, serverConfirmed };
}

/**
 * Demande un envoi de test sur les appareils du compte connecté.
 *
 * Le message est écrit par la base, pas par le client : `push-notify` refuse
 * tout envoi en mode `user` qui ne soit pas un test, et la notification de test
 * est produite par `public.due_push_notifications('test', …)`.
 */
export async function sendTestPush(): Promise<{ delivered: number; failed: number; dropped: number }> {
  const result = await invoke<{ delivered?: number; failed?: number; dropped?: number }>(NOTIFY_FUNCTION_NAME, {
    scope: 'test',
  });
  return {
    delivered: Number(result?.delivered ?? 0),
    failed: Number(result?.failed ?? 0),
    dropped: Number(result?.dropped ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Préférences : elles vivent sur le profil, pas dans le navigateur
// ---------------------------------------------------------------------------

/** Colonnes de `profiles` pilotées par les interrupteurs du panneau. */
export function toProfileColumns(preferences: ReminderPreferences) {
  return {
    reminder_frequency: preferences.frequency,
    task_reminders_enabled: preferences.taskReminders,
    event_reminders_enabled: preferences.eventReminders,
    routine_reminders_enabled: preferences.routineReminders,
  };
}

export function fromProfileColumns(row: {
  reminder_frequency?: ReminderFrequency | null;
  task_reminders_enabled?: boolean | null;
  event_reminders_enabled?: boolean | null;
  routine_reminders_enabled?: boolean | null;
}): ReminderPreferences {
  return {
    frequency: row.reminder_frequency ?? defaultReminderPreferences.frequency,
    taskReminders: row.task_reminders_enabled ?? defaultReminderPreferences.taskReminders,
    eventReminders: row.event_reminders_enabled ?? defaultReminderPreferences.eventReminders,
    routineReminders: row.routine_reminders_enabled ?? defaultReminderPreferences.routineReminders,
  };
}
