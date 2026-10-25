---
phase: 01-calendrier
plan: 05
subsystem: ui
tags: [react, calendrier, tanstack-query, vitest, rls-frontend-gating]

# Dependency graph
requires:
  - phase: 01-calendrier plans 01-04
    provides: [proven server base (0017, Edge refresh-calendrier-ref, cron), existing D-06/D-03/D-13 frontend code with partial truths]
provides:
  - Child creation gating on all 4 entries (D-06 closed)
  - Visibility-first Commun resolver (D-03 closed)
  - Grid-year-scoped school holidays (D-13 closed)
affects: [01-calendrier verification, frontend calendar consumers]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2600
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [isChild gating via conditional render (actions=undefined, panel buttons null), visibility-first resolver lookup, school-year + civil-year-overlap vacation scoping]

key-files:
  created: []
  modified:
    - app/src/modules/calendrier/calendrier-page.tsx
    - app/src/modules/calendrier/calendrier-page.test.tsx
    - app/src/modules/calendrier/api.ts
    - app/src/modules/calendrier/hooks/use-ref-days.ts
    - app/src/modules/calendrier/hooks/use-ref-days.test.tsx

key-decisions:
  - "Overlap clause added to D-13 filter: school_year alone cannot exclude Toussaint N-1 (proven red by the plan's own test before the fix)"
  - "D-13/D-03 tests share one QueryClient for parallel hooks to prove distinct cache keys via fetch count"
  - "Anti-hijack seeds use isolated household ids so demo seed data cannot mask the resolver"

patterns-established:
  - "Child gating: ModuleShell actions=undefined + agenda buttons null on isChild (matches existing hidden={isChild} convention)"
  - "Resolver lookups match on visibility, never on display name"

requirements-completed: [D-03, D-06, D-13]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Child profile (Noe) sees zero creation entries: no ModuleShell buttons, no agenda buttons, no +Calendrier perso/+Categorie"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx#masque les boutons de création à un enfant, qui tague sans créer (D-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveCommunCalendarId returns only visibility==='commun'; a Perso named 'Commun' is never returned, null when no Commun exists"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-ref-days.test.tsx#resolveCommunCalendarId visibility-first (D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Vacations shown match the grid year: queryKey carries (year, zone), only covering school years mapped, display bounded by civil-year overlap"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-ref-days.test.tsx#useRefDays scope les vacances à l’année de la grille (D-13)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-06
status: complete
---

# Phase 01 Plan 05: Clôture gaps D-06/D-03/D-13 Summary

**Child-gating completed on all creation entries, Commun resolver hardened to visibility-first, and school holidays scoped to the grid year — 3 frontend-only gap closures, full calendrier suite green (43/43).**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-06T12:21:00Z
- **Completed:** 2026-10-06T12:46:24Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Profil enfant (Noe) : zéro entrée de création — ModuleShell actions + boutons panneau agenda gatés sur `isChild` (D-06 clôturé).
- `resolveCommunCalendarId` visibility-first : un Perso nommé « Commun » n'est jamais retourné, même via le fallback `use-calendrier.ts:108` (D-03 clôturé).
- Vacances scopées à l'année de la grille : `schoolYearsForYear` porté de l'Edge, queryKey `['ref-days','school_holidays',year,zone]`, filtre année scolaire + chevauchement année civile (D-13 clôturé).
- Aucun SQL, aucun Edge, aucune RLS touchée — frontend uniquement, `git status` propre hors `.claude/`/`.gsd/` préexistants non suivis.

## Task Commits

Each task was committed atomically:

1. **Task 1: Gater toutes les entrees de creation sur isChild (D-06)** - `35c4e52` (feat)
2. **Task 2: Resolver Commun visibility-first, jamais de Perso (D-03)** - `811de4d` (feat)
3. **Task 3: Scoper les vacances a l'annee de la grille (D-13)** - `e96e8db` (feat)

## Files Created/Modified

- `app/src/modules/calendrier/calendrier-page.tsx` - `isChild` gate sur ModuleShell `actions` (undefined) + boutons panneau agenda (null) ; `hidden={isChild}` existant conservé pour + Calendrier perso / + Catégorie
- `app/src/modules/calendrier/calendrier-page.test.tsx` - Test D-06 étendu : `queryByRole` null + `queryAllByRole` [] sur les 4 entrées pour Noe
- `app/src/modules/calendrier/api.ts` - `resolveCommunCalendarId` matche `visibility === 'commun'` au lieu du nom
- `app/src/modules/calendrier/hooks/use-ref-days.ts` - Export `schoolYearsForYear`, queryKey vacances avec `year`, filtre `school_year` + chevauchement `[01-01, 12-31]`
- `app/src/modules/calendrier/hooks/use-ref-days.test.tsx` - Tests anti-hijack D-03 (2 cas), test bi-années D-13 (client partagé, assertion 2 fetches), test unitaire `schoolYearsForYear`

