---
phase: 38-filet-de-tests-fiable
plan: 01
subsystem: testing
tags: [date-fns, vitest, seed-demo, tdd, datetime, iso-week]

# Dependency graph
requires:
  - phase: 37 (campagne précédente)
    provides: conventions §2.7 (rouge avant vert, contrôle qui regarde, commentaires-récits) et graine démo existante
provides:
  - Helpers de production `debutSemaineIso` / `jourSemaine` dans app/src/lib/datetime.ts (seule source de l'arithmétique semaine)
  - Semis menu ancré lundi (foyer démo vivant quel que soit le jour de la semaine)
  - Garde anti-récidive de classe sur `demoMealEntries` dans seed.test.ts
  - Délégation `weekStartOf` (menu) → `debutSemaineIso` (§2.7 E)
affects: [38-02, 38-03, 38-04, menu, seed-demo, tout test à grille semaine]

# Actuals (#2632)
actuals:
  tokens: 42500   # 5 files, 159 insertions / 11 deletions (chars/4 sur le diff réalisé)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Date en ENTRÉE des helpers, jamais d'horloge figée (S-02)"
    - "Une seule source d'arithmétique semaine : menu délègue à lib/datetime (§2.7 E)"
    - "Garde de classe avec garde-fou « le contrôle ne regarde rien » (§2.7 F)"

key-files:
  created: []
  modified:
    - app/src/lib/datetime.ts
    - app/src/lib/datetime.test.ts
    - app/src/lib/data/seed.ts
    - app/src/lib/data/seed.test.ts
    - app/src/modules/menu/types.ts

key-decisions:
  - "Prédicat de la garde paramétré par l'ancrage (dansLaSemaineDe) : le cas synthétique rouge est prouvé sur dates figées 2026-11-08/09, robuste quel que soit le jour d'exécution du test."
  - "toUtcDate/isoOfUtc conservés dans menu/types.ts (consommés par weekDatesOf/shiftWeek/formatDayLabel) — seule l'arithmétique getUTCDay de weekStartOf est déléguée."

patterns-established:
  - "Helper de semaine : debutSemaineIso(iso) = lundi ; jourSemaine(debut, n) = jour d'index n (0=lundi … 6=dimanche), UTC pur."
  - "Garde de classe : itération sur les données du semis + collecte des contrevenants + expect(checked).toBeGreaterThan(0)."

requirements-completed: [TEST-01]

coverage:
  - id: D1
    description: "Helpers debutSemaineIso/jourSemaine prouvés sur 7 ISO injectés (lundi..dimanche), date en entrée"
    requirement: TEST-01
    verification:
      - kind: unit
        ref: "app/src/lib/datetime.test.ts#semaine lundi → dimanche — helpers de production (flake menu du dimanche)"
        status: pass
      - kind: other
        ref: "cd app && npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "demoMealEntries ancrées sur la semaine lundi→dimanche courante (foyer démo vivant, flake du dimanche éradiqué)"
    requirement: TEST-01
    verification:
      - kind: unit
        ref: "app/src/lib/data/seed.test.ts#chaque entry_date de demoMealEntries tombe dans la semaine courante (lundi → dimanche)"
        status: pass
      - kind: unit
        ref: "app/src/modules/menu/menu-page.test.tsx (3 tests verts)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Garde anti-récidive prouvée sur le cas qui doit échouer (day(1) d'un dimanche rejeté par le prédicat) — vue ROUGE sur l'arbre réel du dimanche"
    requirement: TEST-01
    verification:
      - kind: unit
        ref: "app/src/lib/data/seed.test.ts#cas qui doit échouer : un repas ancré sur la semaine suivante d'un dimanche est rejeté (§2.7B)"
        status: pass
    human_judgment: false
  - id: D4
    description: "weekStartOf délègue à debutSemaineIso — aucune duplication d'arithmétique semaine (getUTCDay absent de menu/types.ts)"
    requirement: TEST-01
    verification:
      - kind: other
        ref: "grep -c getUTCDay app/src/modules/menu/types.ts → 0 ; npx vitest run src/modules/menu src/lib/datetime.test.ts src/lib/data → 13 files / 94 tests verts"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-11-08
status: complete
---

# Phase 38 Plan 01: Semis menu insensible au jour de la semaine Summary

**Helpers de production `debutSemaineIso`/`jourSemaine` prouvés par 7 dates injectées, semis menu recalé sur la semaine lundi→dimanche courante avec garde de classe anti-récidive, et `weekStartOf` (menu) délégué — une seule source d'arithmétique semaine.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-08T18:01:22Z
- **Completed:** 2026-11-08T18:13:23Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Helpers de production `debutSemaineIso` / `jourSemaine` dans `app/src/lib/datetime.ts`, arithmétique UTC pure (S-03), documentés par le récit du défaut d'origine.
- Preuve paramétrique `it.each` sur les 7 ISO de la semaine 2026-11-02 → 2026-11-08 (dimanche étiqueté « le jour qui cassait avant le fix »), date en ENTRÉE — aucun `setSystemTime` (S-02).
- `demoMealEntries` (seed.ts) : les trois repas passés de `day(0|1|2)` à `jourSemaine(debutSemaineIso(todayIso()), 0|1|2)` — foyer démo vivant, recalé chaque jour (Pitfall 2 respecté).
- Garde anti-récidive de classe dans `seed.test.ts`, patron `seed-instants.test.ts`, avec garde-fou §2.7 F et cas-qui-doit-échouer documenté.
- `weekStartOf` (menu/types.ts) délègue à `debutSemaineIso` : `getUTCDay` n'existe plus que dans `lib/datetime.ts` (§2.7 E).

## Task Commits

Each task was committed atomically:

1. **Task 1: Helpers debutSemaineIso/jourSemaine + preuve paramétrique 7 jours** - `4f88b89` (feat)
2. **Task 2: Recaler demoMealEntries sur la semaine lundi + garde anti-récidive** - `8dace2c` (fix)
3. **Task 3: Factoriser weekStartOf — menu/types.ts délègue à datetime.ts** - `4f45e83` (refactor)

## Files Created/Modified
- `app/src/lib/datetime.ts` - helpers `debutSemaineIso`/`jourSemaine` (seule source de l'arithmétique semaine)
- `app/src/lib/datetime.test.ts` - 16 cas paramétriques + 2 allers-retours sur les 7 ISO injectés
- `app/src/lib/data/seed.ts` - `demoMealEntries` ancrées lundi ; commentaire près de `day()` nommant les relatifs au jour comme légitimes
- `app/src/lib/data/seed.test.ts` - garde de classe semaine + cas rouge synthétique
- `app/src/modules/menu/types.ts` - `weekStartOf` = délégation

## Decisions Made
- **Prédicat de la garde paramétré par l'ancrage** (`dansLaSemaineDe(entry, ancre)`) : la lettre du plan (`jourSemaine(debutSemaineIso('2026-11-08'), 1)`) tombe DANS la semaine de l'ancrage et ne prouve rien. La forme réelle du défaut — `day(1)` d'un semis du dimanche = `jourSemaine('2026-11-08', 1)` = 2026-11-09 — est rejétée correctement, sur deux dates figées donc quel que soit le jour d'exécution du test.
- **`toUtcDate`/`isoOfUtc` conservés dans menu/types.ts** : `weekDatesOf`, `shiftWeek`, `formatDayLabel`, `formatWeekLabel` les consomment ; seule l'arithmétique du lundi (`getUTCDay`) est déléguée, conformément au plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cas rouge synthétique du plan invalidé par l'exécution**
- **Found during:** Task 2 (écriture de la garde)
- **Issue:** `jourSemaine(debutSemaineIso('2026-11-08'), 1)` = 2026-11-03, mardi de la semaine COURANTE d'un dimanche — le prédicat le laisse passer (prouvé rouge sur le cas, cf. sortie de run)
- **Fix:** forme réelle du défaut utilisée : `jourSemaine('2026-11-08', 1)` = 2026-11-09 (mardi de la semaine suivante), prédicat ancré sur la date de semis figée
- **Files modified:** app/src/lib/data/seed.test.ts
- **Verification:** prédicat retourne bien `false` (test vert) ; la sortie RED originale citée ci-dessous prouve que la garde voit le défaut
- **Committed in:** 8dace2c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correction nécessaire pour que la preuve « doit échouer » soit réelle ; aucune dérive de périmètre.

## Issues Encountered
None — les deux exécutions RED sontvenues naturellement : exports absents (Task 1 : `TypeError: debutSemaineIso is not a function`, 16 tests rouges) et jour courant = dimanche (Task 2 : garde rouge listant `meal-2 = 2026-11-09, meal-3 = 2026-11-10`).

## Preuves §2.7 B (rouge avant vert)
- **Task 1** (avant implémentation) : `Tests 16 failed | 12 passed (28)` — `TypeError: debutSemaineIso is not a function`
- **Task 2** (avant conversion seed.ts, arbre réel du dimanche 2026-11-08) : `AssertionError: repas hors de la semaine courante : meal-2 = 2026-11-09, meal-3 = 2026-11-10`
- **Task 2, cas-qui-doit-échouer du plan, prouvé rouge à tort** : `AssertionError: le prédicat laisse passer le défaut du dimanche: expected true to be false` — remplacé par la forme corrigée ci-dessus.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TEST-01 livrée : la classe « données à grille semaine » est corrigée et gardée — les plans 38-02..04 peuvent s'appuyer sur `debutSemaineIso`/`jourSemaine` sans dupliquer l'arithmétique.
- Chaîne §2.7 passée : typecheck vert, 244 fichiers / 1988 tests verts, build Vite vert. Aucun SQL touché → `test-db.sh` non requis.

---
*Phase: 38-filet-de-tests-fiable*
*Completed: 2026-11-08*

## Self-Check: PASSED

- 5 fichiers clés trouvés sur disque ; 3 commits 38-01 retrouvés dans le log.
- Critères d'acceptance Task 1 : grep helpers = 4 (≥4) ; 7 étiquettes + '2026-11-08' présents ; setSystemTime = 0 ; vitest datetime 28/28 ; typecheck vert.
- Critères Task 2 : jourSemaine(debutSemaineIso ×4 (≥3) ; aucun `day(` dans demoMealEntries ; garde + message + cas rouge présents ; menu-page 3/3 ; setSystemTime = 0.
- Critères Task 3 : getUTCDay = 0 dans menu/types.ts ; debutSemaineIso ×3 (≥1) ; vitest menu+datetime+data 13 fichiers / 94 tests verts.
- Vérification plan : typecheck vert, npm test 244 fichiers / 1988 tests verts, build Vite vert ; aucun setSystemTime ajouté.
