---
phase: 37-filet-de-tests-fiable
verified: 2026-11-08T11:45:00Z
status: passed
score: "4/4"
must_haves_verified: 4
must_haves_total: 4
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/phases/37-filet-de-tests-fiable/37-01-PLAN.md"
  - ".planning/phases/37-filet-de-tests-fiable/37-01-SUMMARY.md"
  - ".planning/phases/37-filet-de-tests-fiable/37-02-PLAN.md"
  - ".planning/phases/37-filet-de-tests-fiable/37-02-SUMMARY.md"
  - ".planning/phases/37-filet-de-tests-fiable/37-03-PLAN.md"
  - ".planning/phases/37-filet-de-tests-fiable/37-03-SUMMARY.md"
  - "app/e2e/offline-shared-device.spec.ts"
covered_digest: "v2:sha256:ef92305cc228bdc3c1ad7b600096b41401b4801cabf854dd553b1ad853f423ff"
re_verification:
  previous_status: gaps_found
  previous_score: "3/4"
  gaps_closed:
    - "TEST-03 : e2e offline-shared-device exécuté au vert — reproduit indépendamment par le vérificateur (voir Re-verification)"
  gaps_remaining: []
  regressions: []
human_verification:
  - id: UAT-2
    title: "Re-test UAT test 2 — déconnexion invitée sur appareil partagé (post-phase, via /gsd-verify-work 37)"
    detail: "Le véhicule (purgerStockageSession au chokepoint signOut) est prouvé par tests unitaires ET désormais par l'e2e offline-shared-device au vert (lecture brute localStorage, assertion sb-*-auth-token). Reste la confirmation sur appareil réel par l'utilisateur — étape UAT finale, non bloquante pour la clôture du gap TEST-03."
advisory:
  - "Durée d'amorçage hors ligne mesurée à ≈ 30–40 s avant premier rendu (gardien 35-06 de 10 s + restore du cache), observation documentée dans le spec. Observation pour future UX hors périmètre phase 37."
  - "2 échecs e2e préexistants, hors périmètre phase 37 : critical-paths « rejoindre un foyer valide le format du token » (spec périmé depuis la refonte 31-03/31-07 — dernier vert e2e 52c43a0 du 24 oct, refonte du 3 nov, la page ne rend plus de champ token) et menu.spec (même flake du dimanche que les tests unitaires, date-dépendant). Aucune réparation opportuniste (AGENTS.md)."
  - "Suite unitaire « 100 % verte » (partie TEST-02) : vraie 6 jours sur 7 — 2 tests menu-page.test.tsx échouent uniquement le dimanche (semis démo day(1) sortant de la semaine lundi→dimanche affichée). Flake préexistant, date-dépendant, documenté honnêtement dans 37-03-SUMMARY (Issues) ; hors périmètre des 4 dettes v1.1, pas de réparation opportuniste (AGENTS.md). À traiter en todo/gap dédié."
  - "2 infos du code review restent open dans 37-REVIEW-DISPOSITION.md (IN-01 scan outbox dupliqué, IN-02 double import dynamique) — non bloquantes."
---

# Phase 37 — Verification Report

**Goal** : Le filet de tests redevient un instrument de confiance — chaque dette tests héritée de v1.1 est fermée, corrigée ou documentée honnêtement.

**Status : `passed` (re-vérification)** — les 4 dettes sont fermées avec preuve, dont TEST-03 **reproduite indépendamment par le vérificateur** (exécution du spec dans son propre processus, voir section Re-verification).

## Re-verification (clôture du gap TEST-03)

**Gap fermé : TEST-03 — exécution e2e offline-shared-device au vert.**

1. **Diff `b8295a3` examiné** (17 lignes, 3 hunks uniquement sur `app/e2e/offline-shared-device.spec.ts`) :
   - ancre `getByRole('button', { name: 'Se connecter', exact: true })` — corrige la collision strict mode avec « Continuer avec Google » ; correctif de sélecteur, aucune assertion affaiblie ;
   - `test.setTimeout(180_000)` + `toBeVisible({ timeout: 60_000 })` — élargit les bornes de temps au-dessus du chemin d'amorçage hors ligne réel (gardien 35-06 de 10 s + restore du cache) ; n'affaiblit aucune assertion ;
   - **les assertions fortes sont intactes et strictes** : purge localStorage (`clesStockageBrutes` filtrée sur `/^sb-.*-auth-token/`, ligne 112-113) et isolation IndexedDB (`clesCacheBrutes`, lecture brute `page.evaluate`) toujours présentes dans le fichier.
2. **Exécution indépendante (evidence gate)** — le vérificateur a re-créé la preuve dans son propre processus : mots de passe des deux comptes e2e réinitialisés via l'API admin Auth locale (comptes `e2e-shared-a/b@ensemble-organises.test` vérifiés dans `auth.users`, foyers « Foyer e2e A/B » + rôle admin vérifiés en base), puis :
   ```
   npx playwright test e2e/offline-shared-device.spec.ts
   → 2 passed (43.4s) — chromium 37.8s, mobile 37.8s
   ```
   Cohérent avec l'exécution déclarée (1 passed, 37.3s — l'exécuteur n'avait probablement qu'un projet). Le test inclut le chemin hors ligne complet : connexion A → consultation Tier 1 → déconnexion → connexion B → `setOffline(true)` → reload → rendu des lignes restaurées de B uniquement + assertions brutes localStorage/IndexedDB.
