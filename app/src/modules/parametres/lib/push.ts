import type { ReminderFrequency } from '../types';

/**
 * Notifications push : implémentation minimale côté client.
 *
 * Ce module se contente de l'autorisation du navigateur, de l'abonnement
 * `PushManager` et du stockage local des préférences de rappel. Il ne crée
 * aucune Edge Function : l'envoi reste à faire côté serveur.
 *
 * Reste à faire avant une mise en production des notifications :
 *  1. générer une paire de clés VAPID et exposer `VITE_VAPID_PUBLIC_KEY`
 *     (la clé privée reste dans le secret manager, jamais dans le bundle) ;
 *  2. une Edge Function `push-subscribe` (`auth: 'user'`) qui enregistre
 *     l'abonnement par membre et par foyer, révocable et limitée par la RLS ;
 *  3. une Edge Function d'envoi qui utilise la clé privée VAPID, appelée par
 *     `pg_cron` au moment de l'évaluation des rappels ;
 *  4. un accusé de réception et une politique de désinscription ;
 *  5. une migration ajoutant les préférences de notification au profil.
 */

export type PushPermissionState = 'non_demande' | 'demande' | 'autorise' | 'refuse' | 'indisponible';

export interface ReminderPreferences {
  frequency: ReminderFrequency;
  taskReminders: boolean;
  eventReminders: boolean;
}

export const pushPermissionLabels: Record<PushPermissionState, string> = {
  non_demande: 'Non demandé',
  demande: 'Demandé',
  autorise: 'Autorisé',
  refuse: 'Refusé',
  indisponible: 'Indisponible',
};

export const pushPermissionHints: Record<PushPermissionState, string> = {
  non_demande: 'Les rappels du foyer vous parviennent dès que vous les activez.',
  demande: 'La demande d’autorisation a été envoyée au navigateur.',
  autorise: 'Les rappels push sont activés sur cet appareil.',
  refuse: 'Votre navigateur bloque les notifications. Autorisez-les dans les réglages du site.',
  indisponible: 'Ce navigateur ne gère pas les notifications push, ou la page n’est pas sécurisée (HTTPS).',
};

const PREFERENCES_KEY = 'ensemble-organises-notifications';
const SUBSCRIPTION_KEY = 'ensemble-organises-push-subscription';

export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const defaultReminderPreferences: ReminderPreferences = {
  frequency: 'immediat',
  taskReminders: true,
  eventReminders: true,
};

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponible';
  if (!isPushSupported()) return 'indisponible';
  return Notification.permission as PushPermissionState;
}

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export interface PushSubscriptionState {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

/** Abonnement courant, persisté localement en attendant l'Edge Function. */
export function readStoredSubscription(): PushSubscriptionState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_KEY);
    return raw ? (JSON.parse(raw) as PushSubscriptionState) : null;
  } catch {
    return null;
  }
}

function storeSubscription(subscription: PushSubscriptionState) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
  } catch {
    // Stockage indisponible : l'abonnement ne sera pas rejoué au prochain visite.
  }
}

/**
 * Demande l'autorisation puis crée l'abonnement. L'abonnement obtenu doit être
 * transmis à l'Edge Function `push-subscribe` : rien n'est envoyé ici.
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!isPushSupported()) return 'indisponible';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushPermissionState;
  if (!vapidPublicKey) return 'autorise';
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey) as BufferSource,
    });
    const json = subscription.toJSON() as { endpoint?: string; expirationTime?: number | null; keys?: Record<string, string> };
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      storeSubscription({ endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    }
  } catch {
    // L'autorisation est accordée mais l'abonnement échoue : l'état reste
    // « autorisé » et l'Edge Function décidera du repli (e-mail, par exemple).
  }
  return 'autorise';
}

export async function clearPushSubscription(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(SUBSCRIPTION_KEY);
    } catch {
      // Rien à faire : le cache local sera vidé depuis l'onglet Application.
    }
  }
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // L'abstraction navigateur peut refuser : l'état local reste effacé.
  }
}

export function readReminderPreferences(): ReminderPreferences {
  if (typeof localStorage === 'undefined') return defaultReminderPreferences;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    return raw ? { ...defaultReminderPreferences, ...(JSON.parse(raw) as Partial<ReminderPreferences>) } : defaultReminderPreferences;
  } catch {
    return defaultReminderPreferences;
  }
}

export function saveReminderPreferences(preferences: ReminderPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Préférences conservées pour la session courante uniquement.
  }
}
