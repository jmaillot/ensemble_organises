import { expect, test, type Page } from '@playwright/test';

/**
 * Gap G-17-2 (D-12, R1) : le toggle Mode cuisine reste sur la ligne du
 * titre Étapes en haut à droite du panneau sur mobile, jamais sous la
 * description — prouvé à 390px et 360px sans défilement horizontal.
 *
 * Couvre la fiche membre en e2e (la page invitée partage le même `Panel`
 * et est couverte en Vitest `recette-cuisine-panel`, parité D-16). Ne
 * modifie pas `recettes.spec.ts`.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

async function expectToggleInlineTopRight(page: Page) {
  await page.goto('/recettes/recipe-1');
  await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

  const title = page.getByRole('heading', { name: 'Étapes' });
  const toggle = page.getByRole('button', { name: 'Mode cuisine' });
  await expect(title).toBeVisible();
  await expect(toggle).toBeVisible();

  const titleBox = await title.boundingBox();
  const toggleBox = await toggle.boundingBox();
  const panelBox = await page.locator('section.panel-surface', { has: title }).boundingBox();
  expect(titleBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  if (!titleBox || !toggleBox || !panelBox) throw new Error('boîtes englobantes introuvables');

  // Le haut du toggle se situe dans la bande verticale de la ligne de
  // titre : au niveau ou au-dessus du bas du titre, et pas entièrement
  // en dessous (jamais empilé sous la description).
  expect(toggleBox.y).toBeLessThanOrEqual(titleBox.y + titleBox.height);
  expect(toggleBox.y + toggleBox.height).toBeGreaterThan(titleBox.y);
  // Toggle calé à droite du panneau avec marge positive, après le titre.
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width - 1);
  expect(toggleBox.x).toBeGreaterThan(titleBox.x + titleBox.width);

  // Zéro débordement horizontal (T-17-07).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Recettes — toggle cuisine inline à 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('le toggle reste sur la ligne du titre Étapes, zéro débordement', async ({ page }) => {
    await expectToggleInlineTopRight(page);
  });
});

test.describe('Recettes — toggle cuisine inline à 360px', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('le toggle reste sur la ligne du titre Étapes, zéro débordement', async ({ page }) => {
    await expectToggleInlineTopRight(page);
  });
});
