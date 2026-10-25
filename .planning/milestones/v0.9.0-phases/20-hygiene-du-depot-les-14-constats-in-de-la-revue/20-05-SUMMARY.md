---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 05
subsystem: auth
tags: [zustand, persist, session, household, react-hooks, d-07, in-07]

# Dependency graph
requires:
  - phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
    provides: D-07 (décision verrouillée) ; les stores persistés `session-store`/`household-store` déjà en place
provides:
  - "useAuthBootstrap : les deux branches « pas de session » (locale et Supabase) vident session ET foyer via `useSessionStore.getState().signOut()`"
  - "sélecteur mort `setStatus` retiré ; dépendances de l'effet `[attempt]`"
  - "preuve par mode : branche Supabase (use-auth.test.ts) et branche locale (use-auth-local.test.ts)"
affects: [20-06 (même fichier use-auth.ts, hunks disjoints), verify-work, secure-phase]

# Actuals (#2632) — chars/4 sur le diff réalisé
actuals:
  tokens: 2705
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un amorçage sans session appelle la remise à zéro réelle du store (`signOut()`), jamais un simple `setStatus` : un store persisté qui survit à sa session est un état fantôme"

key-files:
  created:
    - app/src/hooks/use-auth-local.test.ts
  modified:
    - app/src/hooks/use-auth.ts
    - app/src/hooks/use-auth.test.ts

key-decisions:
  - "Les deux sites appellent le même `signOut()` sans factorisation en helper : ils vivent dans deux branches de nature différente (local sans backend / Supabase) et un helper masquerait laquelle s'exécute (D-07)"

patterns-established:
  - "Preuve d'une branche par mock hissé : `vi.mock('@/lib/supabase/client')` étant hissé par fichier, la branche `!supabase` exige un fichier de test dédié avec `supabase: null`"

