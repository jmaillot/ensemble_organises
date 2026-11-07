---
phase: 35-deep-links-validation-multi-os
plan: 01
subsystem: ui
tags: [deep-links, pwa, offline, react-router, playwright, vitest]

requires:
  - phase: 33 (offline & outbox)
    provides: cache persisté par familles (OFFLINE_FAMILIES, query-persistence)
  - phase: 35-03
    provides: écran « connexion requise » D-07 et mécanisme state.from / internalPathOf
provides:
  - Route /taches/jour + vue TachesJourPage (filtre D-02, coche D-03, assignés D-04)
  - Raccourci manifest « Tâches du jour » → /taches/jour (D-01)
  - Allowlist offline task_assignees (24 h) — assignés hydratés en cold-start hors-ligne
  - E2e dédié deep-link-redirect.spec.ts prouvant redirect-after-login (DLNK-02, D-06)
affects: [Plan 02 (matrice multi-OS), verify-work phase 35, UAT DLNK-02/DLNK-03]

actuals:
  tokens: 3300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Vue module minimaliste réutilisant useTaches + TaskRow, sans DnD ni filtres (D-03)"
    - "TaskRow : actions onEdit/onDelete optionnelles — une action non passée ne rend pas son bouton"

key-files:
  created:
    - app/src/modules/taches/taches-jour-page.tsx
    - app/src/modules/taches/__tests__/jour-view.test.tsx
    - app/e2e/deep-link-redirect.spec.ts
  modified:
    - app/src/modules/taches/types.ts
    - app/src/modules/taches/components/task-row.tsx
    - app/src/app/router.tsx
    - app/src/app/route-preload.ts
    - app/src/app/route-preload.test.tsx
    - app/vite.config.ts
    - app/src/pwa/manifest.test.ts
    - app/src/lib/query-policy.ts
    - app/src/lib/query-policy.test.ts

key-decisions:
  - "Filtre tasksDuJour dans types.ts : comparaison de DATE via todayIso()/daysBetween (jamais un instant UTC), le tri reste sortTasks tel quel — la règle du retard n'est toujours écrite qu'une seule fois"
  - "Preuve de state.from dans l'e2e portée par le COMPORTEMENT post-connexion (URL finale), jamais par une lecture de stockage — lire localStorage pour « vérifier » D-08 la violerait"
  - "Expiration de session simulée en mode démo par purge des stores persistés localStorage (mécanisme réel du bootstrap use-auth), pas par une contrefaçon de test"

patterns-established:
  - "Route nouvelle = UNE entrée routeChunkLoaders + UNE Route ; ROUTE_CHUNK_COUNT témoin mis à jour explicitement (62)"

requirements-completed: [DLNK-02, DLNK-03]

coverage:
  - id: D1
    description: "Route /taches/jour enregistrée (chunk + Route sous le shell authentifié) et vue rendue"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/app/route-preload.test.tsx#la table couvre un morceau par route paresseuse (ROUTE_CHUNK_COUNT=62)"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/__tests__/jour-view.test.tsx (4 cas, rendu du composant)"
        status: pass
      - kind: e2e
        ref: "app/e2e/deep-link-redirect.spec.ts#session expirée → /taches/jour → connexion → retour exact à /taches/jour"
        status: pass
    human_judgment: false
  - id: D2
    description: "Filtre D-02 : aujourd'hui + retards affichés (retards en tête), faites et futures exclues"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/modules/taches/__tests__/jour-view.test.tsx#affiche les tâches dues aujourd’hui et les retards, retards en tête, sans les faites ni les futures"
        status: pass
    human_judgment: false
  - id: D3
    description: "Coche fonctionnelle et retour vers /taches (D-03), périmètre borné (pas de DnD/édition)"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/modules/taches/__tests__/jour-view.test.tsx#coche une tâche + #le bouton retour ramène vers /taches"
        status: pass
    human_judgment: false
  - id: D4
    description: "Assignés rendus avec color_tag et hydratés hors-ligne (allowlist task_assignees)"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/modules/taches/__tests__/jour-view.test.tsx#porte les assignés avec leur code couleur"
        status: pass
      - kind: unit
        ref: "app/src/lib/query-policy.test.ts#G (task_assignees, 24 h, 11 familles exactement) + #H (constante réelle)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Raccourci manifest « Tâches du jour » → /taches/jour, sans autre champ modifié (D-01)"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/pwa/manifest.test.ts#déclare exactement deux raccourcis, « Tâches du jour » visant la vue dédiée /taches/jour"
        status: pass
    human_judgment: false
  - id: D6
    description: "E2e redirect-after-login : session expirée → /connexion → login → retour exact /taches/jour, vue rendue (DLNK-02, D-06)"
    requirement: DLNK-02
    verification:
      - kind: e2e
        ref: "app/e2e/deep-link-redirect.spec.ts (chromium + mobile, passés ; vu rouge une fois avec le retour post-login cassé, §2.7 D)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Rendu on-device du cold-start hors-ligne depuis le cache persisté (matrice multi-OS)"
    requirement: DLNK-03
    verification: []
    human_judgment: true
    rationale: "La preuve finale est on-device et relève du Plan 02 (matrice multi-OS) — hors de portée de cet e2e/vitest ; le plan le stipule explicitement."

duration: 27min
completed: 2026-11-06
status: complete
---

# Phase 35 Plan 01: Vue « Tâches du jour » + e2e redirect-after-login Summary

