---
phase: 01-calendrier
plan: 03
subsystem: ui
tags: [react, tanstack-query, dexie, vitest, calendrier, rls]

# Dependency graph
requires:
  - phase: 01-calendrier-01
    provides: "Perso invisible total (D-01 Option B), trigger Perso auto, choix calendrier explicite dans le dialogue"
provides:
  - "Jours ref lus depuis le cache base via data.list, sans fetch direct (D-13/D-15)"
  - "FilterBar cumulable verrouillée, couches ref toujours visibles non cliquables (D-09/D-10)"
  - "Confirmation de sortie du secret Perso→Commun (D-04), catégorie colore pastille + membre sur avatars (D-07)"
  - "Créations masquées aux enfants, zone scolaire admin-only branchée sur les vacances (D-06/D-16)"
affects: [01-04, 01-02]

# Actuals (#2632)
actuals:
  tokens: 12570
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns: [DB-cache ref via data.list + staleTime 24h + placeholderData, ConfirmDialog sortie-du-secret, DayMarker categoryColor + colorTag membre]

key-files:
  created:
    - app/src/modules/calendrier/hooks/use-ref-days.test.tsx
    - app/src/modules/calendrier/hooks/use-school-zone.test.tsx
    - app/src/modules/calendrier/types.test.ts
  modified:
    - app/src/modules/calendrier/hooks/use-ref-days.ts
    - app/src/modules/calendrier/api.ts
    - app/src/modules/calendrier/types.ts
    - app/src/modules/calendrier/calendrier-page.tsx
    - app/src/modules/calendrier/components/calendar-grid.tsx
    - app/src/lib/data/seed.ts
    - app/src/lib/data/local-adapter.ts

key-decisions:
  - "households_update vérifiée admin-only (0007) : Select zone réservé aux admins, constat consigné per plan"
  - "ensureSeeded sérialisé par promesse partagée : le herd de 10 lecteurs concurrents passait de ~40 ms à ~1 s sur IndexedDB simulé"
  - "Pastille catégorie rendue dans la grille (3 lignes, hors fichiers planifiés) : sans elle, D-07 restait une donnée invisible"
  - "Pas de seed de calendriers de démo : collision avec les tests D-03 qui créent leur Commun (présélection premier Commun)"

patterns-established:
  - "Lecture ref : data.list + filtre (année/zone) -> mapping pur (toFrenchHolidays/toVacationRanges) -> useQuery stale 24h retry 1 + placeholderData"
  - "Sortie du secret : helper pur isExitingPerso + second ConfirmDialog, RLS seule barrière (aucun filtre client de confidentialité)"

