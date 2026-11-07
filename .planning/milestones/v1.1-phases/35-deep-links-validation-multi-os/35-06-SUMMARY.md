---
phase: 35-deep-links-validation-multi-os
plan: 06
subsystem: auth-bootstrap / data-adapter
tags: [deep-links, offline, android, bootstrap-watchdog, g35-3]
requires: [35-04 (bootstrap tolérant au hors-ligne), dlnk02 diagnostic]
provides: [gardien d'amorçage 10 s, délai d'abandon des lectures list]
affects: [use-auth.ts, supabase-adapter.ts]
tech-stack:
  added: []
  patterns: [Promise.race sémantique (setTimeout + témoin), AbortController manuel injectable]
key-files:
  created:
    - app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx
  modified:
    - app/src/hooks/use-auth.ts
    - app/src/lib/data/supabase-adapter.ts
    - app/src/lib/data/supabase-adapter.test.ts
    - app/src/stores/__tests__/load-household-offline.test.ts
    - app/src/modules/courses/courses-offline-writes.test.tsx
decisions:
  - Témoin `reglee` scoped à la CHAÎNE D'AMORÇAGE uniquement (option b de la revue) : le listener onAuthStateChange reste hors garde — son rattrapage légitime (TOKEN_REFRESHED/SIGNED_IN) serait supprimé par un verrou ; couverture listener = RLS serveur + comportement préexistant (documenté en tête du fichier de test).
  - Abandon par AbortController + setTimeout manuel, PAS AbortSignal.timeout (minuteries internes échappant à vi.useFakeTimers — X1 jamais vert) ; délai injectable via SupabaseAdapter.setDelaiLecturePourTest.
  - Abandon porté par `list` UNIQUEMENT : une écriture avortée à mi-course serait ré-enfilée par l'outbox — contrat de rejeu intact (T-35-10).
  - Angle mort e2e comblé par un test d'intégration vitest au niveau fetch (W1), PAS par un projet Playwright avec VITE_SUPABASE_URL : setOffline force navigator.onLine=false déterministe (reproduirait mécaniquement le scénario 35-04, pas le couple Android onLine=true + réseau mort) ; un backend factice devrait ré-implémenter les délais de GoTrue ; W1 exerce le VRAI GoTrueClient 2.117.2 (initializePromise, _recoverAndRefresh) contre un vrai fetch bloqué.
metrics:
  duration: ~1h30
  completed: 2026-11-06
status: complete
estimate:
  tokens: 62000
  raw_tokens: 35000
  tasks: 3
  confidence: low
actuals:
  tokens: 76000
  tasks: 3
  commits: 5
commits: 5
plan_head_before: 4d089f12a3dbd789edefbfcabef012f76ea02153
plan_head_after: 5f458fc8450cbd85a08a9918f9c45ba689acb183
requirements: [DLNK-02, DLNK-03]
---

# Phase 35 Plan 06: Gardien d'amorçage + délai d'abandon — gap G-35-3 (Android §1.4 cold-start offline avec session) Summary

**Une chaîne d'amorçage qui hang (GoTrue initializePromise en refresh réseau bloquant) est coupée à 10 s et retombe sur le chemin invité ; onLine=true trompeur (H1) ne protège plus le hang, et un fetch `list` qui hang rejette en 10 s pour réactiver le repli foyer persisté.**

## Ce qui a été fait

### Task 1 — Gardien d'amorçage (couche 1, mécanisme primaire)
- `DELAI_GARDIEN_AMORCAGE_MS = 10_000` exporté dans use-auth.ts ; `setTimeout`/`clearTimeout` appariés (démontage + résolution de la chaîne).
- À l'échéance sans témoin posé : `console.warn` explicite (§2.7 F) puis `cheminInvite()` existant (purge best-effort + setReady) — idempotent, T-35-06 préservé structurellement (le chemin invité n'applique jamais la session).
- Le gardien ne consulte JAMAIS `onlineManager` : `navigator.onLine` vaut true en mode avion Android (H1) — c'est précisément la source trompeuse.
- Témoin `reglee` posé par le premier point de sortie (chaîne OU gardien) ; gardes dans chaque branche de la chaîne (top du .then, post-applySession avec re-purge, catch) : une résolution tardive à 12 s ne ré-applique pas la session.
- Tests W1-W4, vus ROUGES (4 failed) avant implémentation : W1 = **vrai** client `createClient('@supabase/supabase-js')` + fetch jamais résolu + session expirée semée (`sb-stub-gardien-auth-token`) + navigator.onLine=true (jsdom) — exactement le couple Android (H1+H2).

