import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lecture d'un code-barres ou d'un QR code par la caméra.
 *
 * L'API native `BarcodeDetector` est utilisée quand le navigateur l'expose ;
 * sinon le repli `html5-qrcode` est chargé dynamiquement pour ne pas
 * l'embarquer dans le premier octet. Dans les deux cas le flux caméra est
 * demandé explicitement (`getUserMedia`), l'autorisation est vérifiée et le
 * flux est relâché à l'arrêt comme au démontage.
 */

/** Format lu, suffisant pour choisir le type de carte proposé ensuite. */
export type ScanFormat = 'qr_code' | 'code_128' | 'ean_13' | 'other';

export interface ScanResult {
  value: string;
  format: ScanFormat;
}

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'error';

export interface BarcodeScanner {
  /** Le navigateur sait lire un code (API native ou caméra accessible). */
  supported: boolean;
  status: ScannerStatus;
  error: string | null;
  /** Dernier code lu, conservé pour l'affichage d'état. */
  result: ScanResult | null;
  /** Moteur effectivement utilisé, pour masquer la `<video>` du repli. */
  engine: 'native' | 'fallback' | null;
  start: (video: HTMLVideoElement) => Promise<void>;
  stop: () => void;
}

const NATIVE_FORMATS = ['qr_code', 'code_128', 'ean_13'] as const;

interface NativeDetectedBarcode {
  rawValue?: string;
  format?: string;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<NativeDetectedBarcode[]>;
}

type NativeBarcodeDetectorCtor = new (options: { formats: string[] }) => NativeBarcodeDetector;

function nativeDetectorCtor(): NativeBarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof ctor === 'function' ? (ctor as NativeBarcodeDetectorCtor) : null;
}

function hasCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function isBarcodeScannerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return nativeDetectorCtor() !== null || hasCamera();
}

function toScanFormat(format: string | number | undefined): ScanFormat {
  if (format === 'qr_code' || format === 'QR_CODE') return 'qr_code';
  if (format === 'code_128' || format === 'CODE_128') return 'code_128';
  if (format === 'ean_13' || format === 'EAN_13') return 'ean_13';
  return 'other';
}

export function useBarcodeScanner(onDetected: (result: ScanResult) => void): BarcodeScanner {
  const [supported] = useState(isBarcodeScannerSupported);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [engine, setEngine] = useState<'native' | 'fallback' | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(false);
  const fallbackRef = useRef<{ stop: () => Promise<void> | void } | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const fallback = fallbackRef.current;
    fallbackRef.current = null;
    if (fallback) void Promise.resolve(fallback.stop()).catch(() => undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setEngine(null);
    setStatus('idle');
  }, []);

  useEffect(() => stop, [stop]);

  const handleValue = useCallback((value: string, format: string | number | undefined) => {
    const clean = value.trim();
    if (!clean || detectedRef.current) return;
    detectedRef.current = true;
    const scan: ScanResult = { value: clean, format: toScanFormat(format) };
    setResult(scan);
    onDetectedRef.current(scan);
  }, []);

  const start = useCallback(
    async (video: HTMLVideoElement) => {
      videoRef.current = video;
      detectedRef.current = false;
      setResult(null);
      setError(null);

      if (!hasCamera()) {
        setStatus('unsupported');
        setError('Cet appareil ne donne pas accès à la caméra. Saisissez le code à la main.');
        return;
      }

      setStatus('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        try {
          await video.play();
        } catch {
          // Le navigateur peut refuser la lecture automatique : la détection
          // native fonctionne malgré tout sur l'élément média.
        }

        const Ctor = nativeDetectorCtor();
        if (Ctor) {
          setEngine('native');
          setStatus('scanning');
          const detector = new Ctor({ formats: [...NATIVE_FORMATS] });
          const pump = async () => {
            if (detectedRef.current || !streamRef.current) return;
            try {
              const codes = await detector.detect(video);
              const first = codes[0];
              if (first?.rawValue) handleValue(first.rawValue, first.format);
            } catch {
              // Une frame illisible est sans conséquence : on continue.
            }
            frameRef.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => void pump()) : null;
          };
          void pump();
          return;
        }

        // Repli : `html5-qrcode` injecte sa propre vidéo dans le conteneur.
        const host = video.parentElement;
        if (!host?.id) throw new Error('Conteneur de scan sans identifiant.');
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(host.id, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
          ],
        });
        fallbackRef.current = { stop: () => scanner.stop() };
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, aspectRatio: 1.6, qrbox: { width: 260, height: 160 } },
          (decodedText, decodedResult) => handleValue(decodedText, decodedResult?.result?.format?.format),
          () => undefined,
        );
        setEngine('fallback');
        setStatus('scanning');
      } catch (caught) {
        const name = caught instanceof Error ? caught.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied');
          setError('Accès à la caméra refusé. Autorisez la caméra dans votre navigateur ou saisissez le code à la main.');
          return;
        }
        setStatus('error');
        setError('La caméra n’a pas pu démarrer. Vérifiez qu’aucune autre application ne l’utilise, ou saisissez le code à la main.');
      }
    },
    [handleValue],
  );

  return { supported, status, error, result, engine, start, stop };
}
