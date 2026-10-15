import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBarcodeScanner, toScanFormat, type ScanResult } from './use-barcode-scanner';

/**
 * Le scanner travaille sur deux API que jsdom n'implémente pas : `BarcodeDetector`
 * et `navigator.mediaDevices.getUserMedia`. Les doublures posées ici ne
 * simulent donc pas la caméra — elles rendent observables les décisions du
 * hook (quel moteur, quel flux libéré, quel format normalisé). Ce qu'un test
 * jsdom ne peut PAS prouver : qu'un vrai flux vidéo est effectivement coupé
 * côté navigateur. Il ne prouve que l'appel à `track.stop()` — qui est le
 * contrat vérifiable de ce côté-ci de la frontière.
 */

// `html5-qrcode` est importé dynamiquement par le hook : la doublure doit
// exister avant cet import, d'où `vi.hoisted`.
const html5 = vi.hoisted(() => {
  class FakeHtml5Qrcode {
    static instances: FakeHtml5Qrcode[] = [];
    readonly hostId: string;
    readonly config: unknown;
    success: ((text: string, result: unknown) => void) | null = null;
    startCalls = 0;
    stopCalls = 0;
    constructor(hostId: string, config: unknown) {
      this.hostId = hostId;
      this.config = config;
      FakeHtml5Qrcode.instances.push(this);
    }
    start(camera: unknown, config: unknown, onSuccess: (text: string, result: unknown) => void): Promise<void> {
      void camera;
      void config;
      this.startCalls += 1;
      this.success = onSuccess;
      return Promise.resolve();
    }
    stop(): Promise<void> {
      this.stopCalls += 1;
      return Promise.resolve();
    }
  }
  return { FakeHtml5Qrcode };
});

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: html5.FakeHtml5Qrcode,
  // Valeurs réelles de l'énumération `html5-qrcode` (vérifiées dans
  // `node_modules/html5-qrcode/core.d.ts`) : QR_CODE = 0, CODE_128 = 5, EAN_13 = 9.
  Html5QrcodeSupportedFormats: { QR_CODE: 0, CODE_128: 5, EAN_13: 9 },
}));

function makeStream(trackCount = 1) {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }));
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  return { stream, tracks };
}

function setMediaDevices(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
}

function clearMediaDevices() {
  delete (navigator as unknown as Record<string, unknown>).mediaDevices;
}

function setBarcodeDetector(ctor: unknown) {
  (globalThis as unknown as Record<string, unknown>).BarcodeDetector = ctor;
}

function clearBarcodeDetector() {
  delete (globalThis as unknown as Record<string, unknown>).BarcodeDetector;
}

/** `<video>` détaché du document, mais rattaché à un conteneur qui porte un id. */
function makeVideo(): HTMLVideoElement {
  const host = document.createElement('div');
  host.id = 'scan-host';
  const video = document.createElement('video');
  host.appendChild(video);
  video.play = vi.fn(() => Promise.resolve()) as unknown as typeof video.play;
  video.pause = vi.fn();
  return video;
}

beforeEach(() => {
  html5.FakeHtml5Qrcode.instances.length = 0;
  // Une frame ne doit jamais relancer la boucle dans un test : on rend le
  // rappel inerte, la boucle `pump` s'exécute alors exactement une fois.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  clearMediaDevices();
  clearBarcodeDetector();
  vi.unstubAllGlobals();
});

/** Monte le hook sur le repli `html5-qrcode` et rend la doublure pour la piloter. */
async function startFallback() {
  clearBarcodeDetector();
  setMediaDevices(vi.fn(async () => makeStream().stream));
  const onDetected = vi.fn();
  const view = renderHook(() => useBarcodeScanner(onDetected));
  const video = makeVideo();
  await act(async () => {
    await view.result.current.start(video);
  });
  const scanner = html5.FakeHtml5Qrcode.instances.at(-1);
  if (!scanner) throw new Error('le repli html5-qrcode n’a pas été instancié');
  return { ...view, onDetected, video, scanner };
}

/** Monte le hook avec un `BarcodeDetector` donné, caméra simulée et `<video>` détaché. */
async function startWithDetector(ctor: unknown) {
  setBarcodeDetector(ctor);
  setMediaDevices(vi.fn(async () => makeStream().stream));
  const onDetected = vi.fn();
  const view = renderHook(() => useBarcodeScanner(onDetected));
  const video = makeVideo();
  await act(async () => {
    await view.result.current.start(video);
  });
  return { ...view, onDetected, video };
}

/** Monte le hook sur le moteur natif `BarcodeDetector` et rend le détecteur posé. */
async function startNative(detect: (video: unknown) => Promise<Array<{ rawValue?: string; format?: string }>>) {
  const constructed: Array<{ formats: string[] }> = [];
  class FakeDetector {
    constructor(options: { formats: string[] }) {
      constructed.push(options);
    }
    detect = (source: unknown) => detect(source);
  }
  const view = await startWithDetector(FakeDetector);
  return { ...view, constructed };
}

