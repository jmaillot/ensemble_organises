# Phase 15 Plan 04: Voyage-Workspace Journey + Full Chain Summary

---
phase: 15-voyage-espace
plan: 04
subsystem: voyages-e2e-routing
tags: [trips, playwright, demo-journey, tab-isolation, budget-settlement, invite-code, soft-close, react-router, navigation]
status: complete
requires: [15-03-trip-tabs-budget]
provides: [voyage-workspace-e2e, sync-client-navigation, full-chain-evidence]
affects: []
tech-stack:
  added: []
  patterns: [demo-refusal-proves-server-path, sync-router-navigation, click-plus-retry-toggle]
key-files:
  created:
    - app/e2e/voyage-workspace.spec.ts
  modified:
    - app/src/app/router.tsx
decisions:
  - "BrowserRouter useTransitions=false: RR8 default startTransition location updates suspend on the destination lazy chunk and never settle (URL moves, content frozen) — sync updates show the designed RouteFallback then commit"
  - "Edge-gated journey steps (share/leave/close) assert explicit demo refusals instead of mocked successes: no bespoke fixtures per D-06, no silent local bypass; successes proven by SQL 0053 + fake-Edge Vitest suites"
  - "Toggle checkboxes driven by click() + auto-retry expects, not uncheck(): the control is server-state-driven (write + refetch roundtrip) and defeats uncheck's single verification"
metrics:
  duration: ~150min (dont ~90min de root-cause routing)
  completed: 2026-10-12
  tasks: 2
  commits: 2
plan_head_before: 6f0573e3f02a85e1ceebc102b
plan_head_after: b8f3106ca032c2b2a0d627ad49e91fb5b2abfd9e
actuals:
  tokens: 2858
  tasks: 2
  commits: 2
---

## One-liner

Six-test Playwright journey proves the trip workspace end-to-end on desktop + mobile (create → isolation → budget → toggle → server-refusals), after fixing a production router freeze that blocked every client-side navigation; full §2.7 chain green with evidence.

## What was built

**Task 1 — voyage-workspace spec + router fix (3d4a65b, b8f3106).**
`app/e2e/voyage-workspace.spec.ts`, 6 tests × `chromium` + `mobile`
projects (12 runs, real controls only, demo seeds, no fixtures) :

- Création via le dialogue 15-02 avec atterrissage sur `/voyages/:tripId`
  (fiche + `tablist` Infos sélectionné).
- Étanchéité : tâche créée dans un voyage neuf, absente du sibling
  `trip-1` (graine « Réserver le vol ») — et miroir inverse. Les deux sens
  sont falsifiables (un filtre absent ferait échouer l'un ou l'autre).
- Budget : dépenses liées « Vols aller-retour » + « Logement » et
  « Qui doit quoi ? » (panneaux ardoise tels quels, D-09).
- Bascule : rubrique Notes masquée (onglet retiré) puis réaffichée, contenu
  « Passeports » intact (D-05).
- Voies serveur en démo : partage (aucun code forgé, « Aucun code actif »
  + refus explicite), départ (refus, URL et historique intacts),
  fermeture (refus, aucun bandeau « figé »). Le refus explicite prouve
  l'absence d'écriture locale contournée — même idiome que
  `cadeaux-contacts.spec.ts` ; les succès sont prouvés par la suite SQL
  0053 et les suites Vitest à faux serveur frontalier.

