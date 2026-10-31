import { expect, test, type Page } from '@playwright/test';

/**
 * DET-05 (D-14/D-17) : dans la feuille « Plus » (tiroir mobile) à 390 px en
 * trois colonnes, le nom de tuile « Anniversaires » est rendu ENTIER — sans
 * césure française (le `lang="fr"` de <html> n'hérite plus) — et la feuille
 * ne provoque aucun débordement horizontal.
 *
 * Couverture : césure désactivée + text-wrap: balance sur AppTile (D-14),
 * zéro scrollWidth excédentaire pendant l'ouverture (T-17-07), et (D-15/D-16,
 * rempli en Task 2) le cycle ouverture/fermeture laisse le contenu monté dans
 * le DOM mais masqué à l'état fermé.
 *
 * Ne modifie pas `recettes-cuisine-mobile.spec.ts` ni les autres specs : la
 * feuille « Plus » est ouverte ici par son seul contrôleur (« Plus » de la
 * barre basse), sans toucher aux parcours métier.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

async function openFeuillePlus(page: Page) {
  await page.getByRole('button', { name: 'Plus' }).click();
  const feuille = page.locator('#tiroir-mobile');
  await expect(feuille).toBeVisible();
  return feuille;
}

test.describe('Feuille « Plus » mobile — césure et débordement à 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('« Anniversaires » est rendu entier, sans césure (D-14)', async ({ page }) => {
    const feuille = await openFeuillePlus(page);
    const tuile = feuille.getByRole('link', { name: /Ouvrir Anniversaires/ });
    await expect(tuile).toBeVisible();

    const nom = tuile.locator('strong');
    const mesures = await nom.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        hyphens: style.hyphens,
        textWrap: style.textWrap || style['text-wrap'],
        // Aucun débordement interne : le nom tient dans la tuile, même sur
        // deux lignes, sans être rogné ni césuré.
        debordement: el.scrollWidth - el.clientWidth,
      };
    });

    // La césure française (héritée de lang="fr") est désactivée sur la tuile.
    expect(mesures.hyphens).toBe('none');
    // Le rééquilibrage des lignes est actif : le wrap sans césure ne suffit
    // pas seul (Pitfall 3 du plan).
    expect(mesures.textWrap).toBe('balance');
    // Le nom ne déborde pas de sa tuile.
    expect(mesures.debordement).toBeLessThanOrEqual(0);
  });

  test('la feuille ouverte ne provoque aucun débordement horizontal', async ({ page }) => {
    await openFeuillePlus(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
