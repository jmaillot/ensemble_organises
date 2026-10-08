#!/usr/bin/env python3
"""Génère les icônes PWA raster depuis app/public/icon.svg.

Chaîne choisie (aucune dépendance runtime ajoutée, Pillow du système requis
pour la génération uniquement) : le SVG ne contient que des formes simples
(rect arrondi, polyligne, cercle), redessinées ici à l'identique aux tailles
192 et 512. Les couleurs oklch du SVG sont converties en sRGB par les
formules standard (pas d'approximation visuelle).

Sécurité maskable : le fond couvre tout le canevas (full-bleed) et le motif
est inscrit dans ~76 % centraux, donc le rognage circulaire des lanceurs
Android ne coupe rien d'essentiel.

Usage : python3 scripts/generate-pwa-icons.py
"""

import math
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow requis : apt install python3-pil (génération uniquement, pas de dépendance runtime).")

ROOT = __file__.rsplit("/scripts/", 1)[0]
OUT = f"{ROOT}/app/public"

# Couleurs du SVG, en oklch(L, C, H°).
BG = (0.20, 0.02, 240.0)
STROKE = (0.56, 0.12, 170.0)
DOT = (0.64, 0.15, 32.0)


def oklch_to_srgb(L: float, C: float, h_deg: float) -> tuple[int, int, int]:
    """oklch -> sRGB 8 bits (formules de Björn Ottosson, D65)."""
    h = math.radians(h_deg)
    a = C * math.cos(h)
    b = C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l = l_ ** 3
    m = m_ ** 3
    s = s_ ** 3
    r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(u: float) -> int:
        u = min(max(u, 0.0), 1.0)
        v = 1.055 * (u ** (1 / 2.4)) - 0.055 if u > 0.0031308 else 12.92 * u
        return round(min(max(v, 0.0), 1.0) * 255)

    return (gamma(r_lin), gamma(g_lin), gamma(b_lin))


# Polyligne du SVG : M137 172, puis segments relatifs (paires implicites).
SVG_PATH = "M137 172 211 118l74 54 74-54 61 61-74 74 74 74-61 61-74-54-74 54-74-74-74 74-61-61 74-74-74-74 61-61 74 54Z"


def parse_path(d: str) -> list[tuple[float, float]]:
    import re

    # Le SVG omet les séparateurs devant un signe (« 74-54 » vaut 74 -54).
    tokens = re.findall(r"[MlmZ]|-?\d*\.?\d+", d)
    pts: list[tuple[float, float]] = []
    it = iter(tokens)
    x = y = 0.0
    for tok in it:
        if tok == "M":
            x, y = float(next(it)), float(next(it))
            pts.append((x, y))
        elif tok == "l":
            # Le reste jusqu'à Z est une suite de nombres (paires dx dy).
            rest = list(it)
            nums = [t for t in rest if t != "Z"]
            for i in range(0, len(nums), 2):
                x += float(nums[i])
                y += float(nums[i + 1])
                pts.append((x, y))
            break
    pts.append(pts[0])  # Z : referme.
    return pts


def draw_icon(size: int) -> Image.Image:
    bg = oklch_to_srgb(*BG)
    fg = oklch_to_srgb(*STROKE)
    dot = oklch_to_srgb(*DOT)
    img = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(img)

    # Mise à l'échelle : le motif SVG (512) est inscrit à 76 % pour la zone
    # de sécurité maskable, le fond restant full-bleed.
    art_scale = (size * 0.76) / 512.0
    ox = (size - 512 * art_scale) / 2
    oy = (size - 512 * art_scale) / 2

    def tr(p: tuple[float, float]) -> tuple[float, float]:
        return (ox + p[0] * art_scale, oy + p[1] * art_scale)

    pts = [tr(p) for p in parse_path(SVG_PATH)]
    d.line(pts, fill=fg, width=max(2, round(24 * art_scale)), joint="curve")

    cx, cy = tr((380, 384))
    r = 52 * art_scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dot)
    return img


def main() -> None:
    for size in (192, 512):
        img = draw_icon(size)
        path = f"{OUT}/icon-{size}.png"
        img.save(path, "PNG")
        print(f"écrit {path} ({size}x{size})")


if __name__ == "__main__":
    main()
