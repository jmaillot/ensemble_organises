---
phase: 33-cache-de-lecture-offline
plan: 04
subsystem: offline-cache
tags: [offline, purge, shared-device, namespace, e2e, tdd]
requires: ["33-01 (socle persist/restore)", "33-03 (allowlist + connectOfflineCache)"]
provides: ["purgeUserCache(userId|null) tous foyers", "stopPersisting() garde anti-throttle", "signOut goulot purge awaitée", "switchWithPurge ordre purge→clear→switch"]
affects: ["use-auth signOut", "profile-form (toast existant)", "futur sélecteur de foyer"]
tech-stack:
  added: []
  patterns: ["goulot unique de purge (classe, pas instance)", "garde cancelled sur persister throttlé", "espions d'ordre avec délégation au réel (vi.mock + importOriginal)"]
key-files:
  created: ["app/e2e/offline-shared-device.spec.ts"]
  modified:
    - app/src/lib/offline/query-persistence.ts
    - app/src/lib/offline/query-persistence.test.ts
    - app/src/stores/session-store.ts
    - app/src/stores/session-store.test.ts
    - app/src/stores/household-store.ts
    - app/src/stores/household-store.test.ts
    - app/src/hooks/use-auth.ts
    - app/src/hooks/use-auth.test.ts
decisions:
  - "La purge vit dans le goulot useSessionStore.signOut() (D-05 : corriger la classe, pas l'instance) — use-auth ne duplique rien."
  - "stopPersisting() ajoute une garde cancelled sur le persister : la traîne du throttle TanStack en vol ne peut pas ressusciter la clé purgée (Pitfall 6, T-33-13) — l'unsubscribe seul ne suffit pas, prouvé par test."
  - "L'échec de purge remonte avec la copy UI-SPEC dans le message d'erreur : profile-form toast déjà `error.message` et ne navigue pas — aucun changement d'UI nécessaire."
  - "switchWithPurge prend le queryClient en paramètre (pas de cycle d'import router↔store) ; le setter sync switchHousehold reste la dernière étape."
metrics:
  duration: 77 min
  completed: 2026-11-04
  tasks: 3
status: complete
estimate:
  tokens: 110000
actuals:
  tokens: 55800
  tasks: 3
  commits: 8
plan_head_before: 3ba1bb29b09cf95ce36ef3bd0438ae5b000adec6
plan_head_after: 55e55f0
requirements: [OFFR-04]
---

# Phase 33 Plan 04: Purge appareil partagé (OFFR-04) Summary

**Purge namespace de tous les caches d'un utilisateur (tous foyers) awaitée au goulot signOut et au changement de foyer, preuve D-06 par lecture brute du stockage — la déconnexion ne laisse plus rien derrière elle.**

## Livré

- **`purgeUserCache(userId | null)`** (query-persistence.ts) : lit `entries()` du store IndexedDB, supprime toutes les clés préfixées `eo-query-cache:<userId>:` (tous foyers, D-03). Le préfixe passe par `cacheKey(userId, '')` — source unique, aucun littéral recopié. `null` = no-op commenté (démo, Pitfall 7). Erreurs propagées, jamais avalées (§2.7 F).
- **`stopPersisting()`** : unsubscribe + garde `cancelled` sur le persister courant. Prouvé par test : la traîne du throttle TanStack en vol n'exécute plus de `setItem` muet — sans cette garde, la clé purgée réapparaissait (test 4, T-33-13).
- **Goulot `signOut`** (session-store.ts) : `stopPersisting()` → `purgeUserCache(userId)` (lu AVANT effacement) → `set({user:null,...})` + reset foyer. Échec de purge = throw avec la copy UI-SPEC — déconnexion BLOQUÉE (D-05, T-33-10/11). Les 4 chemins (use-auth, listener SIGNED_OUT, branches bootstrap, mode local) y passent.
- **`switchWithPurge`** (household-store.ts) : ordre strict `stopPersisting → purgeCache(foyer quitté) → queryClient.clear() → switchHousehold`, prouvé par journal d'ordre et par un espion `clear` qui voit l'ancien householdId encore posé (D-04, Pitfall 5, T-33-12).
- **Preuve D-06** (query-persistence.test.ts) : A consulte → purge → lecture brute `entries()` vide pour A → restore de B sans aucune donnée de A ; coexistence A/B intacte pour B ; rejouable dans `npm test`.
- **E2e** `offline-shared-device.spec.ts` : parcours complet écrit (setOffline, lecture brute IndexedDB via page.evaluate) — **skip explicite** tant que deux comptes réels ne sont pas fournis (voir Écarts).

