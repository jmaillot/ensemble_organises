import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QrCodeProps {
  value: string;
  size?: number;
  label: string;
  className?: string;
}

/**
 * Rendu du QR code d'invitation. Le module `qrcode` produit un SVG, donc
 * net à toutes les densités et imprimable.
 */
export function QrCode({ value, size = 168, label, className }: QrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: 'oklch(20% 0.02 240)', light: 'oklch(100% 0 0)' },
    })
      .then((result) => {
        if (active) setSvg(result);
      })
      .catch(() => {
        if (active) setSvg(null);
      });
    return () => {
      active = false;
    };
  }, [size, value]);

  return (
    <div className={className} role="img" aria-label={label} style={{ width: size, height: size }}>
      {svg ? (
        <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="size-full animate-pulse rounded-[11px] bg-accent-faint" aria-hidden="true" />
      )}
    </div>
  );
}
