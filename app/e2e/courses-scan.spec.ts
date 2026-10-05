import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours scan Courses (phase 04-courses-scan) sur navigateur réel :
 * bouton Scanner → saisie manuelle EAN → fiche pré-remplie OFF (intercepté,
 * même payload que les handlers MSW `off-handlers`) → 1-tap → article en
 * liste → re-scan quantité +1 → création manuelle sur EAN inconnu.
 *
 * Tourne en mode démonstration (aucun backend requis) ; seul l'appel
 * OpenFoodFacts est intercepté en route.
 */

const KNOWN_EAN = '3017620422003';
const UNKNOWN_EAN = '2999999999991';

const NUTELLA_BODY = {
  code: KNOWN_EAN,
  status: 1,
  status_verbose: 'product found',
  product: {
    code: KNOWN_EAN,
    product_name: 'Nutella',
    brands: 'Nutella, Ferrero',
    image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
    image_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
    lang: 'fr',
    categories_tags: ['en:spreads', 'fr:Pâtes à tartiner'],
  },
};

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
}

/** Rejoue exactement les payloads MSW : Nutella trouvé, le reste en 404. */
async function mockOff(page: Page) {
  await page.route('https://world.openfoodfacts.org/api/v2/product/*.json*', async (route) => {
    if (route.request().url().includes(KNOWN_EAN)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NUTELLA_BODY) });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: UNKNOWN_EAN, status: 0, status_verbose: 'product not found' }),
      });
    }
  });
}

async function openCourses(page: Page) {
  await mockOff(page);
  await page.goto('/courses');
  // Les listes chargent en asynchrone (Dexie + seed) : le bouton Scanner est
  // désactivé jusque-là, et un scan sans `lists[0]` retomberait sur le toast
  // « Créez d'abord une liste ». Attendre la région = listes prêtes.
  await expect(page.getByRole('region', { name: 'Fresque' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scanner' })).toBeEnabled();
}

/** Dialogue scan → saisie manuelle (le repli sans caméra des navigateurs). */
async function scanEan(page: Page, ean: string) {
  await page.getByRole('button', { name: 'Scanner' }).click();
  await page.getByLabel('Code-barres').fill(ean);
  await page.getByRole('button', { name: 'Utiliser ce code' }).click();
}

async function submitSheet(page: Page) {
  await page.getByRole('button', { name: 'Enregistrer et ajouter à la liste' }).click();
}

test.describe('Scan Courses', () => {
  // Série dans ce fichier : 4 Chromium en parallèle sur une petite machine
  // affament le serveur de preview partagé (timeouts à 8 s puis au clic).
  // L'isolation reste totale (contexte neuf par test), seul l'ordre est fixe.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
    await openCourses(page);
  });

  test('scan enrichi 1-tap', async ({ page }) => {
    await scanEan(page, KNOWN_EAN);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Nutella' })).toBeVisible();
    await expect(sheet.getByText(/Ferrero/)).toBeVisible();

    await submitSheet(page);

    await expect(page.getByText(/ajouté à la liste/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Terminer Nutella' })).toBeVisible();
  });

  test('re-scan quantite +1', async ({ page }) => {
    await scanEan(page, KNOWN_EAN);
    await submitSheet(page);
    await expect(page.getByRole('checkbox', { name: 'Terminer Nutella' })).toBeVisible();

    await scanEan(page, KNOWN_EAN);
    await submitSheet(page);

    await expect(page.getByText(/quantité \+1/)).toBeVisible();
    // Jamais de doublon : un seul article Nutella en liste.
    await expect(page.getByRole('checkbox', { name: /Nutella/ })).toHaveCount(1);
  });

  test('EAN inconnu creation manuelle', async ({ page }) => {
    await scanEan(page, UNKNOWN_EAN);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: /Produit non trouvé/ })).toBeVisible();
    await sheet.getByLabel(/^Nom/).fill('Miel artisanal');

    await submitSheet(page);

    await expect(page.getByText(/ajouté à la liste/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Terminer Miel artisanal' })).toBeVisible();
  });

  test('photo locale et repli OFF non persisté', async ({ page }) => {
    await scanEan(page, KNOWN_EAN);

    const sheet = page.getByRole('dialog');
    // D-05 : l'image OFF n'est qu'un repli d'affichage avec crédit…
    await expect(sheet.getByText(/affichage seul, non enregistrée/)).toBeVisible();
    // …et la fiche propose le champ photo locale prioritaire.
    await expect(sheet.getByLabel(/^Photo/)).toBeVisible();
  });
});
