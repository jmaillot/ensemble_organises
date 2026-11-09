import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // La spec réelle join-token appartient au run séparé contre la stack
  // déployée (scripts/test-join-token-real.sh, JT-01) : elle ne fait PAS
  // partie du run standard (mode démonstration, build + preview) où elle
  // n'aurait ni stack ni comptes — son échec nommé y serait du bruit, pas une
  // information. Ce n'est pas un skip : le wrapper pose E2E_BASE_URL et la
  // spec est incluse dans SON run ; le standard reste 100 % vert sans elle.
  testIgnore: process.env.E2E_BASE_URL ? [] : ['**/join-token-real.spec.ts'],
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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
