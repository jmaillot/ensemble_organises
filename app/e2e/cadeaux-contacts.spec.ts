import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours Cadeaux → Contacts → Anniversaires (phase 05, D-09/D-10/D-12) en
 * mode démonstration (aucun backend requis).
 *
 * Couvert ici : ajout d'une idée cadeau, création d'une fiche contact avec
 * date visible en anniversaires, case « créer aussi un contact » (D-10) et
 * badge « 2 sources » des homonymes indépendants (D-12).
 *
 * Non couvert en e2e (UI portée par le plan 05-03, hors de ce plan) :
 * réservation par un non-propriétaire et génération de code d'invitation —
 * parcours manuel documenté dans le SUMMARY 05-05.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Cadeaux vers contacts et anniversaires', () => {
  test('ajouter une idée cadeau à la liste', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/cadeaux');
    await expect(page.getByText('Atelier céramique')).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une idée' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Nom du cadeau/).fill('Télescope d’initiation');
    await dialog.getByRole('button', { name: 'Ajouter l’idée' }).click();

    await expect(page.getByText('Télescope d’initiation')).toBeVisible();
  });

  test('créer un contact avec date le rend visible en anniversaires', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/contacts');
    await expect(page.getByRole('group', { name: 'Choisir une liste de contacts' })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Nom/).fill('E2E Aline');
    await dialog.getByLabel(/Date de naissance/).fill('11/06/1990');
    await dialog.getByRole('button', { name: 'Ajouter le contact' }).click();

    const rows = page.getByRole('list', { name: 'Liste des contacts' });
    await expect(rows.getByText('E2E Aline')).toBeVisible();
    await expect(rows.getByText(/Né\(e\) le 11\/06\/1990/)).toBeVisible();

    // La fiche date rejoint la vue agrégée des anniversaires (D-09).
    await page.goto('/anniversaires');
    const birthdays = page.getByRole('list', { name: 'Liste des anniversaires' });
    await expect(birthdays.getByText('E2E Aline')).toBeVisible();
  });

  test('un anniversaire homonyme affiche le badge deux-sources', async ({ page }) => {
    await openDemoSession(page);

    // D'abord la fiche contact avec date…
    await page.goto('/contacts');
    await expect(page.getByRole('group', { name: 'Choisir une liste de contacts' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    const contactDialog = page.getByRole('dialog');
    await contactDialog.getByLabel(/^Nom/).fill('E2E Robin');
    await contactDialog.getByLabel(/Date de naissance/).fill('02/02/2000');
    await contactDialog.getByRole('button', { name: 'Ajouter le contact' }).click();
    await expect(page.getByRole('list', { name: 'Liste des contacts' }).getByText('E2E Robin')).toBeVisible();

    // …puis l'anniversaire homonyme, sans recréer de contact.
    await page.goto('/anniversaires');    await page.getByRole('button', { name: 'Ajouter un anniversaire' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Nom/).fill('E2E Robin');
    await dialog.getByLabel(/^Date de naissance/).fill('02/02/2001');
    await dialog.getByRole('checkbox', { name: /Créer aussi un contact/ }).uncheck();
    await dialog.getByRole('button', { name: /Ajouter l’anniversaire/ }).click();

    const rows = page.getByRole('list', { name: 'Liste des anniversaires' });
    const line = rows.getByRole('listitem').filter({ hasText: 'E2E Robin' });
    await expect(line).toContainText('2 sources');
  });

  test('invité sans compte : garde code puis refus hors ligne', async ({ page }) => {
    // Parcours invité (phase 06, D-05) en démonstration : sans backend, la
    // garde cliente (bouton inactif sous 22 caractères) puis le refus
    // explicite « serveur indisponible » sont les seuls chemins
    // déterministes. La réserve réussie, adossée au serveur, est prouvée par
    // la suite SQL 0029 et les tests Vitest invités — pas rejouable sans relais.
    await openDemoSession(page);
    await page.goto('/invitation/cadeau');
    await expect(page.getByText('Invitation à une liste de cadeaux')).toBeVisible();

    // Garde cliente : un code trop court ne part jamais.
    await page.getByLabel(/Code d’invitation/).fill('court');
    await expect(page.getByRole('button', { name: 'Ouvrir l’invitation' })).toBeDisabled();

    await page.getByLabel(/Code d’invitation/).fill('JU6QUzDkv3pLmdGgVYUCqadLLKdsqfCj');
    await page.getByRole('button', { name: 'Ouvrir l’invitation' }).click();
    await expect(page.getByText(/Connexion au serveur indisponible/)).toBeVisible();
  });

  test('liste étrangère rejointe : badge d’origine puis réserve via le serveur', async ({ page }) => {
    // Parcours inter-foyers (phase 06, G-06-1b-bis) en démonstration : sans
    // backend, seuls le badge d'origine (fusion par partage) et le refus
    // explicite de la réserve serveur sont déterministes. La réserve
    // attribuée réussie est prouvée par la suite SQL 0033 et les tests
    // Vitest — pas rejouable sans relais.
    await openDemoSession(page);
    await page.goto('/cadeaux');
    await expect(page.getByText('Atelier céramique')).toBeVisible();

    await page.getByRole('group', { name: 'Listes de cadeaux' }).getByRole('button', { name: 'Noël des Voisins' }).click();
    // La liste rejointe apparaît avec sa marque d'origine et son contenu.
    await expect(page.getByText('Liste partagée · Les Voisins')).toBeVisible();
    await expect(page.getByText('Bougie parfumée')).toBeVisible();
    // Lecture seule : aucune gestion offerte sur une liste étrangère.
    await expect(page.getByRole('button', { name: /Partager|Gérer/ })).toHaveCount(0);

    // La réserve ne part jamais en écriture directe : elle appelle la voie
    // serveur, indisponible en démo — le refus explicite le prouve (un
    // chemin client aurait silencieusement coché l'interrupteur).
    await page.getByRole('switch', { name: 'Acheté', exact: true }).click();
    await expect(page.getByText('Edge Function indisponible.')).toBeVisible();
  });

  test('quitter une liste étrangère : bouton, modale, annulation sans effet', async ({ page }) => {
    // Départ volontaire (phase 06, G-06-1c) en démonstration : sans backend,
    // seuls la visibilité du bouton, la copie de la modale et l'annulation
    // sans effet sont déterministes. La suppression réussie est prouvée par
    // la suite SQL 0034 et les tests Vitest — pas rejouable sans relais.
    await openDemoSession(page);
    await page.goto('/cadeaux');
    await expect(page.getByText('Atelier céramique')).toBeVisible();

    // Liste du foyer : aucun départ proposé.
    await expect(page.getByRole('button', { name: /Quitter/ })).toHaveCount(0);

    await page.getByRole('group', { name: 'Listes de cadeaux' }).getByRole('button', { name: 'Noël des Voisins' }).click();
    await expect(page.getByText('Liste partagée · Les Voisins')).toBeVisible();
    await page.getByRole('button', { name: /Quitter la liste/ }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Quitter « Noël des Voisins »')).toBeVisible();
    await expect(dialog.getByText(/Vos réservations à votre nom sont conservées/)).toBeVisible();
    await expect(dialog.getByText(/rejoindre à nouveau/)).toBeVisible();

    // Annuler : aucun appel, liste toujours là.
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Bougie parfumée')).toBeVisible();
    await expect(page.getByText('Liste partagée · Les Voisins')).toBeVisible();
  });

  test('quitter sans serveur : le refus explicite prouve la voie serveur', async ({ page }) => {
    // Le départ ne part jamais en écriture directe : il appelle la voie
    // serveur, indisponible en démo — le refus explicite le prouve (un
    // chemin client aurait silencieusement retiré la liste).
    await openDemoSession(page);
    await page.goto('/cadeaux');
    await expect(page.getByText('Atelier céramique')).toBeVisible();

    await page.getByRole('group', { name: 'Listes de cadeaux' }).getByRole('button', { name: 'Noël des Voisins' }).click();
    await page.getByRole('button', { name: /Quitter la liste/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitter' }).click();

    await expect(page.getByText('Edge Function indisponible.')).toBeVisible();
    // La liste est toujours là : rien n'a été supprimé en local.
    await expect(page.getByText('Liste partagée · Les Voisins')).toBeVisible();
    await expect(page.getByText('Bougie parfumée')).toBeVisible();
  });
});
