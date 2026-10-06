import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Parcours Calendrier (phase 01-calendrier, D-01/D-03/D-09/D-10/D-11) en mode
 * démonstration (aucun backend requis, comme les autres specs e2e) :
 * - couches de référence toujours visibles, sans interrupteur ;
 * - appui long sur une case et bouton « + » ouvrent le dialogue avec date
 *   pré-remplie et calendrier explicite ;
 * - choix calendrier explicite (vide refusé dès que 2 calendriers) ;
 * - isolation de deux contextes : le calendrier perso et l'événement créés
 *   dans le contexte A n'apparaissent ni dans les vues ni dans les filtres
 *   du contexte B.
 *
 * Limite assumée du mode démo : les deux contextes ont chacun leur base
 * locale isolée, donc l'invisibilité inter-comptes côté SERVEUR (RLS) n'est
 * pas prouvable ici — elle l'est par la suite SQL 0017 (admin-denied Perso
 * en select/update/delete, témoin owner positif). Ce spec prouve le
 * comportement observable : aucune vue ni aucun filtre n'expose le Perso
 * d'un autre contexte, et les couches ref ne se masquent pas.
 */

const PARIS = 'Europe/Paris';

/** Aujourd'hui calé sur Paris (même référentiel que la grille et l'agenda). */
function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PARIS }).format(new Date());
}

