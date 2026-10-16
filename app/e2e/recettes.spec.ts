import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours Recettes (phase 16) en mode démonstration (aucun backend
 * requis) : grille → fiche → scaler → partage → Courses, périmètre
 * enfant lecture seule, page invitée, mode cuisine (phase 17 : toggle →
 * cocher → recharger → reprise, membre + enfant). Le lien réel
 * (Edge `recipe-invite`) exige le backend : la démo prouve le câblage
 * (dialogue, erreur explicite), les preuves serveur vivent en Vitest +
 * suite SQL 0054.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Session enfant en démonstration : même idiome que les suites Vitest et
 * la spec cadeaux (`currentMemberId` = Noé, rôle `enfant`), posé via le
 * store zustand persisté.
 */
async function openChildSession(page: Page) {
  await openDemoSession(page);
  await page.evaluate(() => {
    const key = 'ensemble-organises-household';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('store foyer absent');
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    localStorage.setItem(
      key,
      JSON.stringify({ ...parsed, state: { ...parsed.state, currentMemberId: 'member-noe' } }),
    );
  });
  await page.reload();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Recettes — grille vers fiche', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('la grille groupe les cartes, le clic ouvre la fiche', async ({ page }) => {
    await page.goto('/recettes');
    await expect(page.getByRole('heading', { name: 'Recettes du foyer' })).toBeVisible();
    await page.getByRole('link', { name: 'Ouvrir la fiche Tartiflette de saison' }).click();
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible();
  });

  test('le curseur recalcule puis l’envoi crée la ligne en Courses', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

    // Ajout d'un ingrédient de référence (500 g pour 4, défaut démo).
    await page.getByLabel('Ingrédient', { exact: true }).fill('Farine');
    await page.getByLabel(/Nombre/).fill('500');
    await page.getByLabel('Unité', { exact: true }).fill('g');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Farine', { exact: true })).toBeVisible();

    // Échelle 8 : la quantité double, l'unité reste invariable.
    await page.locator('#recette-personnes').fill('8');
    await expect(page.locator('section[aria-label="Ingrédients"]').getByText('1000 g', { exact: true })).toBeVisible();

    // Envoi vers la liste Fresque, à l'échelle courante.
    await page.getByRole('button', { name: 'Ajouter à une liste' }).click();
    await page.getByLabel(/Liste de courses/).selectOption({ label: 'Fresque' });
    await page.getByRole('button', { name: 'Envoyer les ingrédients' }).click();
    // Copie depuis 8269d72 (fusion des lignes existantes : « N ajoutée(s)
    // dans », plus « N ligne(s) ajoutée(s) à ») — assertion recalée sur
    // la copie effective (cf. SUMMARY 17-02, déviation Rule 3).
    await expect(page.getByText(/1 ajoutée dans « Fresque »/)).toBeVisible();
    await expect(page.getByText(/Farine \(1000 g\)/)).toBeVisible();
  });

  test('Partager ouvre le dialogue, la démo dit l’absence de backend', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    await page.getByRole('button', { name: 'Partager' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Aucun lien actif/)).toBeVisible();
    await page.getByRole('button', { name: 'Générer un lien' }).click();
    // Câblage prouvé : l'échec dit le backend manquant, sans erreur muette.
    await expect(page.getByText(/Edge Function indisponible/)).toBeVisible();
  });

  test('la vue print existe à l’échelle, masquée à l’écran', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    const print = page.locator('.recipe-print');
    await expect(print).toBeHidden();
    await expect(print).toContainText('Tartiflette de saison');
    await expect(print).toContainText('Ingrédients');
    await expect(print).toContainText('Étapes');
  });
});

