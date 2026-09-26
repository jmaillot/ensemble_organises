/**
 * Notifications push côté navigateur.
 *
 * Ces tests portent sur les moments où l'interface doit choisir entre deux
 * mensonges : dire « activé » sans abonnement enregistré côté serveur, ou
 * résilier un appareil avant d'avoir prévenu le serveur. Les deux sont
 * invisibles sans assertion, et tous deux se paient sur l'utilisateur.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/data', () => ({ isLocalMode: false }));
vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: true,
}));

import {
  defaultReminderPreferences,
  disablePush,
  enablePush,
  fromProfileColumns,
  getPushPermissionState,
  isPushSupported,
  readPushServerState,
  toProfileColumns,
} from './push';

// 65 octets de clé publique P-256 : 87 caractères base64url.
const VAPID_KEY = `B${'c'.repeat(86)}`;
const OTHER_VAPID_KEY = `D${'e'.repeat(86)}`;

interface FakeSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Le navigateur expose la clé de l'application sous `options`. */
  options: { applicationServerKey?: Uint8Array; userVisibleOnly: boolean };
  toJSON: () => unknown;
  unsubscribe: () => Promise<boolean>;
}

function decodeKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function makeSubscription(endpoint: string, key?: string): FakeSubscription {
  return {
    endpoint,
    keys: { p256dh: 'B'.repeat(87), auth: 'D'.repeat(22) },
    options: { applicationServerKey: key ? decodeKey(key) : undefined, userVisibleOnly: true },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'B'.repeat(87), auth: 'D'.repeat(22) } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

interface BrowserStubs {
  current: FakeSubscription | null;
  subscribe: ReturnType<typeof vi.fn>;
  permission: NotificationPermission;
}

let browser: BrowserStubs;

function installBrowser({ current, permission }: { current: FakeSubscription | null; permission: NotificationPermission }) {
  const subscribe = vi.fn(async () => makeSubscription('https://fcm.googleapis.com/fcm/send/neuf', VAPID_KEY));
  browser = { current, subscribe, permission };

  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: class {
      static permission = permission;
      static requestPermission = vi.fn(async () => permission);
    },
  });
}

function uninstallBrowser() {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
}

/** Réponse d'échec shaped comme celle que renvoie `@supabase/functions-js`. */
function httpError(status: number, body: unknown) {
  return {
    data: null,
    error: new Error('Edge Function returned a non-2xx status code'),
    response: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  };
}

beforeEach(() => {
  invoke.mockReset();
});

afterEach(() => {
  uninstallBrowser();
});

describe('capacités du navigateur', () => {
  it('déclare les notifications indisponibles quand le navigateur ne les gère pas', () => {
    uninstallBrowser();
    expect(isPushSupported()).toBe(false);
    expect(getPushPermissionState()).toBe('indisponible');
  });

  it('reconnaît un navigateur capable une fois les API présentes', () => {
    installBrowser({ current: null, permission: 'granted' });
    expect(isPushSupported()).toBe(true);
    expect(getPushPermissionState()).toBe('autorise');
  });
});

describe('état serveur', () => {
  it('lit la clé VAPID et les appareils, et signale une clé absente', async () => {
    installBrowser({ current: null, permission: 'granted' });
    invoke.mockResolvedValueOnce({ data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null });
    invoke.mockResolvedValueOnce({
      data: [
        {
          id: 'push_1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          device: 'Firefox sur Linux',
          created_at: '2026-09-01T08:00:00Z',
          last_success_at: null,
          failure_count: 0,
        },
      ],
      error: null,
    });

    const state = await readPushServerState();
    expect(state.pushConfigured).toBe(true);
    expect(state.vapidPublicKey).toBe(VAPID_KEY);
    expect(state.devices).toHaveLength(1);
    // Les clés de chiffrement ne doivent jamais être renvoyées au navigateur.
    expect(state.devices[0]).not.toHaveProperty('p256dh');
    expect(state.devices[0]).not.toHaveProperty('auth_secret');
  });

  it('remonte le message métier du serveur, pas un libellé générique', async () => {
    installBrowser({ current: null, permission: 'granted' });
    // Les deux lectures partent en parallèle : le mock route donc sur l'action,
    // et non sur l'ordre d'appel.
    invoke.mockImplementation(async (_name: string, options: { body: { action: string } }) =>
      options.body.action === 'list' ? httpError(409, { error: 'Aucun appareil enregistré sur ce compte.' }) : { data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null },
    );

    // Le corps de la réponse d'échec n'est pas consommé par la bibliothèque :
    // sans lecture explicite, l'utilisateur ne verrait qu'un 409 sans cause.
    await expect(readPushServerState()).rejects.toThrow('Aucun appareil enregistré sur ce compte.');
  });

  it('retombe sur un message lisible quand le corps est vide', async () => {
    installBrowser({ current: null, permission: 'granted' });
    // Une panne réseau ne produit aucune `Response` : c'est le cas que la
    // bibliothèque signale avec `response: undefined`.
    invoke.mockImplementation(async (_name: string, options: { body: { action: string } }) =>
      options.body.action === 'list'
        ? { data: null, error: new Error('FetchError'), response: undefined }
        : { data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null },
    );

    await expect(readPushServerState()).rejects.toThrow(/injoignable/i);
  });
});

