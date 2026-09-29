import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours critiques (AGENTS.md §2.4) : connexion, création/rejoint de foyer,
 * tâche, dépense, carte de fidélité. Les tests tournent en mode démonstration
 * (aucun backend requis) : c'est le mode local documenté de l'application.
 */

/** Le projet Playwright « mobile » utilise le tiroir hamburger. */
function viewportIsMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) <= 650;
}

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  if (viewportIsMobile(page)) {
    // Sous 650 px, le fil d'Ariane cède la place au hamburger.
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible();
  } else {
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Connexion et foyer', () => {
  test('la landing page présente les trois chemins de connexion', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tout le foyer');
    await expect(page.getByRole('link', { name: 'Commencer avec Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuer avec Facebook' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuer avec un email' })).toBeVisible();
  });

  test('la session de démonstration ouvre le tableau de bord', async ({ page }) => {
    await openDemoSession(page);
    if (viewportIsMobile(page)) {
      // Sur mobile, le hamburger remplace la barre latérale.
      await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Menu des espaces du foyer' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ouvrir Courses' })).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      // Le fil d'Ariane est toujours visible ; la barre latérale, elle, cède la
      // place au tiroir sous 650 px.
      const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
      await expect(navigation).toBeVisible();
    }
    // Le nom du foyer figure dans l'en-tête de l'accueil, visible partout.
    await expect(page.locator('main').getByText(/Foyer Martin/)).toBeVisible();
  });

  test('créer un foyer génère un token copiable et un QR code', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.goto('/foyer/nouveau');
    await page.getByLabel('Nom du foyer').fill('Foyer de test');
    await page.getByRole('button', { name: 'Créer mon foyer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre foyer est prêt' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code du token d’invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier' })).toBeVisible();
  });

  test('rejoindre un foyer valide le format du token', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/foyer/rejoindre');
    await page.getByLabel('Token d’invitation').fill('court');
    await page.getByRole('button', { name: 'Rejoindre le foyer' }).click();
    await expect(page.getByText(/token fait au moins 22 caractères/)).toBeVisible();
  });
});

