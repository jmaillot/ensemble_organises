/**
 * Service worker : la rotation d'abonnement (D-04, IN-04).
 *
 * Le worker n'est pas importable tel quel sous jsdom : il consomme trois
 * modules Workbox au chargement et s'appuie sur des globales du scope worker
 * (`self`, `caches`) que jsdom ne fournit pas. Ce fichier installe donc un
 * `self` factice AVANT l'import — le module enregistre ses gestionnaires au
 * chargement, il n'y a pas de seconde chance — puis appelle les gestionnaires
 * capturés comme le ferait le navigateur.
 *
 * `Request` est doublé aussi : Node exige une URL absolue là où le scope worker
 * en résout une relative, et sans ce double l'écriture du reçu lèverait avant
 * même d'atteindre `put` — le test ne regarderait alors rien.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }));
vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(() => vi.fn()),
}));
vi.mock('workbox-routing', () => ({ NavigationRoute: vi.fn(), registerRoute: vi.fn() }));

/** Gestionnaire enregistré par le worker, quel que soit son type réel. */
type WorkerHandler = (event: unknown) => void;

const handlers = new Map<string, Set<WorkerHandler>>();

function registerHandler(type: string, handler: WorkerHandler): void {
  const set = handlers.get(type) ?? new Set<WorkerHandler>();
  set.add(handler);
  handlers.set(type, set);
}

function handlerFor(type: string): WorkerHandler {
  const set = handlers.get(type);
  if (!set || set.size === 0) {
    throw new Error(`le worker n'a enregistré aucun gestionnaire « ${type} »`);
  }
  return [...set][0];
}

/** Ce que le worker a écrit dans l'API Cache, par URL. */
let written: Map<string, unknown>;
/** Ce que le worker a envoyé aux onglets ouverts. */
let postMessages: Array<Record<string, unknown>>;
/** Le `subscribe` du `pushManager` du worker. */
let subscribe: ReturnType<typeof vi.fn>;

/** Installe les globales du scope worker que `import('./sw')` consomme. */
function installWorkerScope(): void {
  written = new Map<string, unknown>();
  postMessages = [];
  subscribe = vi.fn();

  const windowClient = {
    visibilityState: 'visible',
    url: 'https://app.exemple.fr/accueil',
    focus: vi.fn(async () => undefined),
    postMessage: vi.fn((message: Record<string, unknown>) => {
      postMessages.push(message);
    }),
  };

  const cache = {
    put: vi.fn(async (request: unknown, response: unknown) => {
      const key = typeof request === 'string' ? request : (request as { url: string }).url;
      written.set(key, JSON.parse(await (response as { text: () => Promise<string> }).text()));
    }),
    match: vi.fn(async (key: string) => {
      const stored = written.get(key);
      return stored === undefined ? null : { json: async () => stored };
    }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  vi.stubGlobal(
    'Request',
    class {
      readonly url: string;
      constructor(input: string) {
        this.url = input;
      }
    },
  );

  vi.stubGlobal('self', {
    skipWaiting: vi.fn(),
    __WB_MANIFEST: [],
    location: { origin: 'https://app.exemple.fr' },
    clients: { matchAll: vi.fn(async () => [windowClient]) },
    registration: { pushManager: { subscribe }, showNotification: vi.fn() },
    addEventListener: vi.fn((type: string, handler: WorkerHandler) => registerHandler(type, handler)),
  });
}

beforeAll(async () => {
  installWorkerScope();
  await import('./sw');
});

beforeEach(() => {
  installWorkerScope();
});

/**
 * L'événement de rotation, décrit structurellement : le type du DOM
 * (`PushSubscriptionChangeEvent`) n'existe que dans `sw.ts`, via sa référence
 * `lib="webworker"`, et le test ne doit pas en dépendre.
 */
interface RotationInput {
  newSubscription: { endpoint: string } | null;
  oldSubscription: { endpoint: string; options: { applicationServerKey: ArrayBuffer | null } } | null;
}

/** Déclenche le gestionnaire et attend la promesse qu'il a passée à `waitUntil`. */
async function runRotation(input: RotationInput): Promise<void> {
  const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
  handlerFor('pushsubscriptionchange')({ ...input, waitUntil });
  await (waitUntil.mock.calls[0][0] as Promise<unknown>);
}

describe('sw — rotation d’abonnement (D-04, IN-04)', () => {
  it('retient le nouvel abonnement, écrit un reçu durable et prévient les onglets', async () => {
    await runRotation({
      newSubscription: { endpoint: 'https://push.exemple.fr/neuf' },
      oldSubscription: null,
    });

    expect(written.get('/__push_rotation__')).toMatchObject({
      endpoint: 'https://push.exemple.fr/neuf',
      ok: true,
      error: null,
    });
    expect(postMessages).toContainEqual({
      type: 'EO_PUSH_ROTATED',
      endpoint: 'https://push.exemple.fr/neuf',
      ok: true,
    });
  });

  it('crée un abonnement avec la clé de l’ancien quand le navigateur n’en fournit pas', async () => {
    const oldKey = new Uint8Array([1, 2, 3, 4]);
    subscribe.mockResolvedValue({ endpoint: 'https://push.exemple.fr/recree' });

    await runRotation({
      newSubscription: null,
      oldSubscription: {
        endpoint: 'https://push.exemple.fr/ancien',
        options: { applicationServerKey: oldKey.buffer },
      },
    });

    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: oldKey.buffer });
    expect(written.get('/__push_rotation__')).toMatchObject({
      endpoint: 'https://push.exemple.fr/recree',
      ok: true,
    });
  });

  it('écrit l’échec dans le reçu et le signale, au lieu de l’avaler', async () => {
    const failure = new Error('abonnement refusé');
    failure.name = 'InvalidStateError';
    subscribe.mockRejectedValue(failure);

    await runRotation({ newSubscription: null, oldSubscription: null });

    const receipt = written.get('/__push_rotation__') as { ok: boolean; error: string | null };
    expect(receipt.ok).toBe(false);
    expect(receipt.error).toBe('InvalidStateError');
    expect(postMessages).toContainEqual({ type: 'EO_PUSH_ROTATED', endpoint: '', ok: false });
  });

  it('répond au ping EO_VERSION avec la version courante du worker', async () => {
    const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
    handlerFor('message')({ data: { type: 'EO_VERSION' }, waitUntil });
    await (waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(postMessages).toContainEqual({ type: 'EO_VERSION_REPLY', version: 'precache-push-v2' });
  });
});
