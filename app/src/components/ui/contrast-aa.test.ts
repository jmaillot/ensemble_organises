import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Garde de contraste WCAG AA (critique UI 2026-10-23, P1) : les paires
 * texte/fond des badges, pastilles et toasts doivent atteindre 4,5:1 —
 * un badge de 10-11 px n'est pas du « grand texte » (le seuil 3:1 ne
 * s'applique qu'à partir de 18,66 px gras). Les valeurs sont relues dans
 * app.css : le garde échoue si l'on retombe sur une paire trop claire
 * (le défaut d'origine : --color-coral #d95f5c sur --color-coral-soft
 * #f8e3e1 = 2,97:1).
 */

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../styles/app.css'), 'utf8');

function tokenValue(name: string): string {
  const match = css.match(new RegExp(`--color-${name}\\s*:\\s*([^;\\n]+)`));
  if (!match) throw new Error(`token --color-${name} introuvable dans app.css`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = f(((n >> 16) & 255) / 255);
  const g = f(((n >> 8) & 255) / 255);
  const b = f((n & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Convertit `oklch(L% C H)` en hexadécimal (matrices CSS Color 4) pour le calcul. */
function toHex(value: string): string {
  const oklch = value.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/);
  if (!oklch) return value;
  const L = parseFloat(oklch[1]) / (parseFloat(oklch[1]) > 1 ? 100 : 1);
  const C = parseFloat(oklch[2]);
  const H = (parseFloat(oklch[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const enc = (c: number) => {
    c = Math.min(1, Math.max(0, c));
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(v * 255);
  };
  return `#${[
    enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

const AA = 4.5;

describe('Contraste AA des paires token portées par des micro-textes', () => {
  it('le texte corail sur aplat coral-soft atteint 4,5:1 (Badge erreur, PriorityTag haute)', () => {
    const ratioValue = ratio(toHex(tokenValue('coral-text')), toHex(tokenValue('coral-soft')));
    expect(ratioValue).toBeGreaterThanOrEqual(AA);
  });

  it('le texte corail reste lisible sous un texte blanc (tonneau d’erreur du toast)', () => {
    const ratioValue = ratio('#ffffff', toHex(tokenValue('coral-text')));
    expect(ratioValue).toBeGreaterThanOrEqual(AA);
  });

  it('le texte amber sur aplat amber-soft atteint 4,5:1 (Badge, notes d’information)', () => {
    const ratioValue = ratio(toHex(tokenValue('amber-strong')), toHex(tokenValue('amber-soft')));
    expect(ratioValue).toBeGreaterThanOrEqual(AA);
  });

  it('le texte muted sur crème garde sa marge AA', () => {
    const ratioValue = ratio(toHex(tokenValue('muted')), toHex(tokenValue('bg')));
    expect(ratioValue).toBeGreaterThanOrEqual(AA);
  });

  it('la valeur d’origine qui échouait reste la référence du défaut (preuve que le garde voit le rouge)', () => {
    expect(ratio('#d95f5c', '#f8e3e1')).toBeLessThan(AA);
  });
});
