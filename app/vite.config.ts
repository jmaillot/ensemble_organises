import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// `import.meta.url` n'a de schéma `file:` que lorsque ce fichier est chargé
// comme config Vite réelle ; importé depuis un test Vitest (transformé), il est
// vide — le repli « /src » ne sert alors qu'à la résolution d'alias du test.
const srcUrl = new URL('./src', import.meta.url);
const src = srcUrl.protocol === 'file:' ? fileURLToPath(srcUrl) : '/src';

// Bloc manifeste extrait pour testabilité : `src/pwa/manifest.test.ts` importe
// cet objet directement et vérifie les invariants d'installabilité (INST-01,
// DLNK-01). Source UNIQUE du manifeste — ne jamais recréer un fichier statique
// `public/manifest.webmanifest` (décision 09-02).
export const pwaManifest: Partial<ManifestOptions> = {
  name: 'Ensemble & Organisés',
  short_name: 'Ensemble',
  description: "L'espace familial pour tout garder en mouvement.",
  lang: 'fr',
  dir: 'ltr',
  id: '/ensemble-organises',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  theme_color: 'oklch(98% 0.004 240)',
  background_color: 'oklch(98% 0.004 240)',
  // Icônes générées une fois par `npx @vite-pwa/assets-generator
  // --preset minimal-2023 public/icon.svg` (D-13) — sorties commitées
  // dans `public/`, JAMAIS régénérées au build (pas d'option `pwaAssets`).
  // Chromium exige les deux tailles `any` 192 ET 512 pour l'installabilité,
  // en plus de la variante `maskable` (Pitfall 1, 32-RESEARCH.md).
  icons: [
    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // Raccourcis vers des routes existantes du routeur — AUCUN paramètre
  // d'URL (D-05, DLNK-01) ; la vue dédiée vient en phase 35.
  shortcuts: [
    { name: 'Tâches du jour', url: '/taches', icons: [{ src: 'shortcut-taches-96.png', sizes: '96x96', type: 'image/png' }] },
    { name: 'Courses', url: '/courses', icons: [{ src: 'shortcut-courses-96.png', sizes: '96x96', type: 'image/png' }] },
  ],
  // Ordre imposé par D-06 : WCO d'abord, fallback minimal-ui puis standalone.
  display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
  categories: ['productivity', 'lifestyle'],
  // Captures réelles de la landing (vite preview + Playwright), compressées
  // < 110 Ko — le précache SW ne les embarque pas (includeAssets/globPatterns
  // ne couvrent pas screenshots/, Pitfall 5).
  screenshots: [
    { src: 'screenshots/desktop.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
    { src: 'screenshots/mobile.png', sizes: '720x1280', type: 'image/png', form_factor: 'narrow' },
  ],
};

// Typage défensif côté plugin : si une clé du manifeste n'existe plus dans
// ManifestOptions, la compilation échoue ici plutôt que silencieusement.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'assets/*.jpg'],
      // `injectManifest` et non `generateSW` : le second génère un service
      // worker auquel on ne peut ajouter aucun écouteur, et l'API Push en exige
      // deux (`push` et `notificationclick`). `src/sw.ts` reproduit à la main ce
      // que `workbox` configurait ici : précache, repli de navigation, cache
      // des médias.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Source UNIQUE du manifeste : le fichier statique
      // `public/manifest.webmanifest` a été supprimé (09-02) car il
      // divergeait de ce bloc (start_url `./index.html`, scope `./`,
      // icône SVG seule) alors que c'est ce bloc qui gagne dans `dist/`.
      // Le manifeste généré est servi à `/manifest.webmanifest`, couvert
      // par la règle no-cache de `nginx.conf`, comme avant.
      manifest: pwaManifest,
      injectManifest: {
        // Le service worker versionné est écrit dans `dist/`, donc très proche
        // de la limite de 2 Mio par défaut de Workbox ; on l'écarte
        // explicitement plutôt que de laisser une régression de taille le
        // faire échouer un jour sans explication.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': src } },
  // `../supabase/functions` porte le code pur testé par la suite Vitest
  // (chiffrement Web Push). Vite interdit par défaut de le charger hors
  // racine : sans cette autorisation, le fichier est simplement introuvable.
  server: { port: 5173, host: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
  test: {
    environment: 'jsdom',
    // Les fonctions Edge sont hors de `src/`, mais leur code pur — le
    // chiffrement Web Push — n'utilise que WebCrypto et s'exécute donc dans
    // Node. L'exclure de la suite Reviendrait à ne jamais vérifier un envoi
    // Push autrement qu'en le constataant absent.
    include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Les fichiers tournent en parallèle. La sérialisation reposait sur « les
    // suites partagent le moteur IndexedDB simulé », ce qui n'est plus vrai :
    // `isolate` (défaut) donne à chaque fichier son propre environnement, donc
    // son propre `fake-indexeddb`, et `src/test/setup.ts` nomme en plus la base
    // d'après le chemin du fichier. En séquentiel, 162 fichiers payaient 162
    // démarrages : 8 minutes contre 2 minutes 20.
    pool: 'forks',
    fileParallelism: true,
    coverage: { reporter: ['text', 'html'], include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.*', 'src/test/**'] },
  },
});
