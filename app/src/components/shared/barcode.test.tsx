import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarCode, normalizeBarcodeValue, resolveBarcodeFormat } from './barcode';

describe('BarCode', () => {
  it('choisit EAN-13 pour 12-13 chiffres, CODE128 sinon', () => {
    expect(resolveBarcodeFormat('628411903312')).toBe('EAN13');
    expect(resolveBarcodeFormat('6284 1190 3312')).toBe('EAN13');
    expect(resolveBarcodeFormat('LIB-4821-076')).toBe('CODE128');
    expect(resolveBarcodeFormat('99887766')).toBe('CODE128');
  });

  it('normalise les espaces pour EAN-13', () => {
    expect(normalizeBarcodeValue('6284 1190 3312')).toBe('628411903312');
    expect(normalizeBarcodeValue('  LIB-4821-076 ')).toBe('LIB-4821-076');
  });

  it('encode deux valeurs différentes en deux SVG différents', () => {
    const { container, rerender } = render(<BarCode value="628411903312" label="Carte A" />);
    const first = container.querySelector('svg')?.innerHTML ?? '';
    expect(first.length).toBeGreaterThan(0);

    rerender(<BarCode value="99887766" label="Carte B" />);
    const second = container.querySelector('svg')?.innerHTML ?? '';
    expect(second.length).toBeGreaterThan(0);
    expect(second).not.toBe(first);
  });

  it('retombe sur CODE128 quand le checksum EAN-13 est invalide', () => {
    render(<BarCode value="1234567890123" label="Checksum invalide" />);
    const svg = screen.getByLabelText('Checksum invalide').querySelector('svg');
    expect(svg?.innerHTML.length).toBeGreaterThan(0);
  });

  it('affiche un repli quand la valeur est vide', () => {
    render(<BarCode value="   " label="Vide" />);
    const target = screen.getByLabelText('Vide');
    expect(target.querySelector('.barcode-stripes')).not.toBeNull();
    // Le repli ne prive jamais le composant de son `<svg>` (D-12) : sans lui,
    // `svgRef.current` resterait `null` et la valeur suivante ne s'encoderait pas.
    expect(target.querySelector('svg')).not.toBeNull();
  });

  it('se rétablit sur le même composant monté après un échec d’encodage', () => {
    // « é » sort de l'alphabet CODE128 (B_CHARS = [\x20-\x7F\xC8-\xCF]) : la
    // valeur échoue à l'encodage, donc le repli rayé s'affiche.
    const { container, rerender } = render(<BarCode value="CARTE-é" label="Carte" />);

    const failedTarget = screen.getByLabelText('Carte');
    expect(failedTarget.querySelector('.barcode-stripes')).not.toBeNull();
    // Le `<svg ref>` est monté dans l'état `failed` : c'est ce qui rend le
    // rétablissement possible sans que rien n'ait changé entre-temps.
    expect(failedTarget.querySelector('svg')).not.toBeNull();

    rerender(<BarCode value="LIB-4821-076" label="Carte" />);

    const recoveredTarget = screen.getByLabelText('Carte');
    expect(recoveredTarget.querySelector('.barcode-stripes')).toBeNull();
    expect(container.querySelector('svg')?.innerHTML.length).toBeGreaterThan(0);
  });
});