requirements-completed: [IN-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Les deux branches « pas de session » vident la session ET le foyer persistés en appelant le même `signOut()` (D-07)"
    requirement: "IN-07"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-auth.test.ts#vide la session ET le foyer persistés quand l'amorçage ne trouve aucune session (D-07)"
        status: pass
      - kind: unit
        ref: "app/src/hooks/use-auth-local.test.ts#vide le foyer persisté quand aucune session n'est persistée (D-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Le sélecteur mort `setStatus` est retiré et les dépendances de l'effet sont `[attempt]` — `noUnusedLocals` satisfait"
    verification:
      - kind: other
        ref: "cd app && npm run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Verrou de non-régression : la branche `SIGNED_OUT` de l'écouteur vide le foyer persisté (déjà vert avant le correctif)"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-auth.test.ts#vide le foyer persisté sur SIGNED_OUT (verrou de non-régression)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-10-16
status: complete
---

# Phase 20 Plan 05: la branche « pas de session » vide session et foyer Summary

**Un amorçage sans session appelle désormais `signOut()` du store dans les deux modes (local et Supabase) : l'utilisateur ET le foyer persistés sont vidés, et l'état « invité avec un foyer chargé » devient impossible.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 / 2
- **Files modified:** 3 (1 créé, 2 modifiés)
- **Tests:** 141 fichiers / 1187 tests verts (`npm test`) ; `typecheck` vert ; `check-sql-statique.py` vert

## Accomplishments

- `useAuthBootstrap` : la branche locale (`!supabase`, `use-auth.ts:148`) **et** la branche Supabase (`use-auth.ts:175`) appellent `useSessionStore.getState().signOut()` au lieu de `setStatus('guest')`. `signOut()` vide `user`, `status`, `householdLoaded` **et** appelle `useHouseholdStore.getState().reset()` — le foyer persisté ne survit plus à sa session.
- Le sélecteur devenu mort `const setStatus = useSessionStore((state) => state.setStatus)` est supprimé et les dépendances de l'effet ramenées à `[attempt]` : `noUnusedLocals`/`noUnusedParameters` satisfaits, la liste de dépendances dit la vérité.
- Deux preuves, une par mode : la branche Supabase dans `use-auth.test.ts` (session absente ⇒ `householdId === null` ET `user === null`), la branche locale dans le nouveau `use-auth-local.test.ts` (mock `supabase: null`).
- Verrou de non-régression de la branche `SIGNED_OUT` de l'écouteur (elle appelait déjà `signOut()`).

## Task Commits

Chaque tâche a été commitée atomiquement sur `main` :

1. **Task 1 : les deux branches « pas de session » vident session et foyer — mode Supabase prouvé** — `ae18ff4` (fix)
2. **Task 2 : la branche locale vide le foyer persisté — preuve sans backend** — `d9007f3` (test)

**Plan metadata :** aucun (`.planning/` gitignoré, `commit_docs: false`).

## Files Created/Modified

- `app/src/hooks/use-auth.ts` — les deux branches « pas de session » appellent `useSessionStore.getState().signOut()` (commentaire à l'appui, expliquant pourquoi pas `setStatus`) ; `const setStatus` supprimé ; dépendances de l'effet `[attempt]`.
- `app/src/hooks/use-auth.test.ts` — +1 preuve de la branche Supabase, +1 verrou `SIGNED_OUT` ; `useHouseholdStore` importé et remis à zéro dans le `beforeEach`.
- `app/src/hooks/use-auth-local.test.ts` — **créé** : mock `@/lib/supabase/client` avec `supabase: null`/`isSupabaseConfigured: false` ; cas « aucune session persistée » (preuve de D-07) et cas « session persistée » (verrou de non-régression).

## Textes exacts des commentaires ajoutés

Branche locale (`use-auth.ts:144-147`) :

```
// Ce n'est pas `setStatus('guest')` : le statut seul laissait
// l'utilisateur ET le foyer persistés, et les deux stores étant
// persistés, ils revenaient au rechargement suivant. `signOut()` est le
// seul chemin qui vide réellement les deux (D-07).
```

Branche Supabase (`use-auth.ts:171-174`) :

```
// Même chemin qu'en mode local : `setStatus('guest')` laissait
// l'utilisateur et le foyer persistés, donc une session expirée ou
// révoquée côté serveur laissait l'application *paraître* connectée
// au rechargement suivant. `signOut()` vide les deux stores (D-07).
```

## Preuves rouge → vert

### Branche Supabase (`use-auth.test.ts`) — la preuve qui porte le défaut

- **Rouge** (statut seul remis dans la branche Supabase) :
  `FAIL … vide la session ET le foyer persistés quand l'amorçage ne trouve aucune session (D-07)`
  `AssertionError: expected 'h-fantome' to be null` (sur `useHouseholdStore.getState().householdId`)
  → `1 failed | 23 passed`.
- **Vert** (correctif restauré) : `24 passed`.

### Branche locale (`use-auth-local.test.ts`) — le seul rouge→vert de la branche locale

- **Rouge** (statut seul remis dans la branche locale) :
  `FAIL … vide le foyer persisté quand aucune session n'est persistée (D-07)`
  `AssertionError: expected 'h-fantome' to be null`
  → `1 failed | 1 passed` — le cas « session persistée » **reste vert** dans les deux sens, ce qui prouve que les deux cas ne se contaminent pas.
- **Vert** (correctif restauré) : `2 passed`.

### Verrou `SIGNED_OUT` — déjà vert AVANT le correctif

La branche `SIGNED_OUT` de l'écouteur (`use-auth.ts:198`) appelait **déjà** `useSessionStore.getState().signOut()`. Le test `vide le foyer persisté sur SIGNED_OUT (verrou de non-régression)` est donc vert **avant** le correctif autant qu'après : **ce n'est pas une preuve rouge du défaut**, c'est un verrou de non-régression. Le SUMMARY le dit ainsi (le plan l'exigeait explicitement).

## Decisions Made

- **Pas de factorisation des deux sites en un helper** : ils vivent dans deux branches de nature différente (local sans backend / Supabase) ; les réunir masquerait laquelle s'exécute. Un commentaire par site suffit (D-07).
- **Ordre des assertions** dans le test Supabase : `householdId` est asserté **avant** `user`, pour que la preuve rouge échoue précisément sur l'assertion qui porte D-07 (le foyer), et non sur le statut ou l'utilisateur.

## Deviations from Plan

**1. [Rule 3 - Blocking] Le `beforeEach` de `use-auth.test.ts` ne remettait pas `useHouseholdStore` à zéro**
- **Found during:** Task 1 (ajout de la preuve Supabase)
- **Issue:** les deux stores sont persistés et partagés par le module ; les nouveaux cas sèment un foyer, qui serait resté derrière lui et aurait pu contaminer les cas suivants du même fichier.
- **Fix:** `useHouseholdStore.getState().reset()` ajouté au `beforeEach` existant (et import statique de `useHouseholdStore`).
- **Files modified:** `app/src/hooks/use-auth.test.ts`
- **Verification:** suite complète verte ; aucun cas existant n'a régressé.
- **Committed in:** `ae18ff4` (Task 1).

Aucune autre déviation. Le plan a été exécuté comme écrit (pas de paquet ajouté, `session-store.ts`/`household-store.ts` inchangés, signature de `useAuthBootstrap` inchangée).

---

**Total deviations:** 1 auto-fixée (1 blocking)
**Impact on plan:** l'isolation des tests est nécessaire pour que les nouvelles preuves ne polluent pas les cas existants. Pas de débordement de périmètre.

## Issues Encountered

Aucune. Le point d'attention de couplage avec le plan 20-06 (même fichier `use-auth.ts`, hunks disjoints) a été respecté : ce plan n'a touché que les deux branches « pas de session », le sélecteur mort et les dépendances de l'effet — **pas** les deux commentaires de la règle d'affichage que 20-06 possède (`~:56-62`, `~:130-132`).

## Threat Flags

Aucun : pas de nouvelle surface réseau, auth, accès fichier ou schéma. Le correctif **réduit** la surface d'information divulguée (T-20-14) en vidant le foyer persisté sans session.

## Known Stubs

Aucun.

## User Setup Required

None - aucune configuration de service externe requise.

## Self-Check: PASSED

- `app/src/hooks/use-auth.ts` : FOUND
- `app/src/hooks/use-auth.test.ts` : FOUND
- `app/src/hooks/use-auth-local.test.ts` : FOUND
- Commit `ae18ff4` : FOUND
- Commit `d9007f3` : FOUND

## Next Phase Readiness

- IN-07 est fermé dans les deux modes ; le plan 20-06 peut rebaser sur `ae18ff4`+`d9007f3` (hunks disjoints, aucun conflit).
- La chaîne complète de la phase reste verte (`typecheck`/`test`/`build` non rejoué ici — `build` hors du périmètre de vérification de ce plan, qui n'a touché ni l'entrée de build ni les assets).

---
*Phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue*
*Completed: 2026-10-16*
