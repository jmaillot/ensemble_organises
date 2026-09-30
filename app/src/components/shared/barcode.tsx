import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

export interface BarCodeProps {
  value: string;
  label: string;
  className?: string;
}

/** Normalise la saisie pour le choix du format : espaces et tirets ignorés. */
function digitsOnly(value: string): string {
  return value.replace(/[\s-]+/g, '');
}

function isEan13Digits(value: string): boolean {
  return /^\d{12,13}$/.test(value);
}

/**
 * Choix du format d'encodage : EAN-13 pour 12-13 chiffres (codes caisse),
 * CODE128 dans tous les autres cas (alphanumérique, espaces internes).
 */
export function resolveBarcodeFormat(value: string): 'EAN13' | 'CODE128' {
  return isEan13Digits(digitsOnly(value)) ? 'EAN13' : 'CODE128';
}

/** Valeur effectivement encodée : chiffres seuls pour EAN-13, saisie sinon. */
export function normalizeBarcodeValue(value: string): string {
  const clean = value.trim();
  return resolveBarcodeFormat(clean) === 'EAN13' ? digitsOnly(clean) : clean;
}

/**
 * Rendu d'un vrai code-barres (SVG) à partir de `value`, scannable en caisse.
 * EAN-13 quand la valeur s'y prête, CODE128 sinon.
 */
export function BarCode({ value, label, className }: BarCodeProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const node = svgRef.current;
    const clean = value.trim();
    if (!node || !clean) {
      setFailed(true);
      return;
    }
    const format = resolveBarcodeFormat(clean);
    const encode = (formatToTry: 'EAN13' | 'CODE128', valueToEncode: string) => {
      JsBarcode(node, valueToEncode, {
        format: formatToTry,
        displayValue: false,
        background: '#ffffff',
        lineColor: '#101828',
        margin: 8,
        height: 64,
      });
    };
    try {
      encode(format, normalizeBarcodeValue(clean));
    } catch {
      // Une clé EAN-13 à checksum invalide retombe sur CODE128, toujours lisible.
      if (format === 'EAN13') {
        try {
          encode('CODE128', clean);
          return;
        } catch {
          // Tombe sur le repli texte ci-dessous.
        }
      }
      setFailed(true);
    }
  }, [value]);

  if (!value.trim() || failed) {
    return (
      <div className={className} role="img" aria-label={label}>
        <div className="barcode-stripes" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={className} role="img" aria-label={label}>
      <svg ref={svgRef} className="h-[76px] w-full rounded-[7px] bg-white" aria-hidden="true" />
    </div>
  );
}
