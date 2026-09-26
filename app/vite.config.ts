import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'assets/*.jpg'],
      // `injectManifest` et non `generateSW` : le second génère un service
      // worker auquel on ne peut ajouter aucun écouteur, et l'API Push en exige
      // deux (`push` et `notificationclick`). `src/sw.ts` reproduit à la main ce
      // que `workbox` configurait ici : précache, repli de navigation, cache
      // des médias.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
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
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
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
    // Les fichiers de test partagent le moteur IndexedDB simulé : on les
    // exécute séquentiellement pour éviter les courses entre suites.
    pool: 'forks',
    fileParallelism: false,
    coverage: { reporter: ['text', 'html'], include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.*', 'src/test/**'] },
  },
});
