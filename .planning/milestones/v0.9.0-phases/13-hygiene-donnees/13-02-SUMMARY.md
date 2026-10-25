---
phase: 13-hygiene-donnees
plan: 02
subsystem: ui
tags: [supabase-storage, signed-urls, file-hygiene, honesty-copy, vitest, e2e]

# Dependency graph
requires:
  - phase: 13-hygiene-donnees
    provides: [13-01 flat-table isolation base (0112 + 0050 proofs)]
provides:
  - Path-stored provider attachments with read-time short-TTL minting and delete-time cleanup
  - Bucket-backed place photos with signed reads and legacy data-URL passthrough
  - Visited-preserving place edits plus honest city-group label
  - Online-first honest copy across landing/sign-in/CGU/privacy/route-error/fidelite
affects: [13-hygiene-donnees plans 03+, prestataires/fidelite/adresses UI, future storage hygiene]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 16192
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [path-stored bucket value with read-time short-TTL minting and fail-closed null, sync fast-path for non-path values with async minting only for real paths, edit payload omitting untouched flags]

key-files:
  created:
    - app/src/modules/prestataires/api.test.ts
    - app/src/modules/adresses/api.test.ts
  modified:
    - app/src/modules/prestataires/api.ts
    - app/src/modules/prestataires/hooks/use-prestataires.ts
    - app/src/modules/prestataires/types.ts
    - app/src/modules/prestataires/prestataires-page.tsx
    - app/src/modules/adresses/api.ts
    - app/src/modules/adresses/hooks/use-adresses.ts
    - app/src/modules/adresses/adresses-page.tsx
    - app/src/modules/adresses/components/place-form-dialog.tsx
    - app/src/modules/fidelite/fidelite-page.tsx
    - app/src/modules/landing/landing-page.tsx
    - app/src/modules/landing/sign-in-page.tsx
    - app/src/modules/landing/terms-page.tsx
    - app/src/modules/landing/privacy-page.tsx
    - app/src/components/ui/route-error.tsx

key-decisions:
  - "Short TTL is 1h (not the 30d used elsewhere): dead links re-mint on next read instead of rotting in rows"
  - "Legacy http(s) and data: values render as-is (no forced re-upload); only new deposits store paths"
  - "Sync fast-path for non-path values: zero added renders in demo/tests, async minting only for real bucket paths"
  - "Place photo upload deferred to save (File travels in PlaceInput): cancelling the dialog leaves no orphan"
  - "Committed on main following project precedent (all prior phase commits live on main)"

patterns-established:
  - "Stored file value: bucket path for new deposits; resolver maps path→fresh signed URL, non-path→as-is, mint failure→null (fail-closed, never a dead link to the DOM)"
  - "Edit payload omits untouched server-owned flags (visited): omission preserves across both adapters (merge-on-update)"