/** Libellé de case « Mardi 6 octobre 2026 » (miroir de dayButtonLabel). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d, 12));
  return base[0].toUpperCase() + base.slice(1);
}

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

async function openCalendrier(page: Page) {
  await page.goto('/calendrier');
  await expect(page.getByRole('heading', { name: 'Calendrier' })).toBeVisible();
}

async function createPersoCalendar(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Calendrier perso' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom du calendrier').fill(name);
  await dialog.getByRole('button', { name: 'Créer le calendrier' }).click();
  await expect(page.getByText(`Calendrier « ${name} » créé.`)).toBeVisible();
  await expect(page.getByLabel('Filtrer par calendrier').getByRole('option', { name: `${name} (perso)` })).toBeAttached();
}

test.describe('Calendrier : couches ref et création explicite', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
    await openCalendrier(page);
  });

  test('aucun interrupteur ne masque les couches de référence', async ({ page }) => {
    // D-09/D-10 : ni bouton « Fériés », ni bouton « Vacances ».
    await expect(page.getByRole('button', { name: 'Fériés', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Vacances', exact: true })).toHaveCount(0);
    // Le bouton Anniversaires, lui, est conservé (pas une couche ref).
    await expect(page.getByRole('button', { name: 'Anniversaires', exact: true })).toBeVisible();
    // La métrique jours fériés est alimentée par le cache base.
    await expect(page.getByText('Jours fériés').first()).toBeVisible();
    await expect(page.getByText('pour cette année')).toBeVisible();
    // La légende rappelle les couches toujours affichées en fond.
    await expect(page.getByText('Jour férié').first()).toBeVisible();
  });

  test('un férié du cache est visible sans aucun interrupteur', async ({ page }) => {
    // D-10 : le « Jour de l'an » du cache démo (1er janvier de l'année en
    // cours) apparaît dans l'agenda du jour, sans qu'aucun bouton ne puisse
    // le masquer.
    const year = new Date().getFullYear();
    const target = `${year}-01-01`;
    const monthDiff =
      (new Date().getFullYear() - year) * 12 + (new Date().getMonth() - 0);
    for (let i = 0; i < monthDiff; i++) {
      await page.getByRole('button', { name: 'Mois précédent' }).click();
    }
    await page.getByRole('button', { name: new RegExp(`^${dayLabel(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await expect(page.getByText(/Jour de l.an/).first()).toBeVisible();
  });

  test('l’appui long ouvre le dialogue avec date pré-remplie', async ({ page }) => {
    // D-11 : appui long (700 ms) sur la case d'aujourd'hui.
    const iso = todayParis();
    const day = page.getByRole('button', { name: new RegExp(`^${dayLabel(iso).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    await day.scrollIntoViewIfNeeded();
    await day.hover();
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Ajouter un événement' })).toBeVisible();
    await expect(dialog.getByLabel('Date')).toHaveValue(iso);
  });

  test('le bouton plus ouvre le dialogue avec calendrier explicite', async ({ page }) => {
    // D-03/D-11 : le bouton « + » ouvre le même dialogue, date du jour
    // affiché, champ Calendrier toujours présent et sans valeur vide cachée.
    await page.getByRole('button', { name: 'Ajouter un événement' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Ajouter un événement' })).toBeVisible();
    await expect(dialog.getByLabel('Date')).toHaveValue(todayParis());
    // Le libellé porte le suffixe « * » ou « · optionnel » : ancre préfixe.
    await expect(dialog.getByLabel(/^Calendrier/)).toBeVisible();
  });

  test('le calendrier vide est refusé dès que deux calendriers existent', async ({ page }) => {
    // D-03 : avec 2 calendriers, soumettre sans choix explicite est rejeté.
    await createPersoCalendar(page, 'Perso E2E A');
    await createPersoCalendar(page, 'Perso E2E B');

    await page.getByRole('button', { name: 'Ajouter un événement' }).first().click();
    const dialog = page.getByRole('dialog');
    const calendar = dialog.getByLabel(/^Calendrier/);
    await expect(calendar.getByRole('option', { name: 'Perso E2E A (perso)' })).toBeAttached();
    await expect(calendar.getByRole('option', { name: 'Perso E2E B (perso)' })).toBeAttached();

    await dialog.getByLabel('Titre').fill('Sans calendrier');
    await dialog.getByRole('button', { name: 'Ajouter l’événement' }).click();
    await expect(dialog.getByText('Choisissez un calendrier.')).toBeVisible();

    await calendar.selectOption({ label: 'Perso E2E A (perso)' });
    await dialog.getByRole('button', { name: 'Ajouter l’événement' }).click();
    await expect(page.getByText('Ajouté au foyer.')).toBeVisible();
  });
});

test.describe('Calendrier : isolation inter-comptes (deux contextes)', () => {
  test('le perso du contexte A est invisible dans les vues et filtres de B', async ({ browser }: { browser: Browser }) => {
    // D-01 observable : deux sessions démo isolées (stockages séparés).
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await openDemoSession(pageA);
      await openDemoSession(pageB);
      await openCalendrier(pageA);
      await openCalendrier(pageB);

      // Contexte A : calendrier perso + événement secret, visibles ici.
      await createPersoCalendar(pageA, 'Perso E2E Secret');
      await pageA.getByRole('button', { name: 'Ajouter un événement' }).first().click();
      const dialogA = pageA.getByRole('dialog');
      await dialogA.getByLabel('Titre').fill('Secret E2E NePasVoir');
      await dialogA.getByLabel(/^Calendrier/).selectOption({ label: 'Perso E2E Secret (perso)' });
      await dialogA.getByRole('button', { name: 'Ajouter l’événement' }).click();
      await expect(pageA.getByText('Ajouté au foyer.')).toBeVisible();
      await expect(pageA.getByText('Secret E2E NePasVoir')).toBeVisible();

      // Contexte B : nulle part — ni dans la vue mois, ni dans la liste
      // 30 jours, ni dans le filtre calendriers.
      await expect(pageB.getByText('Secret E2E NePasVoir')).toBeHidden();
      await pageB.getByRole('tab', { name: 'Liste' }).click();
      await expect(pageB.getByText('Secret E2E NePasVoir')).toBeHidden();
      await expect(
        pageB.getByLabel('Filtrer par calendrier').getByRole('option', { name: 'Perso E2E Secret (perso)' }),
      ).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