## Decisions Made

- Clause de chevauchement ajoutée au filtre D-13 : l'année scolaire seule ne peut pas exclure Toussaint N-1 (2025-2026 couvre janvier-août 2026) — prouvé rouge par le test du plan avant le fix, voir déviation Rule 1.
- Montage des deux hooks D-13 sur un seul QueryClient : des contenus différents + 2 lectures base prouvent des clés de cache distinctes (la queryKey porte l'année).
- Seeds anti-hijack sur des household ids isolés (`household-anti-hijack-d03`, `household-no-commun-d03`) pour que les calendriers de démo ne masquent pas le resolver ; zone `B` pour les seeds D-13 afin d'isoler des seeds zone `A` des tests voisins.
- `onLongPress` laissé tel quel pour l'enfant : le dialogue n'est plus atteignable par bouton, et le tap-and-hold est une action supplémentaire (AGENTS.md §6), pas une entrée de création autonome.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Filtre D-13 du plan insuffisant pour son propre fails_when**
- **Found during:** Task 3 (Scoper les vacances a l'annee de la grille)
- **Issue:** Le plan prescrivait `filter((row) => years.includes(row.school_year))`, mais `schoolYearsForYear(2026)` = `['2025-2026','2026-2027']` contient l'année scolaire de Toussaint 2025 — le test (a) du plan (`PAS Toussaint 2025`) échouait avec l'implémentation prescrite. Reproduit rouge : `hook2026 … Toussaint 2025 … toBe(false)` reçu `true`.
- **Fix:** Ajout d'une clause de chevauchement avec l'année civile (`row.start_date <= ${year}-12-31 && row.end_date >= ${year}-01-01`) en plus du filtre année scolaire. Le must-have (« seules les années scolaires couvrant l'année civile sont mappées ») reste vérifié : le résultat est un sous-ensemble strict.
- **Files modified:** `app/src/modules/calendrier/hooks/use-ref-days.ts`
- **Verification:** `npm --prefix app test -- use-ref-days` vert (12/12) après le fix, rouge avant sur le seul test D-13.
- **Committed in:** `e96e8db` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug — plan filter insufficient for its own acceptance)
**Impact on plan:** Aucun élargissement de périmètre : même fichier, même useMemo, une condition de filtre en plus exigée par le `fails_when` du plan. Aucun SQL/Edge/RLS touché.

## Issues Encountered

- Structure du fichier de test cassée par un remplacement trop large (header `describe('useRefDays sur cache base…')` consommé par l'insertion du nouveau bloc) — restauré immédiatement, détecté par relecture avant exécution. Aucun impact sur les commits.
- Premier jet du filtre D-13 (année scolaire seule) rouge sur le test du plan — analysé comme insuffisance du plan, pas du test (données seed correctes : Toussaint 2025 ∈ 2025-2026), d'où la clause de chevauchement.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Les 3 gaps VERIFICATION.md (D-06, D-03, D-13) sont clôturés côté frontend ; la phase 01-calendrier peut repasser en vérification (`gaps_found` levé sous réserve du re-run VERIFICATION.md).
- D-15 (`placeholderData`), D-10 (couches sans interrupteur), D-16 (zone admin-only) et D-04 (confirmation Perso→Commun) non régressés : suites existantes vertes.
- Chaîne AGENTS.md §2.7 non-Docker verte : `typecheck` + `test -- calendrier` (43/43, 7 fichiers) + `build` (precache 86 entrées).

## Self-Check: PASSED

- `calendrier-page.tsx`, `calendrier-page.test.tsx`, `api.ts`, `use-ref-days.ts`, `use-ref-days.test.tsx` : FOUND (modifiés, committés)
- Commits `35c4e52`, `811de4d`, `e96e8db` : FOUND (`git log --oneline`)
- `.planning/phases/01-calendrier/01-05-SUMMARY.md` : FOUND (ce fichier)
- `git status --porcelain` : seuls `?? .claude/` et `?? .gsd/` préexistants non suivis — aucun fichier planifié hors périmètre

---
*Phase: 01-calendrier*
*Completed: 2026-10-06*