requirements-completed: [D-04, D-06, D-07, D-09, D-10, D-11, D-12, D-13, D-15, D-16]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Fériés/vacances lus depuis le cache base, helpers purs conservés, aucun appel réseau direct"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-ref-days.test.tsx (mapping + lecture base sans fetch)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Panne base = anciennes données conservées à l'écran"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-ref-days.test.tsx (refetch en panne garde l'affiché)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Déplacement Perso→Commun exige une confirmation explicite"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/types.test.ts (isExitingPerso, 7 cas)"
        status: pass
      - kind: integration
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx (dialogue -> alertdialog -> calendrier déplacé en base)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Enfant sans bouton de création, zone scolaire masquée aux non-admins"
    requirement: "D-06"
    verification:
      - kind: integration
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx (boutons + Select zone masqués à Noé)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Catégorie colore la pastille, couleur membre conservée sur avatars et vues filtrées"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/types.test.ts (categoryColor exact + colorTag préservé)"
        status: pass
      - kind: integration
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx (pastille inline-style dans la grille)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Filtres calendriers×catégories×membres combinables, couches ref toujours visibles sans interrupteur"
    requirement: "D-09"
    verification:
      - kind: integration
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx (Fériés/Vacances absents, Anniversaires présent)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Mois par défaut avec pastilles, Jour au clic, tap-and-hold + bouton plus conservés"
    requirement: "D-11"
    verification:
      - kind: integration
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx (8 tests préexistants verts)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Zone scolaire suggérée via résolveur, modifiable par admin, vacances filtrées par zone effective"
    requirement: "D-16"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-school-zone.test.tsx (lecture, persistance, effacement)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-06
status: complete
---

# Phase 01 Plan 03: Expansion frontend calendrier Summary

**Jours ref basculés sur le cache base, FilterBar verrouillée avec couches toujours visibles, sortie du secret confirmée, pastille catégorie et zone scolaire admin branchées**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-06T11:14:15Z
- **Completed:** 2026-10-06T11:39:47Z
- **Tasks:** 3/3
- **Files modified:** 11 (3 créés, 8 modifiés)

## Accomplishments

- `useRefDays` réécrit sur le cache base (`data.list` filtres année/zone, mapping `toFrenchHolidays`/`toVacationRanges`), helpers purs intacts, zéro fetch direct, panne = ancien affiché (D-13/D-15).
- FilterBar : interrupteurs Fériés/Vacances supprimés (couches toujours ON, fond non cliquable), 3 Selects combinables + Anniversaires conservés, Mois par défaut et tap-and-hold inchangés (D-09/D-10/D-11/D-12).
- Second `ConfirmDialog` « Rendre visible à tout le foyer ? » sur déplacement Perso→Commun via `isExitingPerso` pur (D-04).
- `DayMarker`/`AgendaItem` portent `categoryColor`, pastille catégorie dans la grille, `colorTag` membre et avatars inchangés (D-07).
- Boutons de création + Select zone masqués aux enfants ; `households_update` vérifiée admin-only donc Select zone inchangé (admin) avec suggestion via résolveur et zone propagée à `useRefDays` (D-06/D-16).
- Chaîne verte : typecheck, Vitest calendrier 39/39, suite app complète 543/543.

## Task Commits

Chaque tâche a été commise atomiquement (tâche 1 en RED puis GREEN per TDD) :

1. **Task 1 RED: tests cache base + stale** - `31aff14` (test)
2. **Task 1 GREEN: hook sur cache base + seed + ensureSeeded sérialisé** - `6b3e706` (feat)
3. **Task 2: FilterBar, couches verrouillées, déplacement confirmé, pastille catégorie** - `c0602e6` (feat)
4. **Task 3: zone scolaire vérifiée + testée** - `f5f886d` (feat)

**Plan metadata:** commit docs de ce SUMMARY (voir log).

## Files Created/Modified

- `app/src/modules/calendrier/hooks/use-ref-days.ts` - lectures base + mappings, placeholderData stale, refetch exposé.
- `app/src/modules/calendrier/hooks/use-ref-days.test.tsx` - helpers conservés + mapping + lecture sans fetch + stale en panne (renommé `.ts` → `.tsx`, JSX requis).
- `app/src/modules/calendrier/api.ts` - `listPublicHolidays(year)` + `listSchoolHolidays(zone)` via `data.list`.
- `app/src/modules/calendrier/types.ts` - `categoryColor` sur event/marker/agenda, `isExitingPerso`.
- `app/src/modules/calendrier/types.test.ts` - 5 tests unitaires (sortie secret, couleurs).
- `app/src/modules/calendrier/calendrier-page.tsx` - toggles ref supprimés, `pendingMove` + ConfirmDialog, `isChild` masque créations, hint zone simplifié.
- `app/src/modules/calendrier/calendrier-page.test.tsx` - 4 tests (ref verrouillées, move confirmé en base, enfant, pastille catégorie).
- `app/src/modules/calendrier/components/calendar-grid.tsx` - pastille catégorie inline-style (3 lignes, hors plan, voir déviations).
- `app/src/modules/calendrier/hooks/use-school-zone.test.tsx` - lecture/persistance/effacement zone.
- `app/src/lib/data/seed.ts` - démo `public_holidays` (11 fériés × 3 ans, Pâques calculée), `school_holidays` (Toussaint/Noël A/B/C), 4 catégories seed.
- `app/src/lib/data/local-adapter.ts` - `ensureSeeded` sérialisé par promesse partagée (hors plan, voir déviations).

## Decisions Made

- **`households_update` admin-only confirmée** (0007 l.257-261) : Select zone inchangé (réservé admins), per alternative du plan ; les membres en écriture n'existent pas, aucun élargissement.
- **Suggestion de zone = chaîne existante** (`Détecter la zone` : ville → géocodage → code postal → `resolveZoneFromPostcode`) : aucun nouveau stockage, pas de colonne code postal en base.
- **Pas de calendriers dans le seed démo** : les tests D-03 créent leur Commun et attendent sa présélection (premier Commun trouvé) ; un Commun seedé les casserait. Les tests D-04 créent les leurs en isolation.
- **`hidden={isChild}` plutôt que démontage conditionnel** : masquage d'un bloc existant en une ligne, exclu de l'arbre a11y comme un retrait.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ensureSeeded` sérialisé par promesse partagée**
- **Found during:** Task 1 (test page `appui long` rouge en suite complète, vert isolé)
- **Issue:** Au montage, ~10 requêtes lançaient chacune un amorçage séquentiel de 44 tables ; sérialisés dans fake-indexeddb, 10 amorçages concurrents prenaient ~1076 ms (mesuré) contre ~40 ms en série, dépassant le timeout des `findBy*`. Les 2 nouvelles requêtes ref + 2 tables seedées ont fait franchir le seuil.
- **Fix:** `seedPromise` partagée dans `LocalAdapter` (+ reset dans `invalidateSeedCache`) : un seul amorçage par vidage. Fichier hors plan mais couche traversée par la tâche.
- **Files modified:** app/src/lib/data/local-adapter.ts
- **Verification:** Concurrents mesurés 1076 ms → 40 ms ; calendrier 29/29 puis 39/39 ; suite app 543/543.
- **Committed in:** `6b3e706` (commit tâche 1)

**2. [Rule 2 - Missing Critical] Pastille catégorie rendue dans la grille**
- **Found during:** Task 2 (vérité D-07 non observable)
- **Issue:** Le plan demandait d'étendre le marqueur avec la couleur catégorie, mais sans touche de rendu (`calendar-grid.tsx` hors fichiers), la vérité « la catégorie colore l'événement » restait une donnée invisible. Donnée sans rendu = critère non prouvable.
- **Fix:** 3 lignes : pastille `backgroundColor: marker.categoryColor` à côté de la pastille membre, container déjà `aria-hidden` (pastilles décoratives).
- **Files modified:** app/src/modules/calendrier/components/calendar-grid.tsx
- **Verification:** Test page D-07 (pastille inline-style présente) + unitaire hex exact.
- **Committed in:** `c0602e6` (commit tâche 2)

**3. [Rule 2 - Missing Critical] Seed démo des tables de cache et catégories**
- **Found during:** Tâches 1-2 (mode local/tests sans lignes ref)
- **Issue:** Sans lignes en base locale, `useRefDays` rendait vide en démo/offline/tests (le test `jour férié` existant serait passé au rouge) et aucune catégorie n'existait pour prouver D-07.
- **Fix:** `demoPublicHolidays` (11 fériés, années N-1/N/N+1, mobiles via Pâques), `demoSchoolHolidays` (Toussaint/Noël × A/B/C, année scolaire courante), `demoEventCategories` (4 seeds SQL).
- **Files modified:** app/src/lib/data/seed.ts
- **Verification:** Suites calendrier + app complètes vertes.
- **Committed in:** `6b3e706` (jours ref), `c0602e6` (catégories)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** Aucun scope creep : chaque écart rendait une vérité du plan observable ou débloquait sa vérification. Aucun package installé (registre T-01-SC sans objet).

## Issues Encountered

- **Faux suspect initial (test `appui long`) :** longue enquête (pollution inter-tests ? fake timers ? store ?) avant d'identifier la vraie cause par mesure : amorçage concurrent à ~1 s. Leçon : mesurer le lent avant de suspecter le faux. Debug specs temporaires créés puis supprimés, jamais committés.
- **Branche `main` partagée (garde #3819) :** comme en 01-01, dispatch explicite « parallel executor on main working tree, normal git commits » + commits de la vague 01-02 déjà sur `main` (`daafbf7`, `4cc9d85`, non miens, non touchés). Committé sur `main` avec hooks, sans force-push. Fichiers 01-02 croisés en `git status` laissés intacts.

## Authentication Gates

None - no external service authentication required.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: none-new-surface | — | Aucune route, Edge, table ou politique ajoutée. `ConfirmDialog` Perso→Commun est UX pure : la RLS 0084 reste la seule barrière (T-01-06 préservé, aucun filtre client de confidentialité introduit). Masquage enfant purement visuel : `can_write_household` exclut déjà `enfant` côté serveur (T-01-05). |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Prêt pour 01-04 (suite 0017 : preuve Perso invisible + cron + garde catégories) : les vérités UI D-04/D-06/D-07/D-09/D-10 sont prouvées par 39 tests Vitest, la RLS sous-jacente restant due côté SQL.
- Cohabitation vague : 01-02 a committé Edge `refresh-calendrier-ref` + migration 0087 sur `main` pendant cette exécution ; le hook lit désormais les tables que son cron remplit — wiring productif à valider en 01-04 bout-en-bout.
- Aucun bloqueur : typecheck vert, 543/543 tests app, aucun appel direct aux sources officielles restant (`grep` vide).

---
*Phase: 01-calendrier*
*Completed: 2026-10-06*

## Self-Check: PASSED

- `app/src/modules/calendrier/hooks/use-ref-days.ts` FOUND (commis en 6b3e706)
- `app/src/modules/calendrier/api.ts` FOUND (commis en 6b3e706)
- `app/src/modules/calendrier/types.ts` FOUND (commis en c0602e6)
- `app/src/modules/calendrier/calendrier-page.tsx` FOUND (commis en c0602e6)
- `app/src/modules/calendrier/hooks/use-school-zone.test.tsx` FOUND (commis en f5f886d)
- Commits `31aff14` + `6b3e706` + `c0602e6` + `f5f886d` FOUND via `git log`
- Vérifications : typecheck vert, Vitest calendrier 39/39, suite app 543/543, grep sources officielles vide dans le hook