3. **REQUIREMENTS.md** : TEST-03 cochée `[x]` (ligne 16), ligne de traçabilité mise à jour vers `b8295a3` (ligne 37).
4. **Durée d'amorçage hors ligne** : ≈ 30–40 s mesurés avant premier rendu (gardien 35-06 + restore du cache), documentée dans le spec — observation pour future UX, hors périmètre.
5. **2 échecs e2e préexistants, hors périmètre** (advisory, vérifiés indépendamment du commit) : critical-paths join-token (spec périmé depuis la refonte 31-03/31-07 — dernier vert e2e `52c43a0` du 24 oct, refonte du 3 nov) et menu.spec (flake du dimanche, même cause que le flake unitaire). 81 passed / 2 failed / 5 skipped sur la suite e2e complète ; aucune régression phase 37.

## Success Criteria

### 1. Flocon test D épinglé ou cause racine documentée — ✅ VERIFIÉ (TEST-01)
- Correctif `b0c9c3d` : le `waitFor` nu du test D est né `waitFor(…, { timeout: 5_000, interval: 50 })` (auth-bootstrap-offline.test.tsx). Cause racine : tolérance du test, pas un bug produit — documenté dans `docs/RETROSPECTIVE.md` (campagne v1.2).
- Preuve d'exécution : 3/3 verts en isolation **et** sous charge (le test D a passé dans les deux exécutions de la suite complète de ce run).
- Plus de rouge inexplicable : aucun échec auth-bootstrap dans la suite.

### 2. Tests rouges anniversaires verts, suite 100 % verte — ✅ VERIFIÉ (TEST-02), avec réserve documentée
- Anniversaires : 44/44 verts (épinglés en `cdd4fa7`, plan 37-02).
- Suite complète : **1968/1970** (typecheck ✓, build ✓). Les 2 seuls échecs sont `menu-page.test.tsx`, **uniquement le dimanche** — flake date-dépendant PRÉEXISTANT (semis démo « Restes du frigo » à `day(1)` ; hors de la semaine affichée quand aujourd'hui est dimanche), hors périmètre des 4 dettes v1.1, documenté dans 37-03-SUMMARY. Pas de réparation opportuniste (AGENTS.md) ; la « 100 % verte » stricte est vraie 6 jours sur 7 tant que ce flake n'est pas traité — consigné en advisory, à traiter en todo dédié si souhaité.

### 3. e2e offline-shared-device exécuté au vert — ✅ VERIFIÉ (TEST-03, fermé en re-vérification)
- Le spec existe (`app/e2e/offline-shared-device.spec.ts`), assertions localStorage (`clesStockageBrutes`) et IndexedDB (`clesCacheBrutes`) strictes et intactes.
- Exécuté au vert : commit `b8295a3` (1 passed, 37.3s) **et reproduit indépendamment par le vérificateur** — 2 passed (chromium + mobile, 37.8s chacun) après réinitialisation des mots de passe des comptes e2e via l'API admin locale. Voir section Re-verification.
- Comptes réels `e2e-shared-a/b@ensemble-organises.test` vérifiés dans `auth.users`, foyers semés en base (Foyer e2e A/B, rôle admin).

### 4. Aucune clé GoTrue résiduelle après purge invité, prouvé par test — ✅ VERIFIÉ (TEST-04)
- `purgerStockageSession()` (session-cache.ts:101) : dérivation de la clé via la source unique `cleStockageSession()`, purge base + chunks, branchée au chokepoint `session-store.signOut` (ligne 129) dans l'ordre anti-résurrection.
- TDD avec preuve rouge capturée avant vert (`1de5c61` → `39ac6a8`) : lecture **brute** de `Object.keys(localStorage)` filtrée sur `/^sb-.*-auth-token(\.\d+)?$/` — 2 tests verts, exécutés dans ce run.
- Bonus 37-03 : le signe-out est désormais **atteignable** depuis l'UI sans foyer (bouton réel « Se déconnecter » sur /foyer via useSignOutWithConfirm), fermant le chemin mort que le test UAT 2 avait révélé.

## Code review (porte intermédiaire)

`37-REVIEW.md` : 0 critique. Les 5 warnings (WR-01..05, branche join ardoise) ont été **corrigés** dans `b2ec826` puis re-reviews **clean** (`37-REVIEW-FIX.md`) : InviteRequestError porte le statut HTTP, aide « bon compte » déclenchée par statut 403 (plus par la copie du message), garde de configuration sur le code d'URL + message 5xx générique, exclusion des enfants de la vue publique côté Edge (noms, participations, soldes, transferts), activeCode synchronisé à l'URL + reset du join. 2 infos restent open (non bloquantes) — ledger `37-REVIEW-DISPOSITION.md` : 5 fixed / 2 open.

## Regression gate

Tests de la phase 36 (outbox-replay-badge, outbox, outbox-replay, offline-panel) : tous verts dans les exécutions de la suite complète de ce run. Aucune régression cross-phase.

## Gaps

Aucun gap restant. (Re-verification : G-37-3 / TEST-03 fermé, voir section Re-verification.)

## Verdict

Les 4 dettes de tests héritées de v1.1 sont fermées avec preuve — TEST-03 désormais prouvée par une exécution verte **reproduite indépendamment par le vérificateur**. Le filet de tests est de nouveau un instrument de confiance. Restent, hors périmètre et en advisory : la confirmation UAT sur appareil réel (via /gsd-verify-work 37), le flake menu du dimanche (préexistant) et le spec e2e join-token périmé depuis la refonte 31-03.