describe('useBarcodeScanner — le repli lit le NOM du format (WR-15a)', () => {
  it('enregistre un QR lu par le repli comme `qr_code`, jamais comme code-barres', async () => {
    const { scanner, onDetected } = await startFallback();
    act(() => {
      scanner.success?.('628411903312', { result: { format: { format: 0, formatName: 'QR_CODE' } } });
    });
    const scan = onDetected.mock.calls.at(-1)?.[0] as ScanResult | undefined;
    expect(scan).toEqual({ value: '628411903312', format: 'qr_code' });
  });

  it('mappe `CODE_128` et `EAN_13` du repli sur leur ScanFormat', async () => {
    const code128 = await startFallback();
    act(() => {
      code128.scanner.success?.('ABC123', { result: { format: { format: 5, formatName: 'CODE_128' } } });
    });
    expect(code128.onDetected.mock.calls.at(-1)?.[0]).toEqual({ value: 'ABC123', format: 'code_128' });

    const ean13 = await startFallback();
    act(() => {
      ean13.scanner.success?.('6284119033120', { result: { format: { format: 9, formatName: 'EAN_13' } } });
    });
    expect(ean13.onDetected.mock.calls.at(-1)?.[0]).toEqual({ value: '6284119033120', format: 'ean_13' });
  });

  it('range un nom inconnu ou absent en `other`, sans lever', async () => {
    const unknown = await startFallback();
    act(() => {
      unknown.scanner.success?.('X', { result: { format: { format: 6, formatName: 'DATA_MATRIX' } } });
    });
    expect(unknown.onDetected.mock.calls.at(-1)?.[0]).toEqual({ value: 'X', format: 'other' });

    const absent = await startFallback();
    act(() => {
      absent.scanner.success?.('Y', { result: { format: { format: 6 } } });
    });
    expect(absent.onDetected.mock.calls.at(-1)?.[0]).toEqual({ value: 'Y', format: 'other' });
  });

  it('laisse le chemin natif inchangé : le format vient de `BarcodeDetector`', async () => {
    const { onDetected } = await startNative(async () => [{ rawValue: 'NATIF-1', format: 'qr_code' }]);
    await waitFor(() => expect(onDetected).toHaveBeenCalledTimes(1));
    expect(onDetected.mock.calls[0]?.[0]).toEqual({ value: 'NATIF-1', format: 'qr_code' });
  });

  it('rogne la valeur lue et ignore une valeur vide ou blanche', async () => {
    const trimmed = await startNative(async () => [{ rawValue: '  42  ', format: 'code_128' }]);
    await waitFor(() => expect(trimmed.onDetected).toHaveBeenCalledTimes(1));
    expect(trimmed.onDetected.mock.calls[0]?.[0]).toEqual({ value: '42', format: 'code_128' });

    const blank = await startNative(async () => [{ rawValue: '   ' }]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(blank.onDetected).not.toHaveBeenCalled();
  });
});

describe('useBarcodeScanner — un format non supporté bascule sur le repli (WR-15b)', () => {
  it('ne demande au détecteur natif que les formats qu’il supporte réellement', async () => {
    const constructed: Array<{ formats: string[] }> = [];
    class PartialDetector {
      static getSupportedFormats = async () => ['qr_code'];
      constructor(options: { formats: string[] }) {
        constructed.push(options);
      }
      detect = async () => [];
    }
    const { result } = await startWithDetector(PartialDetector);
    expect(constructed).toEqual([{ formats: ['qr_code'] }]);
    expect(result.current.engine).toBe('native');
  });

  it('construit le détecteur avec les trois formats demandés quand getSupportedFormats est absent', async () => {
    const constructed: Array<{ formats: string[] }> = [];
    class BareDetector {
      constructor(options: { formats: string[] }) {
        constructed.push(options);
      }
      detect = async () => [];
    }
    const { result } = await startWithDetector(BareDetector);
    expect(constructed).toEqual([{ formats: ['qr_code', 'code_128', 'ean_13'] }]);
    expect(result.current.engine).toBe('native');
  });

  it('un constructeur qui lève poursuit en repli, jamais en `error`', async () => {
    class ThrowingDetector {
      static getSupportedFormats = async () => ['qr_code', 'code_128', 'ean_13'];
      constructor() {
        throw new DOMException('format refusé', 'NotSupportedError');
      }
      detect = async () => [];
    }
    const { result } = await startWithDetector(ThrowingDetector);
    // Le repli est instancié et lit tous les formats demandés, CODE_128 compris.
    const scanner = html5.FakeHtml5Qrcode.instances.at(-1);
    expect(scanner).toBeDefined();
    expect((scanner?.config as { formatsToSupport?: number[] })?.formatsToSupport).toEqual([0, 5, 9]);
    expect(result.current.engine).toBe('fallback');
    expect(result.current.status).toBe('scanning');
    expect(result.current.error).toBeNull();
  });

  it('un tableau de formats supportés vide bascule en repli, sans construire de détecteur', async () => {
    let constructed = 0;
    class EmptyDetector {
      static getSupportedFormats = async () => [];
      constructor() {
        constructed += 1;
      }
      detect = async () => [];
    }
    const { result } = await startWithDetector(EmptyDetector);
    expect(constructed).toBe(0);
    expect(result.current.engine).toBe('fallback');
    expect(result.current.status).toBe('scanning');
  });

  it('un refus de caméra reste `denied` — le repli ne masque pas une autorisation refusée', async () => {
    clearBarcodeDetector();
    setMediaDevices(
      vi.fn(async () => {
        throw Object.assign(new Error('refus'), { name: 'NotAllowedError' });
      }),
    );
    const onDetected = vi.fn();
    const view = renderHook(() => useBarcodeScanner(onDetected));
    const video = makeVideo();
    await act(async () => {
      await view.result.current.start(video);
    });
    expect(view.result.current.status).toBe('denied');
    expect(view.result.current.engine).toBeNull();
  });
});

describe('useBarcodeScanner — fermer pendant l’ouverture coupe la caméra (WR-15c)', () => {
  it('arrête le flux résolu APRÈS un stop pendant l’ouverture, sans play ni detect', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const detect = vi.fn(async () => []);
    class NativeDetector {
      constructor(_options: { formats: string[] }) {
        void _options;
      }
      detect = detect;
    }
    setBarcodeDetector(NativeDetector);
    setMediaDevices(vi.fn(() => pending));
    const onDetected = vi.fn();
    const view = renderHook(() => useBarcodeScanner(onDetected));
    const video = makeVideo();
    await act(async () => {
      void view.result.current.start(video);
    });
    expect(view.result.current.status).toBe('starting');

    act(() => {
      view.result.current.stop();
    });

    const { stream, tracks } = makeStream(2);
    await act(async () => {
      resolveStream(stream);
      await pending;
    });

    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(tracks[1]?.stop).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('idle');
  });

  it('stop() après un démarrage complet libère le flux, annule la frame et remet l’état à idle', async () => {
    const { stream, tracks } = makeStream();
    setMediaDevices(vi.fn(async () => stream));
    clearBarcodeDetector();
    const view = renderHook(() => useBarcodeScanner(vi.fn()));
    const video = makeVideo();
    await act(async () => {
      await view.result.current.start(video);
    });
    expect(view.result.current.engine).toBe('fallback');

    act(() => {
      view.result.current.stop();
    });

    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalled();
    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.engine).toBeNull();
  });

  it('le démontage pendant l’ouverture coupe le flux qui arrive ensuite', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    setMediaDevices(vi.fn(() => pending));
    clearBarcodeDetector();
    const view = renderHook(() => useBarcodeScanner(vi.fn()));
    await act(async () => {
      void view.result.current.start(makeVideo());
    });

    view.unmount();

    const { stream, tracks } = makeStream();
    await act(async () => {
      resolveStream(stream);
      await pending;
    });

    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('stop() est idempotent : deux appels ne rappellent pas le repli', async () => {
    const { result, scanner } = await startFallback();
    act(() => {
      result.current.stop();
    });
    act(() => {
      result.current.stop();
    });
    expect(scanner.stopCalls).toBe(1);
    expect(result.current.status).toBe('idle');
  });

  it('un detect() qui résout après stop() n’appelle jamais onDetected', async () => {
    let resolveDetect!: (codes: Array<{ rawValue?: string; format?: string }>) => void;
    const pending = new Promise<Array<{ rawValue?: string; format?: string }>>((resolve) => {
      resolveDetect = resolve;
    });
    class SlowDetector {
      constructor(_options: { formats: string[] }) {
        void _options;
      }
      detect = () => pending;
    }
    const { result, onDetected } = await startWithDetector(SlowDetector);
    expect(result.current.engine).toBe('native');

    act(() => {
      result.current.stop();
    });

    await act(async () => {
      resolveDetect([{ rawValue: 'APRES-STOP', format: 'qr_code' }]);
      await pending;
      await Promise.resolve();
    });

    expect(onDetected).not.toHaveBeenCalled();
  });
});

describe('toScanFormat — une seule table de correspondance', () => {
  it('lit le nom stable', () => {
    expect(toScanFormat('QR_CODE')).toBe('qr_code');
    expect(toScanFormat('CODE_128')).toBe('code_128');
    expect(toScanFormat('EAN_13')).toBe('ean_13');
    expect(toScanFormat('DATA_MATRIX')).toBe('other');
    expect(toScanFormat(undefined)).toBe('other');
  });

  it('accepte l’entier d’énumération en second recours, avec les vraies valeurs', () => {
    // QR_CODE = 0, CODE_128 = 5, EAN_13 = 9 dans `html5-qrcode`.
    expect(toScanFormat(0)).toBe('qr_code');
    expect(toScanFormat(5)).toBe('code_128');
    expect(toScanFormat(9)).toBe('ean_13');
    // Les entiers voisins ne doivent PAS être confondus : un entier non mappé
    // reste `other`, il n'est jamais deviné.
    expect(toScanFormat(1)).toBe('other');
    expect(toScanFormat(3)).toBe('other');
    expect(toScanFormat(6)).toBe('other');
  });
});