describe('activation', () => {
  it('n’enregistre rien si l’utilisateur refuse', async () => {
    installBrowser({ current: null, permission: 'denied' });
    const result = await enablePush();

    expect(result.state).toBe('refuse');
    expect(result.registered).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('ne crée aucun abonnement quand le serveur n’a pas de clé VAPID', async () => {
    installBrowser({ current: null, permission: 'granted' });
    invoke.mockResolvedValueOnce({ data: { vapid_public_key: null, push_configured: false }, error: null });

    const result = await enablePush();

    // Créer l'abonnement avant de connaître la clé produirait un endpoint
    // enregistré nulle part, que le navigateur conserverait ensuite. Et lire la
    // clé seule suffit : la liste des appareils serait un appel de plus.
    expect(result.registered).toBe(false);
    expect(result.message).toMatch(/VAPID/);
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('enregistre l’abonnement créé pour la clé du serveur', async () => {
    installBrowser({ current: null, permission: 'granted' });
    invoke.mockResolvedValueOnce({ data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null });
    invoke.mockResolvedValueOnce({ data: [], error: null });
    invoke.mockResolvedValueOnce({ data: { id: 'push_1' }, error: null });

    const result = await enablePush();

    expect(result.registered).toBe(true);
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
    const subscribeCall = invoke.mock.calls.find((call) => (call[1] as { body?: { action?: string } })?.body?.action === 'subscribe');
    expect(subscribeCall).toBeTruthy();
    const body = (subscribeCall?.[1] as { body: { endpoint: string; keys: { p256dh: string; auth: string } } }).body;
    expect(body.endpoint).toBe('https://fcm.googleapis.com/fcm/send/neuf');
    expect(body.keys.p256dh).toHaveLength(87);
    expect(body.keys.auth).toHaveLength(22);
  });

  it('réutilise l’abonnement existant quand la clé VAPID n’a pas changé', async () => {
    installBrowser({ current: makeSubscription('https://fcm.googleapis.com/fcm/send/ancien', VAPID_KEY), permission: 'granted' });
    invoke.mockResolvedValueOnce({ data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null });
    invoke.mockResolvedValueOnce({ data: [], error: null });
    invoke.mockResolvedValueOnce({ data: { id: 'push_1' }, error: null });

    await enablePush();

    // Un second abonnement pour la même clé serait un doublon côté navigateur.
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  it('résilie et recrée l’abonnement après une rotation de clé VAPID', async () => {
    const obsolete = makeSubscription('https://fcm.googleapis.com/fcm/send/perime', OTHER_VAPID_KEY);
    installBrowser({ current: obsolete, permission: 'granted' });
    invoke.mockResolvedValueOnce({ data: { vapid_public_key: VAPID_KEY, push_configured: true }, error: null });
    invoke.mockResolvedValueOnce({ data: [], error: null });
    invoke.mockResolvedValueOnce({ data: { id: 'push_2' }, error: null });

    const result = await enablePush();

    // Sans cette résiliation, `subscribe()` lève InvalidStateError sur un
    // abonnement existant, et l'activation resterait cassée sur tous les
    // appareils ayant déjà activé les notifications.
    expect(obsolete.unsubscribe).toHaveBeenCalledTimes(1);
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
    expect(result.registered).toBe(true);
  });
});

describe('désactivation', () => {
  it('résilie l’appareil, puis prévient le serveur', async () => {
    const subscription = makeSubscription('https://fcm.googleapis.com/fcm/send/abc', VAPID_KEY);
    installBrowser({ current: subscription, permission: 'granted' });
    invoke.mockResolvedValue({ data: { removed: true }, error: null });

    const result = await disablePush();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.unsubscribed).toBe(true);
    expect(result.serverConfirmed).toBe(true);
    const unsubscribeCall = invoke.mock.calls.find(
      (call) => (call[1] as { body?: { action?: string } })?.body?.action === 'unsubscribe',
    );
    expect(unsubscribeCall).toBeTruthy();
  });

  it('ne prétend pas avoir désabonné un serveur injoignable', async () => {
    const subscription = makeSubscription('https://fcm.googleapis.com/fcm/send/abc', VAPID_KEY);
    installBrowser({ current: subscription, permission: 'granted' });
    invoke.mockResolvedValue(httpError(500, { error: 'Enregistrement impossible.' }));

    const result = await disablePush();

    // L'appareil est résilié localement, mais le serveur peut encore considérer
    // cet appareil actif : l'interface doit donc le montrer, et non annoncer
    // une désactivation que rien ne garantit.
    expect(result.unsubscribed).toBe(true);
    expect(result.serverConfirmed).toBe(false);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('préférences', () => {
  it('aller-retour entre les colonnes du profil et l’interface', () => {
    const preferences = { frequency: 'matin', taskReminders: false, eventReminders: true, routineReminders: false } as const;
    expect(fromProfileColumns(toProfileColumns(preferences))).toEqual(preferences);
  });

  it('complète les préférences absentes par les valeurs par défaut', () => {
    // Un profil antérieur à la migration 0018 n'a aucune de ces colonnes.
    expect(fromProfileColumns({})).toEqual(defaultReminderPreferences);
  });
});
