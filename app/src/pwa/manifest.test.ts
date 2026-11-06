import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pwaManifest } from '../../vite.config';

// Test du manifeste PWA — porte INST-01 (installabilité Chromium) ET DLNK-01
// (raccourcis). Le manifeste est figé au build : ces assertions sont la seule
// barrière automatisée contre la régression d'une icône, d'un raccourci ou de
// `display_override` (Wave 0 gap, 32-RESEARCH.md §Validation Architecture).
// Vitest peut être invoqué depuis la racine du dépôt comme depuis `app/`, et
// `import.meta.url` n'y est pas un schéma `file:` (fichier transformé) : on
// sonde les deux racines possibles de `public/`.
const publicCandidates = [join(process.cwd(), 'app', 'public'), join(process.cwd(), 'public')];
const assertAsset = (src: string) => {
  const found = publicCandidates.some((dir) => existsSync(join(dir, src)));
  expect(found, `asset manquant: ${src} (recherché dans ${publicCandidates.join(' | ')})`).toBe(true);
};

describe('manifeste PWA (vite.config.ts)', () => {
  it('déclare une icône any 192x192 ET 512x512 (exigence Chromium)', () => {
    const any = (pwaManifest.icons ?? []).filter((i) => i.purpose !== 'maskable');
    expect(any.some((i) => i.sizes === '192x192')).toBe(true);
    expect(any.some((i) => i.sizes === '512x512')).toBe(true);
  });

  it('déclare une icône maskable 512x512', () => {
    expect((pwaManifest.icons ?? []).some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
  });

  it('chaque icône du manifeste existe physiquement dans public/', () => {
    for (const icon of pwaManifest.icons ?? []) {
      expect(publicCandidates.some((dir) => existsSync(join(dir, icon.src))), `icône manquante: ${icon.src}`).toBe(true);
    }
  });

  it('déclare exactement deux raccourcis, « Tâches du jour » visant la vue dédiée /taches/jour (D-01), sans paramètre', () => {
    const shortcuts = pwaManifest.shortcuts ?? [];
    expect(shortcuts).toHaveLength(2);
    expect(shortcuts.map((s) => s.url).sort()).toEqual(['/courses', '/taches/jour']);
    for (const shortcut of shortcuts) {
      expect(shortcut.url).not.toContain('?');
      // L'icône de raccourci est un PNG 96x96 committé (Chromium l'exige carré).
      const icon = (shortcut.icons ?? [])[0];
      expect(icon?.sizes).toBe('96x96');
      expect(icon?.src, 'icône de raccourci absente').toBeTruthy();
      assertAsset(icon!.src);
    }
  });

  it('déclare display_override dans l\'ordre exact window-controls-overlay > minimal-ui > standalone (D-06)', () => {
    expect([...(pwaManifest.display_override ?? [])]).toEqual(['window-controls-overlay', 'minimal-ui', 'standalone']);
  });

  it('conserve orientation portrait-primary (D-07) et les catégories (D-08)', () => {
    expect(pwaManifest.orientation).toBe('portrait-primary');
    expect([...(pwaManifest.categories ?? [])]).toEqual(['productivity', 'lifestyle']);
  });

  it('déclare deux screenshots (wide + narrow) présents et aux tailles déclarées', () => {
    const screenshots = pwaManifest.screenshots ?? [];
    expect(screenshots).toHaveLength(2);
    const factors = screenshots.map((s) => s.form_factor).sort();
    expect(factors).toEqual(['narrow', 'wide']);
    for (const shot of screenshots) {
      assertAsset(shot.src);
    }
    expect(screenshots.map((s) => s.sizes).sort()).toEqual(['1280x720', '720x1280']);
  });
});