test.describe('Recettes — périmètre enfant lecture seule', () => {
  test.beforeEach(async ({ page }) => {
    await openChildSession(page);
  });

  test('enfant : lecture OK, aucune action visible sur la grille et la fiche', async ({ page }) => {
    await page.goto('/recettes');
    await expect(page.getByRole('heading', { name: 'Recettes du foyer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle recette' })).toHaveCount(0);

    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible();
    for (const name of ['Modifier', 'Partager', 'Exporter', 'Ajouter à une liste', 'Supprimer la recette']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Recettes — page invitée sans compte', () => {
  test('sans code : formulaire puis garde de longueur', async ({ page }) => {
    await page.goto('/invitation/recette');
    await expect(page.getByText(/aucun compte n’est requis/)).toBeVisible();
    // Code court : le bouton reste inactif (garde client, aucun appel).
    await page.getByLabel('Code d’invitation').fill('court');
    await expect(page.getByRole('button', { name: 'Voir la recette' })).toBeDisabled();
    // Code complet : la démo dit l'absence de serveur, sans appel silencieux
    // (le formulaire exige le backend avant même d'ouvrir le lien).
    await page.getByLabel('Code d’invitation').fill('codelienpartage1234567890');
    await page.getByRole('button', { name: 'Voir la recette' }).click();
    await expect(page.getByText(/Connexion au serveur indisponible/)).toBeVisible();
  });

  test('avec code en démo : le mode hors ligne est dit, pas silencieux', async ({ page }) => {
    await page.goto('/invitation/recette?code=codelienpartage1234567890');
    await expect(page.getByText(/Mode hors ligne/)).toBeVisible();
  });
});

test.describe('Recettes — mode cuisine (phase 17, démo)', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  /** La graine démo ne fournit aucune étape : l'enfant ne voyant pas le formulaire, chaque test prépare ses étapes en membre. */
  async function seedTwoSteps(page: Page) {
    const input = page.locator('#recette-etape-nouvelle');
    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    await input.fill('Éplucher les pommes de terre.');
    await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await expect(page.getByText('Éplucher les pommes de terre.', { exact: true }).first()).toBeVisible();
    // `submitAdd` remet le brouillon à vide APRÈS l'`await onAdd` : sans cette
    // attente, la remise à zéro peut effacer le remplissage suivant (course
    // mesurée sous `--repeat-each`). On attend le champ vide avant de saisir.
    await expect(input).toHaveValue('');
    await input.fill('Enfourner 45 minutes.');
    await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await expect(page.getByText('Enfourner 45 minutes.', { exact: true }).first()).toBeVisible();
  }

  test('membre : toggle, cocher, recharger, reprise, retour édition', async ({ page }) => {
    await seedTwoSteps(page);

    await page.getByRole('button', { name: 'Mode cuisine', exact: true }).click();
    await expect(page.getByText('0/2', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }).click();
    await expect(page.getByText('1/2', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    // Le mode n'est jamais persisté : OFF après rechargement…
    await expect(page.getByRole('button', { name: 'Mode cuisine', exact: true })).toHaveAttribute('aria-pressed', 'false');
    // …mais les cases reprennent.
    await page.getByRole('button', { name: 'Mode cuisine', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' })).toBeChecked();
    await expect(page.getByText('1/2', { exact: true })).toBeVisible();

    // Retour édition.
    await page.getByRole('button', { name: 'Mode cuisine', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ajouter une étape' })).toBeVisible();
  });

  test('enfant : toggle visible et cases cochables, rien d’autre', async ({ page }) => {
    await seedTwoSteps(page);

    // Bascule enfant (même idiome que `openChildSession`, sans repasser par l'accueil).
    await page.evaluate(() => {
      const key = 'ensemble-organises-household';
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error('store foyer absent');
      const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
      localStorage.setItem(
        key,
        JSON.stringify({ ...parsed, state: { ...parsed.state, currentMemberId: 'member-noe' } }),
      );
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Mode cuisine', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter une étape' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mode cuisine', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Marquer l’étape 1 comme faite' }).click();
    await expect(page.getByText('1/2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter une étape' })).toHaveCount(0);
  });
});

/**
 * PNG 1×1 RGBA valide (70 octets) : la compression native de
 * `depositHouseholdFile` (`createImageBitmap`) refuse un tampon non décodable,
 * donc la fixture doit être une vraie image.
 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Recettes — photos d’étapes (démo)', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  /** La graine démo ne fournit aucune étape : le test prépare les siennes en membre. */
  async function addStep(page: Page, content: string) {
    const input = page.locator('#recette-etape-nouvelle');
    await input.fill(content);
    await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await expect(page.getByText(content, { exact: true }).first()).toBeVisible();
    // Même course que `seedTwoSteps` : `submitAdd` vide le brouillon APRÈS
    // l'`await onAdd`, ce qui peut effacer le remplissage suivant.
    await expect(input).toHaveValue('');
  }

  test('dépôt, image sur les trois surfaces, puis aperçu mort masqué après rechargement', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

    await addStep(page, 'Éplucher les pommes de terre.');
    await addStep(page, 'Enfourner 45 minutes.');

    const list = page.getByRole('list', { name: 'Étapes de la recette' });
    const photographed = list.getByRole('listitem').filter({ hasText: 'Éplucher les pommes de terre.' });
    const bare = list.getByRole('listitem').filter({ hasText: 'Enfourner 45 minutes.' });

    // Dépôt : cliquer l'invitation de l'étape puis fournir le PNG minuscule.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      photographed.getByRole('button', { name: 'Ajouter une photo' }).click(),
    ]);
    await chooser.setFiles({ name: 'etape.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });

    // Aperçu local `blob:` en mode démo (D-18) sous le texte de l'étape.
    const ficheImage = photographed.locator('img');
    await expect(ficheImage).toBeVisible();
    await expect(ficheImage).toHaveAttribute('src', /^blob:/);
    // L'étape laissée nue ne rend aucun élément média.
    await expect(bare.locator('img')).toHaveCount(0);

    // Le bloc d'impression porte une image sous sa ligne.
    await expect(page.locator('.recipe-print').locator('img')).toHaveCount(1);

    // Mode cuisine : la même image y est rendue, l'étape nue reste sans média.
    await page.getByRole('button', { name: 'Mode cuisine', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Mode cuisine' })).toBeVisible();
    const cuisineImage = list.getByRole('listitem').filter({ hasText: 'Éplucher les pommes de terre.' }).locator('img');
    await expect(cuisineImage).toHaveCount(1);
    await expect(cuisineImage).toHaveAttribute('src', /^blob:/);
    await expect(list.getByRole('listitem').filter({ hasText: 'Enfourner 45 minutes.' }).locator('img')).toHaveCount(0);

    // Chromium garde le magasin de `blob:` VIVANT à travers un rechargement :
    // sans révocation, l'URL n'est pas morte après `page.reload()` et l'image
    // reste rendue (sonde mesurée : 5 fois sur 6). Révoquer explicitement
    // l'aperçu est ce qui rend la prémisse « aperçu mort » vraie, donc le
    // masquage (onError, D-18) déterministe.
    const previewUrl = await cuisineImage.getAttribute('src');
    await page.evaluate((url) => {
      if (url) URL.revokeObjectURL(url);
    }, previewUrl);

    // Rechargement : l'aperçu `blob:` est mort, l'image est masquée et l'étape
    // se rend comme une étape nue, l'invitation d'ajout de retour (R6).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    const photographedAfter = list.getByRole('listitem').filter({ hasText: 'Éplucher les pommes de terre.' });
    await expect(photographedAfter.locator('img')).toHaveCount(0);
    await expect(photographedAfter.getByRole('button', { name: 'Ajouter une photo' })).toBeVisible();
  });
});