**Fix routeur (3d4a65b, Rule 3 — bloquant la tâche 1).** Toute navigation
cliente (`navigate()`, tuiles, `createAndGo`) changeait l'URL mais figeait
le contenu : ~450 rendus non committés/s, aucun morceau demandé, transition
suspendue qui ne se résout jamais (instrumenté : compteur de rendus,
stabilité du loader, absence réseau, double toast exclu). Cause : React
Router 8 applique par défaut les mises à jour de localisation dans une
`startTransition` qui suspend sur le morceau paresseux de destination et ne
s'achève pas (React 19.3). Correctif : `<BrowserRouter
useTransitions={false}>` (prop documentée de cette version exacte) — la
suspension affiche alors le `RouteFallback` prévu puis la page. Vérifié :
2 rendus, H1 « Courses », navigation instantanée.

## Verification (task 2 — full §2.7 chain, all green)

- `cd app && npm run typecheck` → clean.
- `npm test` → **826/826, 102 files**.
- `npm run build` → green (PWA precache 98 entries).
- `npm run test:e2e` (full suite, both projects) → **97 passed,
  5 skipped** (pré-existants, conditionnels au viewport), 0 failed —
  dont 12/12 voyage-workspace.
- `python3 scripts/check-sql-statique.py` → 170 fonctions effectives
  (118 migrations, 57 tests), aucun défaut.
- `sh scripts/test-db.sh` (Docker disponible) → **55 fichiers, tous
  verts**, dont `0053_trip_workspace.sql`.
- `voyages-page.test.tsx` untouched (aucune régression exposée).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Client-side navigation frozen app-wide**
- **Found during:** Task 1 (create landed on URL `/voyages/:id` but rendered
  the list; dashboard tiles inert).
- **Issue:** RR8 `startTransition` location updates + React 19: suspended
  lazy-chunk transition never settles (URL moves, content frozen,
  ~450 uncommitted renders/sec, zero chunk requests). Pre-existing
  (routeur 09-06), invisible jusque-là car l'e2e n'utilisait que `goto`.
- **Fix:** `<BrowserRouter useTransitions={false}>` + comment bloc
  15-04 dans `router.tsx`. One prop, API stable documentée.
- **Files:** `app/src/app/router.tsx`
- **Commit:** 3d4a65b

**2. [Rule 1 - Bug] Toggle checkbox `uncheck()` vs controlled server state**
- **Found during:** Task 1 (click sans bascule vue par `uncheck` alors que
  le toast « masquée » et l'UI prouvaient l'écriture).
- **Fix:** `click()` + `expect().not.toBeChecked()` auto-réessayé (régime
  écriture + relecture) ; garde anti-chargement-vide (onglet Notes visible
  avant le clic — la case est cochée par défaut même `tab_state` nul).
- **Files:** `app/e2e/voyage-workspace.spec.ts`
- **Commit:** b8f3106

**3. [Rule 1 - Bug] Double toast « Edge Function indisponible »**
- **Found during:** Task 1 (strict-mode violation : refus quitter + refus
  figer coexistent 2,8 s).
- **Fix:** attente de disparition du premier toast avant l'étape suivante.
- **Files:** `app/e2e/voyage-workspace.spec.ts`
- **Commit:** b8f3106

**Scope note (not a gap):** share-code/leave/close *successes* are
asserted as explicit demo refusals, not mocked triumphs — the plan forbids
bespoke fixtures (D-06 must-have) and demo has no Edge relay; successes
are covered by SQL 0053 (green this run) + fake-Edge Vitest suites. Same
contract as prior phases' demo specs.

No auth gates. No new packages (T-15-SC clean). Rule 4 never triggered.

## Known Stubs

None — no TODO/FIXME/placeholder in the new spec or fix; every journey
step drives a live control against demo seeds; the no-Edge cases render
explicit refusals, never empty shells.

## Threat Flags

None beyond the plan register: T-15-14 (isolation asserted both
directions, no cross-render), T-15-15 (findBy-style waits, no fixed
sleeps; full suite proves no collateral flakes — 97 passed). The router
fix changes navigation timing only (sync vs transition); no new trust
boundary, no new network/auth surface.

## Self-Check: PASSED

- `app/e2e/voyage-workspace.spec.ts` on disk (194 insertions) ;
  `app/src/app/router.tsx` carries `useTransitions={false}` + comment.
- Commits exist: `3d4a65b` (fix), `b8f3106` (spec) ;
  `git rev-list --count 6f0573e..HEAD` = 2, no deletions.
- `.planning` is gitignored → SUMMARY on disk only (skip noted).