### Task 2 — Délai d'abandon dans SupabaseAdapter.list (couche 2)
- AbortController manuel + `setTimeout(DELAI_LECTURE_MS=10_000)` injectable (`SupabaseAdapter.setDelaiLecturePourTest`), aligné sur le gardien (commentaire de cohérence). **Aucun `AbortSignal.timeout`** dans le code (une seule occurrence grep = le commentaire qui nomme son interdiction).
- Enveloppé en `DataError` nommant le délai dépassé ; minuterie annulée en `finally`.
- Uniquement `list` — create/update/remove/removeWhere intouchés (contrat outbox, T-35-10).
- X3 : chemin bout-en-bout avec le VRAI adaptateur derrière le mock de `@/lib/data` — le hang converti en rejet rapide réactive le repli foyer persisté de loadHousehold LORSQUE onLine=false ; session-store.ts:178 non touché.

### Task 3 — Chaîne §2.7 + consignation
- typecheck ✓, `npm test` ✓ (239 fichiers / **1902 tests**, 0 failed), `npm run build` ✓, `npx playwright test deep-link-redirect` ✓ (**6 passed**, aucun spec modifié), `check-sql-statique` ✓ + ses cas qui doivent échouer ✓. `test-db.sh` non exécuté : aucune modification SQL (aucune migration touchée).
- deferred-items.md : item « DLNK-02 Android » annoté 35-06 — **le rejeu on-device Android 16 via le test 3 de 35-UAT.md reste le véhicule de fermeture de G-35-3** (D-11).
- Aucun fichier sous supabase/ modifié ; git status propre hors app/ et .planning/.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Harnais courses G-34-1 : le faux builder n'avait pas `abortSignal`**
- **Found during:** Task 3 (chaîne §2.7, `npm test`)
- **Issue:** `list` attache désormais un signal ; le harnais de courses-offline-writes.test.tsx simulait un PostgrestBuilder sans cette méthode → « query.abortSignal is not a function », cas (c) et (d) rouges.
- **Fix:** `abortSignal: () => builder` en acceptation sans effet dans le harnais (les lectures y résolvent, aucun abandon simulé).
- **Files modified:** app/src/modules/courses/courses-offline-writes.test.tsx
- **Commit:** 5f458fc

**2. [Rule 1 - Bug] builderPendant des tests renvoyait le simple objet au lieu de la promesse hybride**
- **Found during:** Task 2 (GREEN)
- **Issue:** `abortSignal` retournait l'objet chaînable non-thenable : l'await résolvait à vide au lieu de hang/rejeter — X1 vert pour une mauvaise raison.
- **Fix:** renvoyer l'hybride `Object.assign(promesse, builder)` (contrat PostgrestBuilder).
- **Files modified:** les deux fichiers de test concernés.

**3. [Rule 3 - Blocking] Artefact de harnais : le chargement dynamique de `@/app/router` traverse des I/O hors microtasks**
- **Found during:** Task 1 (W3 rouge sur code correct)
- **Issue:** l'import dynamique se résolvait après la fermeture de l'`act` : le `setReady` final n'était jamais flushé dans `result.current` — faux rouge.
- **Fix:** pré-chauffe du module routeur dans `beforeEach` (import résolu en microtask ensuite) ; commenté comme artefact de harnais, pas du code sous test.

## Known Stubs

None — aucune donnée simulée dans le chemin de production.

## Threat Flags

Aucune surface nouvelle : AbortController/setTimeout sont des API de plateforme, aucune dépendance ajoutée (T-35-SC inchangé, déjà clôturé dans 35-SECURITY.md). Menaces T-35-09/10/11 du plan couvertes : W1/W2 prouvent user null + jamais 'authenticated' (T-35-06 structurel), les écritures non signalées (T-35-10), la purge injustifiée sur réseau lent >10 s acceptée et journalisée (T-35-11).

## Verification Commands

```
cd app && npm run typecheck                      # ✓ 0 erreur
npx vitest run src/hooks/__tests__               # ✓ 7 passed
npx vitest run src/lib/data/supabase-adapter.test.ts src/stores/__tests__  # ✓ (10 + 220)
npm test                                          # ✓ 239 files / 1902 tests, 0 failed
npm run build                                     # ✓
npx playwright test deep-link-redirect --reporter=list  # ✓ 6 passed
python3 scripts/check-sql-statique.py             # ✓ aucun défaut (230 fonctions, 179 migrations)
python3 scripts/test-check-sql-statique.py        # ✓ 6 cas verts
```

## Self-Check: PASSED