## Vérification exécutée

- `npx vitest run src/lib/offline src/stores src/hooks/use-auth.test.ts` : 54/54 verts (dont 10 nouveaux tests purge/goulot/switch).
- `npm test` complet : 1768/1770 — les 2 échecs restants sont les tests anniversaires **préexistants**, documentés hors périmètre (cf. contexte d'exécution, non causés par ce plan).
- `npm run typecheck` : vert. `npm run build` : vert (dist/sw.js généré).
- `npx playwright test e2e/offline-shared-device.spec.ts` : **1 skipped** avec la raison en message.
- grep : aucun `void purge` ni purge non-attendue dans session-store / household-store / use-auth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Fonctionnalité critique] Garde `cancelled` sur le persister (T-33-13)**
- **Found during:** Task 1
- **Issue:** l'unsubscribe de TanStack n'annule pas la traîne du throttle déjà planifiée : une sauvegarde en vol réécrivait la clé APRÈS la purge.
- **Fix:** `stopPersisting()` invoque aussi une marque interne qui rend `setItem` muet (WeakMap persister→cancel).
- **Files modified:** app/src/lib/offline/query-persistence.ts
- **Commit:** a9a2dc7

**2. [Rule 1 - Adaptation de tests] use-auth.test.ts : signOut devenu asynchrone**
- **Found during:** Task 2 (npm test global)
- **Issue:** deux tests appelaient `signOut()` sans l'attendre (contrat sync d'avant) ; la purge awaitée retarde l'effacement d'état, voulu par D-05.
- **Fix:** `await` direct + `waitFor` sur le listener SIGNED_OUT.
- **Files modified:** app/src/hooks/use-auth.test.ts
- **Commit:** 55e55f0

**3. [Rule 1 - Typecheck] Ombre `get` dans le nouveau test goulot**
- **Found during:** Task 2 (typecheck)
- **Fix:** suppression de l'import dynamique local qui masquait l'import top-level.
- **Commit:** c15acd5

### Écarts documentés (§2.7 F — une absence affirmée est une affirmation)

1. **E2e offline : skip, pas vert.** Les specs Playwright du dépôt tournent en mode démonstration (un seul compte démo, aucun backend), et le chemin offline (`connectOfflineCache`) n'est branché qu'en session Supabase. Le spec `offline-shared-device.spec.ts` est écrit (parcours complet : setOffline, lecture brute IndexedDB, SC1 avant isolation) et s'ignore via `test.skip(condition, raison)` tant que `E2E_SHARED_USER_A/B_EMAIL`/`_PASSWORD` ne pointent pas vers un backend réel. La preuve D-06 rejouable vit dans le test unitaire fake-indexeddb (lecture brute `entries()`).
2. **Sélecteur de foyer introuvable.** Le plan demandait de faire passer « l'appelant du sélecteur de foyer (paramètres) » à `switchWithPurge` : le grep confirme qu'aucun appelant de `switchHousehold` n'existe dans `app/src` (ni modules, ni composants) — l'app ne propose pas encore de changement de foyer dans l'UI. Rien à recâbler ; `switchWithPurge` est exposée, testée, et documentée comme le SEUL point d'entrée à appeler quand ce sélecteur sera construit (le commentaire du store l'impose).
3. **Toast via le message d'erreur du goulot.** Le plan plaçait le toast dans use-auth ; le mécanisme existant (profile-form toastant `signOutError.message`, sans navigation en cas d'erreur) suffit : le goulot lève une Error portant la copy UI-SPEC. Aucune duplication.

## Threat surface scan

Aucune nouvelle surface hors threat_model : pas d'endpoint, pas d'auth path nouveau ; les modifications durcissent les frontières déclarées (T-33-10 → T-33-13).

## Self-Check: PASSED

- Fichiers créés/modifiés présents sur disque (8 modifiés, 1 créé).
- Les 8 commits existent dans l'historique (47da0f7 → 55e55f0), mesurés depuis le ledger 3ba1bb2.