requirements-completed: [D-03, D-04, D-05, D-06, D-07, D-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Provider attachments store bucket paths, render freshly minted short-TTL URLs, and delete their files on removal"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "app/src/modules/prestataires/api.test.ts (7 tests: path-not-URL, orphan cleanup, fresh-mint reads, fail-closed, passthrough, removal cleanup)"
        status: pass
      - kind: unit
        ref: "app/src/modules/prestataires/prestataires-page.test.tsx#rend la pièce jointe sur son URL forgée à la lecture"
        status: pass
    human_judgment: false
  - id: D2
    description: "Place photos upload to the bucket with signed reads; legacy data-URLs keep rendering with the limitation documented"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/adresses/api.test.ts (6 tests: edit-payload omission, path deposit, data-URL passthrough, short-TTL mint, fail-closed, path-only cleanup)"
        status: pass
      - kind: unit
        ref: "app/src/modules/adresses/adresses-page.test.tsx#dépose la photo au bucket et l’affiche sur la carte"
        status: pass
    human_judgment: false
  - id: D3
    description: "Editing a place preserves its visited state; the city-grouped view carries an honest label"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/modules/adresses/adresses-page.test.tsx#préserve « Déjà visité » lors d’une modification (red-checked against the old payload)"
        status: pass
      - kind: unit
        ref: "app/src/modules/adresses/adresses-page.test.tsx#intitule honnêtement le regroupement par ville"
        status: pass
    human_judgment: false
  - id: D4
    description: "No screen promises offline behavior anymore (landing, sign-in, CGU, privacy, route-error, fidelite, prestataires metric)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/landing/landing-page.test.tsx#ne promet plus aucun fonctionnement hors ligne + SignInPage#annonce l’hébergement serveur"
        status: pass
      - kind: unit
        ref: "app/src/modules/landing/terms-page.test.tsx#article 7 honnête + privacy-page.test.tsx#stockage local honnête"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/fidelite-page.test.tsx#affiche une métrique « Enseignes » honnête + prestataires-page.test.tsx#affiche la métrique honnête « Joignables »"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full chain green: typecheck, module suites, production build, existing e2e spec"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "cd app && npm run typecheck && npm test -- prestataires fidelite adresses landing (8 files, 45 tests)"
        status: pass
      - kind: e2e
        ref: "cd app && npm run build && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts (20/20 chromium+mobile)"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h
completed: 2026-10-12
status: complete
---

# Phase 13 Plan 02: File hygiene + honesty sweep Summary

**Path-stored signed attachments with delete-time cleanup, bucket-backed place photos with fail-closed reads, visited-preserving edits, and online-first copy everywhere — proven by 45 Vitest, a production build, and 20/20 e2e**

## Performance

- **Duration:** ~2h
- **Started:** 2026-10-12T10:50:00Z
- **Completed:** 2026-10-12T12:55:00Z
- **Tasks:** 3
- **Files modified:** 19 (2 created, 17 modified)

## Accomplishments

- Provider attachments store the bucket path (never the signed URL), mint 1h URLs at read with fail-closed null, and delete their files on attachment/provider removal — no more 30-day deaths, no orphans
- Place photos upload to `household-media` through the shared storage helper and sign at read; legacy `data:`/signed-URL rows keep rendering as-is with the limitation documented in code (no forced re-upload)
- Editing a place no longer resets `visited` (edit payload omits the flag — RED-checked: the new test fails on the old payload); the city-grouped view is honestly labeled « Vue par ville »
- Copy sweep complete: landing (highlight + FAQ + footer), sign-in, CGU art. 7, privacy §8, route-error, fidelite « Synchronisation Auto » → real distinct-categories count, prestataires « Partagés » → « Joignables » — grep proof, zero offline promises left on the swept screens
- Full chain green: typecheck, 45/45 Vitest across 8 files, production build (PWA precache 88 entries), 20/20 e2e `cadeaux-contacts` on chromium + mobile

## Task Commits

Each task was committed atomically:

1. **Task 1: Attachment hygiene (paths, signed reads, cleanup, bucket photos)** - `2e57d76` (feat)
2. **Task 2: Visited fix, honest labels, copy sweep** - `e82b4be` (feat)
3. **Task 3: Proofs and full-chain gate** - `99d8c8d` (feat)

## Files Created/Modified

- `app/src/modules/prestataires/api.ts` - path store + short-TTL minting + file cleanup (create/remove/provider-remove)
- `app/src/modules/prestataires/api.test.ts` - 7 hygiene proofs (created)
- `app/src/modules/prestataires/hooks/use-prestataires.ts` - read-time URL resolution (sync fast-path + async minting)
- `app/src/modules/prestataires/types.ts` - `url: string | null` (fail-closed) + honest `isShared` comment
- `app/src/modules/prestataires/prestataires-page.tsx` - fail-closed attachment chips + « Joignables » metric
- `app/src/modules/prestataires/components/provider-form-dialog.tsx` - thumbnail only when a URL resolved
- `app/src/modules/adresses/api.ts` - bucket upload + signed reads + `toEditPlacePayload` + `deletePlacePhoto` (replaces `compressPlacePhoto`, deleted)
- `app/src/modules/adresses/api.test.ts` - 6 photo/visited proofs (created)
- `app/src/modules/adresses/hooks/use-adresses.ts` - photo upload at save, old-photo cleanup, visited-preserving edits, photo resolution
- `app/src/modules/adresses/types.ts` - `PlaceInput.photoFile` + honest grouping comment
- `app/src/modules/adresses/adresses-page.tsx` - « Vue par ville » / `CityGroupsView` (`MapView` + `data-view="map"` gone)
- `app/src/modules/adresses/components/place-form-dialog.tsx` - file pick with local preview, upload deferred to save
- `app/src/modules/fidelite/fidelite-page.tsx` - « Enseignes / catégories distinctes » replaces false « Synchronisation Auto »
- `app/src/modules/landing/landing-page.tsx` + `sign-in-page.tsx` + `terms-page.tsx` + `privacy-page.tsx` - online-first honest copy
- `app/src/components/ui/route-error.tsx` - honest reload message (retry + auto-retry on `online` kept: real behavior, not a promise)

## Decisions Made

- Short TTL is 1 h, not the 30 d used by cercle/messages/storage defaults: a dead link re-mints on the next read instead of rotting inside a row for a month.
- Legacy values (`data:`, `http(s)`, `/assets`, `blob:`) render as-is — documented in code, never force-migrated. Only new deposits store paths, so expired-URL resilience holds by construction going forward.
- Sync fast-path for non-path values in both hooks: no added renders in demo/tests (the naive async-always effect pushed cold load past the 1 s `findBy` timeout — found, fixed, documented below).
- Photo upload deferred to save (`PlaceInput.photoFile`): picking a photo then cancelling the dialog leaves no bucket orphan (courses D-05 motif).
- `compressPlacePhoto` deleted (sole caller migrated to the shared `depositHouseholdFile`, which already compresses); zero remaining references.
- Committed on `main` following project precedent (all prior phase commits live on main; single-executor repo, no worktree), same call as 13-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Async-always resolution regressed cold-load past the findBy timeout**
- **Found during:** Task 1 (verify: `npm test -- prestataires adresses` — 4 failed)
- **Issue:** Resolving every attachment/photo through an async effect added a render even when nothing needed minting; cold load crossed the 1 s `findBy` timeout (first test per file failed, warm tests passed; isolated render fine)
- **Fix:** Sync fast-path — non-path values resolve during render, the effect early-returns unless a real bucket path exists; verified 9/9 then kept the shape in both hooks
- **Files modified:** `app/src/modules/prestataires/hooks/use-prestataires.ts`, `app/src/modules/adresses/hooks/use-adresses.ts`
- **Verification:** `npm test -- prestataires adresses` 9/9 green
- **Committed in:** `2e57d76` (Task 1 commit)

**2. [Rule 2 - Missing critical] Privacy page carried the same offline promise**
- **Found during:** Task 2 (grep sweep for `hors.ligne|reconnect|synchronis`)
- **Issue:** Privacy §8 promised « fonctionnement hors ligne (cache, données synchronisées) » — the same lie as the audited lines, on a screen the plan's file list didn't name
- **Fix:** Restated as cache applicatif + jeu de démonstration local, with a test asserting the old copy gone (plan explicitly said « fix all siblings or document »)
- **Files modified:** `app/src/modules/landing/privacy-page.tsx`, `app/src/modules/landing/privacy-page.test.tsx`
- **Verification:** `npm test -- landing` green; sweep grep clean
- **Committed in:** `e82b4be` (Task 2 commit)

**3. [Rule 2 - Missing critical] Task 1/3 proofs needed api-level suites the plan didn't list**
- **Found during:** Task 3 (plan asked for « signed-URL minting + cleanup calls » proofs, but page suites run unconfigured and can't mint)
- **Issue:** Minting, fail-closed, and cleanup-on-removal are only provable with a mocked Supabase client — impossible inside the demo-mode page suites
- **Fix:** New `prestataires/api.test.ts` (7 tests) + `adresses/api.test.ts` (6 tests) in repo mock idioms (`@/lib/supabase/client` hoisted state, `@/lib/data` + `@/lib/storage` mocks)
- **Files modified:** the two new files
- **Verification:** 13/13 green, typecheck clean
- **Committed in:** `99d8c8d` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing-critical)
**Impact on plan:** All three necessary for correctness or proof completeness. No scope creep — no model, RLS, or policy change.

## Issues Encountered

- `sed` round-trip during the RED check rewrote `addPlace` to the edit payload (creation would have lost `visited: false`): caught by re-reading the hook, fixed before committing, covered by the existing « ajoute un lieu » assertion (new places still unvisited).
- First version of the honesty edit dropped an `it(` opening line in two page suites (edit consumed the anchor): caught by typecheck-adjacent read, restored, suites green.
- `storageMocks.createSignedUrl` mock needed an explicit union return type for the fail-closed test — `tsc` (via build) refused the `null` case until typed.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The only new bucket traffic reuses `household-media` with household-prefixed paths under the proven policies (T-13-02 mitigated by path-storage + read-time minting + delete-time cleanup, proven by the new api suites). No package added (T-13-SC clean).

## Known Stubs

None.

## Sweep Residue (deliberately kept, honest as-is)

- `cadeaux/guest-cadeau-page.tsx` « Mode hors ligne » + « reconnectez-vous »: a server-required error state, not a promise — the exchange genuinely needs the server.
- `courses` / `ardoise` / `parametres` « reconnectez-vous / Hors ligne : … » toasts and `DataError`s: online-first refusals (connection required), not queue promises.
- Internal code comments mentioning offline (adapter, dexie, seed, sw, route-preload, use-weather): describe the demo/local fallback accurately, never user-facing.
- `route-error.tsx` comment « précachés par le SW se résolvent même hors ligne »: accurate precache behavior backing the kept auto-retry.
- Legacy `data:` place photos and legacy signed attachment URLs: render as-is, documented in `api.ts` headers + here; unrecoverable once expired (path unknown), never force-migrated.

## Self-Check: PASSED

- FOUND: app/src/modules/prestataires/api.test.ts
- FOUND: app/src/modules/adresses/api.test.ts
- FOUND: 2e57d76, e82b4be, 99d8c8d (in `git log`)
- Working tree clean (only pre-existing untracked `.claude/`, `.gsd/`)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- File hygiene closed for prestataires/adresses; the same path-store + mint-at-read motif is ready to copy to notes/pets/messages/products when their plans land (all still store signed URLs — known, untouched).
- `.planning/` is gitignored in this repo, so this SUMMARY lives on disk at `.planning/phases/13-hygiene-donnees/13-02-SUMMARY.md` only.
- No blockers.

---
*Phase: 13-hygiene-donnees*
*Completed: 2026-10-12*