**Route `/taches/jour` (raccourci manifest D-01) rend aujourd'hui + retards depuis le cache persisté (allowlist `task_assignees` complétée), et un e2e dédié prouve le cold-start session expirée → /connexion → login → retour exact à `/taches/jour` — vu rouge avant d'être vu vert.**

## Performance
- **Duration:** 27min
- **Started:** 2026-11-06T12:20:15Z
- **Completed:** 2026-11-06T12:47Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Vue « Tâches du jour » : route `/taches/jour` (une entrée `routeChunkLoaders` + une `Route` sous le shell authentifié), filtre `tasksDuJour` écrit une seule fois dans `types.ts` (comparaison de DATE via `todayIso()`/`daysBetween`, tri `sortTasks` tel quel), coche + retour, assignés avec `color_tag` — zéro DnD, zéro dossier, zéro filtre (D-03).
- Allowlist offline complétée : `{ prefix: 'task_assignees', maxAgeMs: 24h }` dans `OFFLINE_FAMILIES` (D-04) — sans elle, la vue jour rendait « on ne sait pas » au lieu des avatars en cold-start hors-ligne.
- Raccourci manifest « Tâches du jour » repointé `/taches` → `/taches/jour` (D-01), invariants `manifest.test.ts` et `ROUTE_CHUNK_COUNT` (62) mis à jour.
- E2e dédié `deep-link-redirect.spec.ts` (DLNK-02, D-06) : passe en chromium ET mobile ; vu rouge une fois avec le retour post-login délibérément cassé (patch temporaire, revert immédiat) — il ne vérifie pas un déjà-vu (§2.7 D).

## Task Commits
1. **Task 1: End-to-end « raccourci → /taches/jour »** - `f7d281b` (feat)
2. **Task 2: E2e dédié redirect-after-login** - `b02d32a` (test)

## Files Created/Modified
- `app/src/modules/taches/taches-jour-page.tsx` - Vue route dédiée : compteur, liste « Tâches du jour », coche, retour
- `app/src/modules/taches/types.ts` - Filtre `tasksDuJour` (D-02) à côté de `filterTasks`
- `app/src/modules/taches/components/task-row.tsx` - `onEdit`/`onDelete` optionnels ; une action non passée ne rend pas son bouton
- `app/src/modules/taches/__tests__/jour-view.test.tsx` - 4 cas : filtre, coche, color_tag, retour
- `app/src/app/route-preload.ts` + `router.tsx` + `route-preload.test.tsx` - Enregistrement route (62 morceaux)
- `app/src/lib/query-policy.ts` + `query-policy.test.ts` - Famille `task_assignees` (24 h, 11 familles exactement)
- `app/vite.config.ts` + `app/src/pwa/manifest.test.ts` - Cible raccourci `/taches/jour`
- `app/e2e/deep-link-redirect.spec.ts` - Scénario D-06

## Decisions Made
- **Preuve de `state.from` par le comportement** : l'e2e asserte l'URL finale `/taches/jour` après login, jamais une lecture de localStorage — lire le stockage pour « vérifier » D-08 le violerait.
- **Expiration simulée par purge des stores persistés** (mode démo) : c'est le mécanisme réel du bootstrap `use-auth.ts` (pas d'utilisateur persisté → purge + invité), pas une contrefaçon de test. Pas besoin du patron de skip documenté.
- **`onEdit`/`onDelete` rendus optionnels dans `TaskRow`** : la vue jour (D-03) ne passe ni l'un ni l'autre ; passer des no-ops aurait rendu un bouton mort qui promet un geste inexistant.

## Deviations from Plan
### [Rule 3 - Blocking] `TaskRow` exigeait `onEdit`/`onDelete` (props requises)
- **Found during:** Task 1
- **Issue:** `TaskRowProps` déclarait `onEdit`/`onDelete` obligatoires, alors que le plan interdit de les passer dans la vue jour (D-03) — et `readOnly={false}` rend le bouton d'édition dès qu'il est défini.
- **Fix:** Props rendues optionnelles ; le bouton d'édition ne se rend que si `onEdit` est passé, la corbeille que si `canDelete && onDelete`. Les appels existants passent déjà les deux : rendu inchangé pour `/taches`.
- **Files modified:** `app/src/modules/taches/components/task-row.tsx`
- **Verification:** 84 tests verts (taches + query-policy + pwa + route-preload), typecheck vert
- **Commit:** `f7d281b`

---
**Total deviations:** 1 auto-fixed (Rule 3). **Impact on plan:** nul — l'alternative (no-op callback) aurait contredit l'acceptance criterion « aucun appel openEdit » de façon trompeuse.

## Issues Encountered
- **e2e préexistant en échec (hors périmètre)** : `critical-paths.spec.ts` « rejoindre un foyer valide le format du token » échoue (chromium + mobile) — `getByLabel('Token d’invitation')` introuvable. Constaté sur la base **36ac215** (avant 35-01, prouvé via worktree temporaire) : préexistant, consigné dans `deferred-items.md`, non corrigé. La chaîne §2.7 est verte par ailleurs : typecheck OK, 1888 tests (236 fichiers), build OK (précache 152 entrées), `check-sql-statique` OK.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (matrice multi-OS) peut consigner le rendu on-device du cold-start `/taches/jour` (D7 ci-dessus) — l'allowlist et la route sont en place.
- Critères roadmap 1 et 2 de la phase : prouvés côté automatisable ; reste la preuve on-device (Plan 02) et l'échec e2e préexistant signalé au `deferred-items.md`.

---
*Phase: 35-deep-links-validation-multi-os*
*Completed: 2026-11-06*
