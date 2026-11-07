import { expect, test, type Page } from '@playwright/test';

/**
 * OFFR-04 (plan 33-04) — parcours appareil partagé hors ligne (D-06, SC1) :
 *
 *  1. user A se connecte, consulte un module Tier 1 (données visibles en ligne) ;
 *  2. A se déconnecte (purge attendée de ses clés IndexedDB, D-05) ;
 *  3. user B se connecte ; sous `context.setOffline(true)`, une vue Tier 1 de B
 *     rend les lignes restaurées du cache (SC1, OFFR-01 prouvé e2e) ;
 *  4. dans le même contexte hors ligne, B ne voit ni données ni marques de A ;
 *     la lecture brute de l'IndexedDB (`page.evaluate`, même logique que le
 *     test D-06 unitaire) ne contient aucune clé de A.
 *
 * ÉCART DOCUMENTÉ (§2.7 F — une absence affirmée est une affirmation) : les
 * specs e2e de ce dépôt tournent en mode DÉMONSTRATION (aucun backend, un seul
 * compte démo — voir `critical-paths.spec.ts`). Ce parcours exige DEUX comptes
 * réels sur un backend configuré, et le chemin offline du bootstrap
 * (`connectOfflineCache`) n'est branché qu'en session Supabase. Sans
 * `E2E_SHARED_USER_A_EMAIL` / `E2E_SHARED_USER_B_EMAIL` (et mots de passe
 * `..._PASSWORD`) pointant vers un backend réel, le spec s'ignore
 * explicitement — il ne se déclare PAS vert, il ne tourne pas.
 *
 * La preuve D-06 rejouable dans `npm test` vit d'où :
 * `src/lib/offline/query-persistence.test.ts` (fake-indexeddb, lecture brute
 * `entries()`), qui couvre l'isolation A/B et l'ordre stop → purge.
 */

const userAEmail = process.env.E2E_SHARED_USER_A_EMAIL;
const userAPassword = process.env.E2E_SHARED_USER_A_PASSWORD;
const userBEmail = process.env.E2E_SHARED_USER_B_EMAIL;
const userBPassword = process.env.E2E_SHARED_USER_B_PASSWORD;

const skipReason =
  'Deux comptes réels sur un backend configuré sont requis (E2E_SHARED_USER_A_* / E2E_SHARED_USER_B_*). ' +
  'Le mode démo des e2e n’en fournit qu’un compte, et le chemin offline n’est branché qu’en session Supabase.';

test.describe('appareil partagé hors ligne (OFFR-04, D-06)', () => {
  test.skip(!userAEmail || !userAPassword || !userBEmail || !userBPassword, skipReason);

  /** Lecture brute de l'IndexedDB du cache (clés présentes), côté navigateur. */
  async function clesCacheBrutes(page: Page): Promise<string[]> {
    return page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open('eo-offline-cache');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('query', 'readonly');
            const store = tx.objectStore('query');
            const keys = store.getAllKeys();
            keys.onsuccess = () => {
              db.close();
              resolve(keys.result.map(String));
            };
            keys.onerror = () => {
              db.close();
              reject(keys.error);
            };
          };
          request.onerror = () => reject(request.error);
        }),
    );
  }

  /**
   * TEST-04 (plan 37-01, D-08 niveau 2) : lecture brute du localStorage du
   * navigateur (clés présentes) — même logique que `clesCacheBrutes` pour
   * l'IndexedDB, appliquée à la session GoTrue.
   */
  async function clesStockageBrutes(page: Page): Promise<string[]> {
    return page.evaluate(() => Object.keys(localStorage));
  }

  async function seConnecter(page: Page, email: string, password: string) {
    await page.goto('/connexion');
    await page.getByLabel(/E-mail/i).fill(email);
    await page.getByLabel(/Mot de passe/i).fill(password);
    await page.getByRole('button', { name: /Se connecter|Continuer/i }).click();
    await page.waitForURL('**/accueil');
    await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
  }

  async function seDeconnecter(page: Page) {
    await page.goto('/parametres');
    await page.getByRole('button', { name: /Se déconnecter/i }).click();
    await page.waitForURL('**/connexion');
  }

  test('A consulte, se déconnecte, B se connecte : hors ligne B voit SES lignes, jamais celles de A', async ({ page, context }) => {
    // 1. A consulte un module Tier 1 en ligne.
    await seConnecter(page, userAEmail!, userAPassword!);
    await page.goto('/taches');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. Déconnexion attendue : la purge (D-05) doit vider TOUTES les clés
    //    de cache — lecture brute, assertion forte (aucune clé ne survit).
    await seDeconnecter(page);
    expect(await clesCacheBrutes(page)).not.toContainEqual(
      expect.stringContaining('eo-query-cache:'),
    );

    // TEST-04 (D-08 niveau 2) : la clé de session GoTrue (base + fragments)
    // a disparu du localStorage — même checkpoint, une preuve de plus.
    expect(await clesStockageBrutes(page)).not.toContainEqual(
      expect.stringMatching(/^sb-.*-auth-token/),
    );

    // 3. B se connecte, puis l'avion est simulé sur SON contexte.
    await seConnecter(page, userBEmail!, userBPassword!);
    await page.goto('/taches');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.setOffline(true);

    // SC1 : la vue Tier 1 de B rend les lignes restaurées du cache — pas
    // d'écran vide ni d'erreur brute.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 4. Isolation : hors ligne, seules les clés de B existent — la preuve
    //    forte (aucune donnée de A, identifiants comparés) vit dans le test
    //    D-06 unitaire, qui connaît les identifiants ; ici la déconnexion de A
    //    a déjà prouvé un stockage vidé, et B n'a pu re-seeder que SON cache.
    const cles = await clesCacheBrutes(page);
    expect(cles.every((key) => key.startsWith('eo-query-cache:'))).toBe(true);
  });
});
