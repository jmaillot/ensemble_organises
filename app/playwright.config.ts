import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? process.env.E2E_SW_BASE_URL ?? `http://127.0.0.1:${PORT}`;

// Routage des DEUX specs réelles — chaque spec n'appartient qu'à SON run
// (JT-01, 38-E2E-SIGNATURE) : la liste `testIgnore` est construite par
// condition, jamais un ternaire global. Un ternaire du genre
// `E2E_SW_BASE_URL ? [] : [...]` inclurait join-token-real dans le run
// sw-gate — où il n'a ni stack ni comptes — et réciproquement.
//   - sw-gate-real.spec.ts : run du wrapper `scripts/test-sw-gate.sh`
//     (variable E2E_SW_BASE_URL) — deux builds servis par le serveur du
//     harnais sur le même origin ;
//   - join-token-real.spec.ts : run du wrapper `scripts/test-join-token-real.sh`
//     (variable E2E_BASE_URL) — stack déployée.
// Ce n'est pas un skip : chaque wrapper pose sa variable et sa spec est
// incluse dans SON run ; le standard reste 100 % vert sans les deux.
const ignoresSwGate = process.env.E2E_SW_BASE_URL ? [] : ['**/sw-gate-real.spec.ts'];
const ignoresJoinToken = process.env.E2E_BASE_URL ? [] : ['**/join-token-real.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  // La spec réelle join-token appartient au run séparé contre la stack
  // déployée (scripts/test-join-token-real.sh, JT-01) : elle ne fait PAS
  // partie du run standard (mode démonstration, build + preview) où elle
  // n'aurait ni stack ni comptes — son échec nommé y serait du bruit, pas une
  // information. Ce n'est pas un skip : le wrapper pose E2E_BASE_URL et la
  // spec est incluse dans SON run ; le standard reste 100 % vert sans elle.
  testIgnore: [...ignoresSwGate, ...ignoresJoinToken],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Le webServer standard (build + preview sur 4173) est coupé aussi par
  // E2E_SW_BASE_URL : le run sw-gate est servi par le serveur du harnais
  // (`scripts/e2e-sw-server.mjs`) démarré par le wrapper — un second serveur
  // sur le même port strict serait une collision, pas une redondance.
  webServer:
    process.env.E2E_BASE_URL || process.env.E2E_SW_BASE_URL
      ? undefined
      : {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
