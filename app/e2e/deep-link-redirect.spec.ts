import { expect, test, type Page } from '@playwright/test';

/**
 * DLNK-02 (D-06) — redirect-after-login sur un deep link, prouvé, pas supposé :
 *
 *  1. une session valide est ouverte avec un compte AVEC foyer (mode démo :
 *     le foyer de démonstration est fourni par l'amorçage, la nuance
 *     « compte avec foyer » de 35-RESEARCH §1 y est satisfaite d'office) ;
 *  2. la session du harnais est vidée — en mode démo, la session vit dans le
 *     store persisté `ensemble-organises-session` (localStorage,
 *     session-store.ts:123). Retirer la clé simule exactement une session
 *     expirée : au rechargement, le bootstrap local ne trouve plus
 *     d'utilisateur, purge et repasse invité — le mécanisme réel du
 *     bootstrap (`use-auth.ts`), pas une contrefaçon de test ;
 *  3. cold-start `page.goto('/taches/jour')` : la garde `RequireAuth`
 *     renvoie vers `/connexion` en portant la route visée dans `state.from`
 *     (router.tsx:36) — et RIEN d'autre ne stocke cette route (D-08,
 *     interdiction localStorage/sessionStorage/indexeddb) ;
 *  4. la reconnexion — ici le bouton démo, qui passe par le MÊME `run()` que
 *     le formulaire e-mail (`navigate(requestedPath ?? '/accueil')`,
 *     sign-in-page.tsx) — rend la route visée : `/taches/jour`, vue rendue.
 *
 * La preuve de `state.from` est portée par le COMPORTEMENT post-connexion
 * (l'URL finale), pas par une lecture de stockage : lire localStorage pour
 * « vérifier » D-08 la violerait. L'écran « connexion requise » (D-07, Plan
 * 03) n'apparaît qu'HORS ligne ; ce scénario est en ligne, le formulaire
 * standard reste affiché — c'est le chemin des deux branches.
 */

const target = '/taches/jour';

/** Ouvre la session de démonstration depuis l'écran de connexion. */
async function ouvrirSessionDemo(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/** Vide la session persistée — l'équivalent démo d'une session expirée. */
async function viderSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('ensemble-organises-session');
    window.localStorage.removeItem('ensemble-organises-household');
  });
}

test.describe('redirect-after-login sur deep link (DLNK-02, D-06)', () => {
  test('session expirée → /taches/jour → connexion → retour exact à /taches/jour', async ({ page }) => {
    // 1. Session valide, foyer chargé.
    await ouvrirSessionDemo(page);

    // 2. Expiration simulée (mode démo : purge de la session persistée).
    await viderSession(page);

    // 3. Cold-start sur le deep link : la garde renvoie vers /connexion.
    await page.goto(target);
    await page.waitForURL('**/connexion');
    await expect(page.getByRole('heading', { name: 'Ravi de vous revoir' })).toBeVisible();

    // 4. Reconnexion : le même `run()` que le formulaire e-mail honore
    //    `state.from` — la route visée est rendue, pas l'accueil.
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL(`**${target}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tâches du jour' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tâches du jour' })).toBeVisible();
  });
});

/**
 * Cas hors-ligne (plan 35-04, matrice §1.4/§1.5 de 35-VERIFICATION.md).
 *
 *  - §1.5 (test G) : deep link hors-ligne SANS session → l'écran « connexion
 *    requise pour cette vue » (D-07, plan 35-03) doit être atteint, pas
 *    l'écran d'erreur « Votre foyer n'a pas pu être chargé » (WR-04). Avant le
 *    correctif 35-04, le bootstrap bloquait et le routeur ne montait jamais.
 *  - §1.4 (test H) : deep link hors-ligne AVEC session démo → la vue Tâches du
 *    jour est rendue. En mode démo le bootstrap local n'appelle pas
 *    `loadHousehold` Supabase : ce cas prouve le rendu hors-ligne de la vue ;
 *    le chemin Supabase cold-start (sessions réelles) est prouvé par les tests
 *    unitaires D/E de `auth-bootstrap-offline.test.tsx`.
 *
 * Les deux cas chargent d'abord l'app EN LIGNE pour laisser le service worker
 * prendre le contrôle : c'est lui qui sert l'application au cold-start hors
 * ligne d'une PWA installée — la navigation est interceptée par le SW, même
 * sans réseau. D-08 : aucune écriture de stockage ici — les assertions portent
 * sur l'URL et le rendu, la session est seulement PURGÉE (équivalent démo d'une
 * expiration), jamais fabriquée.
 */
async function attendreControleServiceWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
}

test.describe('deep link hors-ligne (35-04, matrice §1.4/§1.5)', () => {
  test('sans session : deep link hors-ligne → écran « connexion requise pour cette vue » (D-07)', async ({ page }) => {
    // L'app est chargée une fois en ligne (page sans session) pour que le SW
    // prenne le contrôle, comme sur une PWA installée.
    await page.goto('/connexion');
    await expect(page.getByRole('heading', { name: 'Ravi de vous revoir' })).toBeVisible();
    await attendreControleServiceWorker(page);

    // Cold-start hors-ligne sur le deep link, sans session.
    await viderSession(page);
    await page.context().setOffline(true);
    await page.goto(target);

    // Avant le correctif 35-04 : « Chargement de votre foyer… » puis l'écran
    // d'erreur WR-04. Après : le routeur monte, la garde renvoie vers
    // /connexion et l'écran D-07 est rendu.
    await page.waitForURL('**/connexion');
    await expect(page.getByRole('heading', { name: 'Connexion requise pour cette vue' })).toBeVisible();
  });

  test('avec session démo : deep link hors-ligne → vue Tâches du jour rendue', async ({ page }) => {
    await ouvrirSessionDemo(page);
    await attendreControleServiceWorker(page);

    await page.context().setOffline(true);
    await page.goto(target);

    await expect(page.getByRole('heading', { level: 1, name: 'Tâches du jour' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tâches du jour' })).toBeVisible();
  });
});
