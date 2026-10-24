import { expect, test } from '@playwright/test';

/**
 * Parcours principal du frigo (vague 3.1), en mode démonstration :
 * ouvrir l'espace, lire les articles semés avec leurs pastilles de
 * péremption, ajouter un article, le retirer avec confirmation.
 */
test.describe('Frigo', () => {
  test('lire, ajouter puis retirer un article', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL('**/accueil');

    await page.goto('/frigo');
    await expect(page.getByText('Yaourts nature')).toBeVisible();
    await expect(page.getByText('Crème fraîche')).toBeVisible();
    // Les états de péremption du semis : périmé, bientôt périmé, bon.
    // Pastilles de péremption des lignes (le héro porte les mêmes mots
    // mais sa légende est masquée sous 650px).
    await expect(page.getByText('Périmé', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Bientôt périmé', { exact: true }).first()).toBeVisible();

    // Ajout d'un article via le formulaire.
    await page.getByRole('button', { name: 'Ajouter un article' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Article/).fill('Camembert de Normandie');
    await dialog.getByLabel(/^Quantité/).fill('1');
    await dialog.getByLabel(/Unité/).fill('boîte');
    await dialog.getByRole('button', { name: 'Ajouter au frigo' }).click();
    await expect(page.getByText('Camembert de Normandie')).toBeVisible();

    // Le retrait demande la confirmation (aucune suppression en un tap).
    await page.getByRole('button', { name: 'Retirer Camembert de Normandie du frigo' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Retirer' }).click();
    await expect(page.getByText('Camembert de Normandie')).toHaveCount(0);
  });

  test('le filtre « bientôt périmé » ne garde que l’urgent', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL('**/accueil');

    await page.goto('/frigo');
    await expect(page.getByText('Yaourts nature')).toBeVisible();
    await page.getByRole('button', { name: /Bientôt périmé/ }).click();
    await expect(page.getByText('Jambon blanc')).toBeVisible();
    await expect(page.getByText('Crème fraîche')).toBeVisible();
    await expect(page.getByText('Yaourts nature')).not.toBeVisible();
  });
});
