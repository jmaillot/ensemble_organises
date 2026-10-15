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

interface NativeBarcodeDetectorCtor {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  /** API statique, absente sur certaines implémentations partielles. */
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeDetectorCtor(): NativeBarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof ctor === 'function' ? (ctor as NativeBarcodeDetectorCtor) : null;
}

/**
 * Formats réellement supportés par un `BarcodeDetector` natif.
 *
 * `getSupportedFormats` est la seule source fiable : construire le détecteur
 * avec un format non supporté **lève** (WR-15b). Quand l'API statique est
 * absente ou défaillante, on suppose que les formats demandés le sont — c'est
 * l'ancien comportement, conservé comme repli tolérant.
 */
async function supportedNativeFormats(ctor: NativeBarcodeDetectorCtor): Promise<string[]> {
  if (typeof ctor.getSupportedFormats !== 'function') return [...NATIVE_FORMATS];
  try {
    const supported = await ctor.getSupportedFormats();
    if (!Array.isArray(supported)) return [...NATIVE_FORMATS];
    return NATIVE_FORMATS.filter((format) => supported.includes(format));
  } catch {
    return [...NATIVE_FORMATS];
  }
}

function hasCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Libère explicitement un flux caméra — sûr même si le flux a déjà été coupé. */
function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function isBarcodeScannerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return nativeDetectorCtor() !== null || hasCamera();
}

/**
 * Entier d'énumération `Html5QrcodeSupportedFormats` → `ScanFormat`.
 *
 * Le nom (`formatName`) est la forme **stable** que le repli renvoie et que
 * `toScanFormat` lit en premier. Cet entier n'est qu'un **second recours**
 * tolérant : il est là pour qu'un site d'appel qui passerait encore le nombre
 * d'énumération ne réintroduise pas le défaut WR-15a (un QR enregistré en
 * code-barres). Valeurs alignées sur `html5-qrcode` : `QR_CODE = 0`,
 * `CODE_128 = 5`, `EAN_13 = 9` (vérifiées dans `core.d.ts`).
 */
const ENUM_FORMAT: Readonly<Record<number, ScanFormat>> = { 0: 'qr_code', 5: 'code_128', 9: 'ean_13' };

/** Normalise un format lu (nom stable, ou entier d'énumération en recours). */
export function toScanFormat(format: string | number | undefined): ScanFormat {
  if (format === 'qr_code' || format === 'QR_CODE') return 'qr_code';
  if (format === 'code_128' || format === 'CODE_128') return 'code_128';
  if (format === 'ean_13' || format === 'EAN_13') return 'ean_13';
  if (typeof format === 'number' && format in ENUM_FORMAT) return ENUM_FORMAT[format] as ScanFormat;
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
  // WR-15c : une génération d'ouverture. `start` la capture et la compare
  // après chaque `await` ; `stop` l'incrémente. Un flux qui arrive après une
  // fermeture (ou une nouvelle ouverture) porte une génération périmée et est
  // coupé immédiatement, au lieu de rester allumé jusqu'au départ de la page.
  const generationRef = useRef(0);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const fallback = fallbackRef.current;
    // Mis à `null` AVANT l'appel : un second `stop()` ne rappelle pas le repli.
    fallbackRef.current = null;
    if (fallback) void Promise.resolve(fallback.stop()).catch(() => undefined);
    stopStream(streamRef.current);
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
      const generation = ++generationRef.current;
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
        // WR-15c : un `stop()` a pu passer pendant l'ouverture. On coupe le
        // flux qui vient d'arriver et on sort sans rien allumer.
        if (generationRef.current !== generation) {
          stopStream(stream);
          return;
        }
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
          // WR-15b : ne construire le détecteur qu'avec des formats qu'il
          // supporte — sinon `new BarcodeDetector` lève, et l'ancien `catch`
          // externe concluait `'error'` au lieu du repli promis.
          const formats = await supportedNativeFormats(Ctor);
          if (generationRef.current !== generation) {
            stopStream(stream);
            return;
          }
          if (formats.length > 0) {
            try {
              const detector = new Ctor({ formats });
              setEngine('native');
              setStatus('scanning');
              const pump = async () => {
                // WR-15c : la génération empêche une frame en vol après
                // `stop()` de relancer la boucle.
                if (detectedRef.current || !streamRef.current || generationRef.current !== generation) return;
                try {
                  const codes = await detector.detect(video);
                  if (generationRef.current !== generation) return;
                  const first = codes[0];
                  if (first?.rawValue) handleValue(first.rawValue, first.format);
                } catch {
                  // Une frame illisible est sans conséquence : on continue.
                }
                frameRef.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => void pump()) : null;
              };
              void pump();
              return;
            } catch {
              // Le détecteur refuse ces formats : on poursuit vers le repli,
              // jamais vers `'error'` — le repli est la promesse du hook.
            }
          }
        }

        // Repli : `html5-qrcode` injecte sa propre vidéo dans le conteneur.
        const host = video.parentElement;
        if (!host?.id) throw new Error('Conteneur de scan sans identifiant.');
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (generationRef.current !== generation) {
          stopStream(stream);
          return;
        }
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
          // WR-15a : le NOM du format, jamais l'entier d'énumération — c'est
          // `formatName` que `toScanFormat` sait lire ('QR_CODE', 'CODE_128'…).
          (decodedText, decodedResult) => handleValue(decodedText, decodedResult?.result?.format?.formatName),
          () => undefined,
        );
        if (generationRef.current !== generation) {
          fallbackRef.current = null;
          void Promise.resolve(scanner.stop()).catch(() => undefined);
          stopStream(stream);
          return;
        }
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
