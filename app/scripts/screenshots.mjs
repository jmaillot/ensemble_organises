import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Capture d'écran de contrôle visuel : compare le rendu à l'export de design
 * sur la matrice de viewports du manifeste. Lancer :
 *   node scripts/screenshots.mjs [baseUrl] [route…]
 */

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';
const routes = process.argv.slice(3);
const targets = routes.length > 0 ? routes : ['/accueil', '/taches', '/calendrier', '/courses', '/ardoise', '/cercle', '/messages'];
const viewports = [
  { name: 'mobile-compact', width: 360, height: 800 },
  { name: 'mobile-standard', width: 390, height: 844 },
  { name: 'mobile-large', width: 430, height: 932 },
  { name: 'foldable', width: 600, height: 960 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];

const only = process.env.ONLY_VIEWPORT;
const outputDir = process.env.SHOT_DIR ?? '/tmp/opencode/shots';

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await context.newPage();

await page.goto(`${baseUrl}/connexion`, { waitUntil: 'networkidle' });
const demo = page.getByRole('button', { name: 'Entrer dans la démonstration' });
if ((await demo.count()) > 0) {
  await demo.click();
  await page.waitForURL('**/accueil');
  await page.waitForTimeout(400);
} else {
  console.warn('Mode démonstration introuvable : les captures se feront hors session.');
}

for (const route of targets) {
  for (const viewport of viewports) {
    if (only && only !== viewport.name) continue;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const slug = route.replace(/\//g, '') || 'accueil';
    const file = `${outputDir}/${slug}-${viewport.name}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(`${route} ${viewport.name} ${viewport.width}x${viewport.height} overflow=${overflow} → ${file}`);
  }
}

await browser.close();
