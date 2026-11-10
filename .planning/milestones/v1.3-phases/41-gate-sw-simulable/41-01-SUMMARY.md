---
phase: 41-gate-sw-simulable
plan: 01
subsystem: pwa-service-worker
tags: [sw-gate, e2e-reel, outbox, workbox, vite-pwa]
requires: [D-03 (query outbox source unique), D-09 (mode prompt), D-17 (verbatims DOM)]
provides: [scripts/test-sw-gate.sh, scripts/e2e-sw-server.mjs, app/e2e/sw-gate-real.spec.ts, app/src/lib/e2e-sw-harness.ts]
affects: [app/src/sw.ts, app/src/main.tsx, app/playwright.config.ts, docs/EXPLOITATION.md]
tech-stack:
  added: []
  patterns: [harnais flag-compilé au build (tree-shaking sur constante d'env), serveur statique Node natif à symlink relu, contrôle négatif vu rouge]
key-files:
  created:
    - app/src/lib/e2e-sw-harness.ts
    - app/e2e/sw-gate-real.spec.ts
    - scripts/e2e-sw-server.mjs
    - scripts/test-sw-gate.sh
  modified:
    - app/src/main.tsx
    - app/src/sw.ts
    - app/playwright.config.ts
    - docs/EXPLOITATION.md
decisions:
  - Harnais flag-compilé (VITE_E2E_SW_HARNESS=1), file écrite via enqueueOutbox sur le queryClient de l'app — jamais réimplémentée
  - Attente d'état nommé : worker A « activated » avant tout reload de commutation
  - sw.ts perd le self.skipWaiting() au démarrage (gate prompt D-09) et gagne le handler SKIP_WAITING requis par injectManifest
metrics:
  duration: 12m
  completed: 2026-11-10
  tasks: 3
status: complete
commits: 3
plan_head_before: 0ebf6c1214d93bac72c835604ad864bcd1bf64c5
plan_head_after: 9b99cbf
actuals:
  tokens: 200000
  tasks: 3
  commits: 3
estimate: 450000
---

# Phase 41 Plan 01: Gate SW « file vide » simulable de bout en bout Summary

GATE-01 prouvée e2e contre deux builds réels servis sur le même origin : precache distinct prouvé par diff, revalidation réelle de `/sw.js`, worker en attente réel, bandeau réel, application bloquée tant que la file d'écritures pendantes n'est pas vide — et le contrôle négatif vu rouge avant d'être vu vert.

## Ce qui a été livré

- **Harnais** (`app/src/lib/e2e-sw-harness.ts`) : `window.__eoSwHarness {buildId, ready(), injectOutboxPending(), clearOutbox()}`, tout le contenu derrière `import.meta.env.VITE_E2E_SW_HARNESS === '1'` — branché par import dynamique depuis `main.tsx` derrière la même garde. Aucune réimplémentation de la gate : la file est écrite par `enqueueOutbox` sur le `queryClient` exporté de `query-policy.ts` (D-02/D-03).
- **Serveur du harnais** (`scripts/e2e-sw-server.mjs`) : Node natif (`node:http`, zéro dépendance), `Cache-Control: no-cache` sur toutes les réponses (reproduit `expires -1` de `nginx.conf`, Pitfall 3), repli SPA, MIME par extension, garde anti-traversal, symlink `scripts/dist-current` relu à chaque requête (Pitfall 6 — commutation à chaud sans coupure).
- **Wrapper** (`scripts/test-sw-gate.sh`) : en-tête prouve/ne prouve pas, refus nommé sans prérequis, build standard sans flag puis `dist-v1`/`dist-v2` (`VITE_BUILD_ID=gate-a|gate-b`, `VITE_E2E_SW_HARNESS=1` en env de build uniquement — jamais dans `.env.app` ni compose), preuve A1 (buildId incrusté), preuve SC1 (`cmp -s sw.js` → refus si identiques), couverture precache par swap temporaire de symlink, serveur vérifié VIVANT (`kill -0`) avant chaque curl, un seul fichier spec + `--project=chromium` + `--workers=1`, purge rapportée, verdict fidèle.
- **Spec** (`app/e2e/sw-gate-real.spec.ts`) : 4 cas en `describe.serial`, verbatims D-17 en toutes lettres (« Une mise à jour est disponible », « Recharger », « Mise à jour en préparation… »), attentes d'état nommé uniquement (aucun `waitForTimeout`), refus nommé sans entrées (`variableRequise`, JT-03).
- **Routage** (`app/playwright.config.ts`) : `testIgnore` à deux conditions coexistantes (sw-gate ↔ `E2E_SW_BASE_URL`, join-token ↔ `E2E_BASE_URL`), `webServer` désactivé sous `E2E_SW_BASE_URL` (sinon collision `vite preview`/serveur harnais sur 4173). Le run standard reste 100 % vert (JT-01, vérifié : 163 passed / 9 skipped).
- **GATE-PROD** (`docs/EXPLOITATION.md`) : observatoire hors jalon consigné — déclenchement = première mise en production naturelle, renvoi aux tests 32-UAT 7 / 35-UAT 2 (la ligne Todos de STATE.md reste inchangée), bornage prouvé/non prouvé.

## Assumptions vérifiées

- **A1** : `import.meta.env.VITE_BUILD_ID` est peuplé depuis l'environnement au build — preuve A1 du wrapper (`grep -rq gate-a dist-v1/assets`) verte, recours `define` non nécessaire (vite.config.ts inchangé).
- **A2 (preuve anti-prod)** : build standard (sans flag) → grep du bundle `dist-std/assets/*.js` (hors `.map`) pour `__eoSwHarness` / `e2e-sw-harness` = **0 occurrence**, consigné par le wrapper avant tout lancement (`✓ grep du bundle standard : 0 occurrence de __eoSwHarness / e2e-sw-harness`).
- **A3** : le precache des deux builds diffère — preuve par `cmp -s dist-v1/sw.js dist-v2/sw.js` refusée non vide (`✓ diff dist-v1/sw.js ≠ dist-v2/sw.js`).
- **A4 — `OutboxEntry` verbatim** (`app/src/lib/offline/outbox.ts` l.38-52) :

  ```ts
  export interface OutboxEntry {
    key: string;            // identité d'entité (buildEntityKey), fusion D-04
    table: string;
    operation: OutboxOperation;
    id?: string;            // create/update/remove sur table à id
    filter?: Record<string, unknown>;  // removeWhere : le filtre EST l'identité
    values?: Record<string, unknown>;  // create/update : valeurs finales à rejouer
    clientKey?: string;     // uuid client (D-05/D-14), idempotence du rejeu
    enqueuedAt: number;
    status: 'pending' | 'failed';
  }
  ```

  Le harnais enfile via `enqueueOutbox(queryClient, { table: 'tasks', operation: 'update' }, { id: 'e2e-gate-task', values: {...} })` : la forme d'entrée est construite par le code de production (`buildEntry`), jamais dupliquée.
- **A5 — établissement du couple (utilisateur, foyer)** : le harnais garantit la session par le canal officiel `signInDemo()` (camille / foyer de démonstration) si `useSessionStore.getState()` n'est pas déjà `authenticated`, puis lit `useSessionStore.user.id` + `useHouseholdStore.householdId` ; échec nommé si le couple manque. Miroir exact du mode démonstration de `critical-paths.spec.ts` (`/connexion` → « Entrer dans la démonstration » → `**/accueil`).

## Preuve rouge-avant-vert (contrôle négatif, §2.7 B)

Commande exacte : `TEST_SW_GATE_CONTROLE_ROUGE=1 sh scripts/test-sw-gate.sh` → **EXIT=0** du wrapper (le run doit échouer pour que le script réussisse).

Sortie observée (2026-11-10, `/tmp/opencode/rouge-run2.log`) :

```
  1 failed
    [chromium] › e2e/sw-gate-real.spec.ts:269:3 › … › contrôle négatif : servir deux fois le même build ne propose aucune mise à jour
✓ contrôle négatif VU ROUGE : la simulation est falsifiable
```

(le test échoue sur `toHaveCount(0)` du bandeau, l.284 : sous commutation forcée, le bandeau apparaît — donc le contrôle détecte bien la mise à jour qu'il est censé ne PAS voir dans l'état committé, où il est vert).

## Déviations de plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `self.skipWaiting()` au démarrage de `app/src/sw.ts` rendait la gate D-09 injoignable**
- **Found during:** Task 1 (run du tracer)
- **Issue:** le worker B s'activait immédiatement — aucun événement `waiting`, aucun bandeau jamais poussé. L'ancien comportement datait de `generateSW` (qui ajoutait `SKIP_WAITING` automatiquement) ; le passage à `injectManifest` exige un handler écrit à la main.
- **Fix:** retrait du `skipWaiting()` de démarrage ; handler de message étendu (`SKIP_WAITING` → `void self.skipWaiting()`, explicitement déclenché par le clic « Recharger » de l'utilisateur uniquement).
- **Files modified:** `app/src/sw.ts`
- **Commit:** d0d44b5

**2. [Rule 1 - Bug] Reload de commutation trop tôt : le build B s'installait comme PREMIER worker**
- **Found during:** Task 2 (cas nominal après correction 1 — la spec échouait à 30 s alors que le debug manuel voyait le bandeau à t+3 s)
- **Issue:** reproducteur (debug : reload sans attente → buildId `gate-b` immédiat, aucun bandeau) : si le worker A n'a pas fini d'installer son precache (152 entrées) avant le reload, le navigateur n'a rien à revalider — le build B devient le premier worker et s'active directement, aucun `waiting`, aucun bandeau.
- **Fix:** attente d'état nommé dans `demarrerSurBuildA` : `expect.poll` sur `reg.active.state === 'activated'` (30 s) avant toute commutation.
- **Files modified:** `app/e2e/sw-gate-real.spec.ts`
- **Commit:** 84b8a26

**3. [Rule 2 - Check manquant] Le wrapper dirigeait le run vers un serveur étranger sans le voir**
- **Found during:** Task 2 (run rouge du 2026-11-10)
- **Issue:** un serveur oublié d'une session précédente occupait le port 4173 ; le serveur du wrapper mourait en `EADDRINUSE` mais le curl de readiness recevait un 200 du processus étranger — tout le run aurait tourné contre le mauvais serveur sans aucun signe (§2.7 F : un succès muet est un échec inexpliqué).
- **Fix:** `kill -0 $SERVEUR_PID` avant chaque curl de readiness — serveur mort = refus nommé + exit 1.
- **Files modified:** `scripts/test-sw-gate.sh`
- **Commit:** d0d44b5

## Chaîne §2.7 (arbre final, sans segment Docker — aucun SQL touché)

```
npm run typecheck            ✓ (tsc --noEmit, 0 erreur)
npm test                     ✓ 244 fichiers, 1998 tests passed
npm run build                ✓ (dist + sw.js générés)
npm run test:e2e             ✓ 163 passed, 9 skipped
python3 scripts/check-sql-statique.py
                             ✓ 231 fonctions effectives sur 182 migrations et 107 tests, aucun défaut
sh scripts/test-sw-gate.sh   ✓ 4 cas verts (EXIT=0)
TEST_SW_GATE_CONTROLE_ROUGE=1 sh scripts/test-sw-gate.sh
                             ✓ contrôle négatif vu rouge (EXIT=0)
```

Aucun fichier de sources gate modifié hors autorisation : `git diff` nul sur `sw-register.ts`, `use-outbox-gate.ts`, `update-banner.tsx` (vérifié avant commits, `DIFF_PROTEGE=0`). `onNeedRefresh` n'apparaît que dans `sw-register.ts`.

## Commits

- d0d44b5 : feat(41-01): harnais e2e de la gate SW — deux builds réels servis sur le même origin
- 84b8a26 : test(41-01): spec e2e réelle de la gate SW — quatre cas, contrôle négatif vu rouge
- 9b99cbf : docs(41-01): GATE-PROD consigné comme observatoire hors jalon

## Known Stubs

None — aucun stub, aucun test marqué skip, aucune branche muette : les 4 cas de la spec tournent à chaque invocation du wrapper et échouent sans leurs entrées (JT-03).

## Self-Check: PASSED

- `app/src/lib/e2e-sw-harness.ts`, `app/e2e/sw-gate-real.spec.ts`, `scripts/e2e-sw-server.mjs`, `scripts/test-sw-gate.sh` : FOUND
- Commits d0d44b5, 84b8a26, 9b99cbf : FOUND dans `git log`
- `git rev-list --count 0ebf6c1..HEAD` = 3 (mesuré, frontmatter `commits: 3`)