test.describe('Parcours des modules', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('une tâche peut être créée puis cochée', async ({ page }) => {
    await page.goto('/taches');
    await page.getByRole('button', { name: 'Ajouter une tâche' }).first().click();
    await page.getByLabel(/Nom de la tâche/).fill('Acheter du pain');
    await page.getByRole('button', { name: 'Ajouter la tâche' }).click();
    await expect(page.getByText('Acheter du pain')).toBeVisible();
    await page.getByRole('checkbox', { name: /Terminer Acheter du pain/ }).click();

    // Le filtre par défaut ne montre que les tâches ouvertes : la tâche cochée
    // en sort, puis la revient via l'onglet « Terminées ».
    await expect(page.getByText('Acheter du pain')).toBeHidden();
    await page.getByLabel('Filtrer les tâches').selectOption({ label: 'Terminées' });
    await expect(page.getByRole('checkbox', { name: /Rouvrir Acheter du pain/ })).toBeVisible();
  });

  test('la suppression d’une tâche demande confirmation', async ({ page }) => {
    await page.goto('/taches');
    await page.getByRole('button', { name: /^Supprimer Valider les rendez-vous/ }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });

  test('une dépense alimente l’ardoise', async ({ page }) => {
    await page.goto('/ardoise');
    await page.getByRole('button', { name: 'Ajouter une dépense' }).first().click();
    await page.getByLabel(/Libellé/).fill('Balade à la boulangerie');
    await page.getByLabel(/Montant/).fill('12.50');
    await page.getByRole('button', { name: /Ajouter la dépense/ }).last().click();
    await expect(page.getByText('Balade à la boulangerie')).toBeVisible();
    await expect(page.getByText('Qui doit quoi ?')).toBeVisible();
  });

  test('une carte de fidélité s’affiche en plein écran', async ({ page }) => {
    await page.goto('/fidelite');
    await page.getByRole('button', { name: /Afficher le code de/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('le calendrier affiche les jours fériés et l’agenda du jour', async ({ page }) => {
    await page.goto('/calendrier');
    await expect(page.getByRole('heading', { name: 'Calendrier' })).toBeVisible();
    await expect(page.getByText('Jours fériés').first()).toBeVisible();
  });
});

test.describe('Accessibilité et responsive', () => {
  test('aucun débordement horizontal de 360px à 1920px', async ({ page }) => {
    await openDemoSession(page);
    for (const path of ['/accueil', '/taches', '/calendrier', '/ardoise', '/cercle']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `débordement sur ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('le lien d’évitement conduit au contenu principal', async ({ page }) => {
    await openDemoSession(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toBeFocused();
  });
});

/**
 * Une tuile sans largeur est invisible sans être absente du DOM : Vitest la
 * comptait, et la grille de l'accueil s'affichait pourtant vide. Seul un
 * navigateur qui calcule la mise en page peut le voir, d'où ce test ici.
 */
test.describe('Mises en page', () => {
  test('les tuiles de la grille de l’accueil occupent une largeur réelle', async ({ page }) => {
    await openDemoSession(page);
    const grid = page.locator('main').getByRole('list', { name: 'Espaces du foyer' });
    await expect(grid).toBeVisible();

    const widths = await grid.locator('button[aria-label^="Ouvrir"]').evaluateAll((tiles) =>
      tiles.map((tile) => ({
        label: tile.getAttribute('aria-label'),
        width: Math.round(tile.getBoundingClientRect().width),
      })),
    );

    expect(widths.length).toBeGreaterThan(0);
    for (const tile of widths) {
      // Un bouton dont tout le contenu est positionné en absolu se réduit à
      // zéro s'il n'occupe pas la largeur de sa colonne.
      expect(tile.width, `${tile.label} est invisible : largeur nulle`).toBeGreaterThan(40);
    }
  });

  test('les cibles de la barre latérale respectent 44 px, même repliées', async ({ page }) => {
    // 820 px est la largeur où la barre latérale se réduit à ses icônes : le
    // libellé passe en `sr-only` et un lien sans hauteur minimale se réduit à
    // son icône. C'est là que « Préférences » tombait à 15×15.
    await page.setViewportSize({ width: 820, height: 1180 });
    await openDemoSession(page);

    const targets = page.locator('aside a[href]');
    const boxes = await targets.evaluateAll((links) =>
      links
        .filter((link) => link.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
        .map((link) => ({
          name: (link.textContent || link.getAttribute('aria-label') || '').trim(),
          width: Math.round(link.getBoundingClientRect().width),
          height: Math.round(link.getBoundingClientRect().height),
        })),
    );

    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.height, `« ${box.name} » : ${box.width}×${box.height}, sous 44 px de haut`).toBeGreaterThanOrEqual(44);
      expect(box.width, `« ${box.name} » : ${box.width}×${box.height}, sous 44 px de large`).toBeGreaterThanOrEqual(44);
    }
  });

  test('le tiroir mobile expose les dix-sept espaces, filtre et se referme', async ({ page }) => {
    test.skip(!viewportIsMobile(page), 'le tiroir n’existe que sous 650 px');

    await openDemoSession(page);
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();

    const dialog = page.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    await expect(dialog.getByRole('link', { name: /^Ouvrir / })).toHaveCount(17);

    await page.getByRole('searchbox', { name: 'Rechercher un espace' }).fill('courses');
    await expect(dialog.getByRole('link', { name: /^Ouvrir / })).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('les pages du parcours foyer démarrent en haut sur mobile', async ({ page }) => {
    test.skip(!viewportIsMobile(page), 'le centrage vertical ne gêne que sous 650 px');

    // `place-items-center` sur un viewport `min-h-screen` au contenu court
    // laissait ~40 % de vide en haut : le contenu doit démarrer près du haut.
    for (const [path, name] of [
      ['/foyer/rejoindre', 'Rejoindre un foyer'],
      ['/foyer/nouveau', 'Créer mon foyer'],
    ] as const) {
      await page.goto(path);
      const top = await page
        .getByRole('heading', { name })
        .evaluate((heading) => Math.round(heading.getBoundingClientRect().top));
      expect(top, `vide vertical en haut de ${path}`).toBeLessThan(200);
    }
  });

  test('les poignées de widgets sont tactiles (44px, sans vol de scroll)', async ({ page }) => {
    test.skip(!viewportIsMobile(page), 'poignées tactiles : mobile uniquement');

    await openDemoSession(page);

    const handle = page.getByRole('button', { name: /Réordonner : / }).first();
    await expect(handle).toBeVisible();
    // Sans `touch-action: none`, le navigateur fait défiler la page au lieu
    // de laisser dnd-kit tenir le geste : plus rien ne bouge au doigt.
    expect(await handle.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
    const box = await handle.boundingBox();
    expect(box?.width, 'poignée sous 44px de large').toBeGreaterThanOrEqual(44);
    expect(box?.height, 'poignée sous 44px de haut').toBeGreaterThanOrEqual(44);
  });

  test('glisser un widget le réordonne et le persiste', async ({ page }) => {
    test.skip(viewportIsMobile(page), 'glisser-déposer souris : bureau uniquement');

    await openDemoSession(page);

    const widgets = page.locator('[data-widget]');
    const before = await widgets.first().getAttribute('data-widget');
    const handle = page.getByRole('button', { name: /Réordonner : / }).first();
    // Le clic sur « Personnaliser » a fait défiler la page : la poignée est
    // hors viewport, et un drag hors viewport ne touche aucun élément.
    await handle.scrollIntoViewIfNeeded();
    const target = widgets.nth(1);
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();

    await expect
      .poll(async () => widgets.first().getAttribute('data-widget'), { timeout: 5000 })
      .not.toBe(before);
  });
});
