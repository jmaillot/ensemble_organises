---
phase: 12-voyages-animaux
plan: 03
subsystem: voyages-covers
tags: [voyages, trip-cover, storage-bucket, signed-urls, no-orphans, upload-then-create]

# Dependency graph
requires:
  - phase: 12-02
    provides: [cover guard isServableCoverUrl to extend, voyages honesty baseline]
provides:
  - Trip cover file upload via depositHouseholdFile under trips/<id>/
  - Path-stored covers with short-TTL signed reads, fail-closed
  - Upload-then-create with cleanup-on-abort (no orphans)
affects: [12-future, voyages-cover-reads, animaux-fiche]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 7500
  tasks: 2
  commits: 2
plan_head_before: 15dec52
plan_head_after: 753919e

# Tech tracking
tech-stack:
  added: []
  patterns: [upload-then-create-with-cleanup, path-stored-signed-read, file-wins-over-url, fail-closed-cover]

key-files:
  created: []
  modified:
    - app/src/modules/voyages/api.ts
    - app/src/modules/voyages/components/trip-form-dialog.tsx
    - app/src/modules/voyages/hooks/use-voyages.ts
    - app/src/modules/voyages/types.ts
    - app/src/modules/voyages/voyages-page.tsx
    - app/src/modules/voyages/voyages-page.test.tsx

key-decisions:
  - "Upload-then-create orchestrated in use-voyages.save (adresses motif), not in api.createTrip — the hook owns the optimistic row and its rollback"
  - "TripInput.coverFile is an optional File that never reaches the row payload; the resolved coverPhoto is what persists (file wins)"
  - "Hero guard admits blob: for demo previews (contacts parity); data: stays rejected, fail-closed"
  - "Cover preview effect is best-effort try/catch — a refused object URL never breaks the save path"

patterns-established:
  - "Trip covers mirror adresses place photos exactly: isTripCoverPath/tripCoverPathOf/resolveTripCoverUrl/uploadTripCover/deleteTripCover"
  - "Page-level orphan proof via vi.spyOn(data, 'create') rejection — no vi.mock('@/lib/data') needed alongside page tests"

requirements-completed: [D-11]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Trip cover accepts a direct file upload to the household bucket (path stored, signed URL at read) alongside the kept URL field with its http(s) guard"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#téléverse une couverture au bucket et affiche le héros (D-11)"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#couvertures : chemins forgés en URL courte, échec fermé, autres formes intactes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Upload failures surface the standard error copy with no partial row and no orphan file left behind"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#échec du dépôt : erreur dite, aucune ligne, rien à nettoyer"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#échec après dépôt : erreur dite, aucune ligne, fichier nettoyé (pas d’orphelin)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Existing URL covers render exactly as before (non-regression)"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#garde le champ URL intact : sans fichier, aucun dépôt"
        status: pass
      - kind: e2e
        ref: "cd app && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min
completed: 2026-10-12
status: complete
---

# Phase 12 Plan 03: Trip cover upload Summary

**Trip covers upload straight into the household bucket via the shared helper — path stored, short-TTL signed URL minted at read, URL field kept as fallback with file-wins precedence, and every failure cleans up after itself.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-12T16:05Z (approx)
- **Completed:** 2026-10-12T16:35Z (approx)
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Cover file picker in the trip dialog (images only, local preview, file-wins documented in hint and code)
- `trips/<id>/` deposits via `depositHouseholdFile`; the returned path is what persists, the demo blob preview is what persists in demo
- Signed reads at read time (1 h TTL, fail-closed null → no hero), wired into `useVoyages` with the same cancellation discipline as lieux/prestataires
- Upload-then-create ordering with cleanup on abort (create and update), plus old-cover purge on successful replace
- URL fallback fully intact: https URLs store and render as before, zero deposits without a picked file

## Task Commits

Each task was committed atomically:

1. **Task 1: Cover file upload with signed reads and no orphans** - `7cd5f1c` (feat)
2. **Task 2: Proofs and full-chain gate** - `753919e` (test)

`.planning/` is gitignored → SUMMARY on disk only, no metadata commit (per 12-01/12-02 precedent). STATE.md / ROADMAP.md intentionally untouched (dispatcher instruction).

## Files Created/Modified

- `app/src/modules/voyages/api.ts` - `uploadTripCover` / `deleteTripCover` / `resolveTripCoverUrl(s)` / `isTripCoverPath` / `tripCoverPathOf`, 1 h TTL, adresses-mirrored docs
- `app/src/modules/voyages/components/trip-form-dialog.tsx` - file picker with preview, `coverFile` passed through `onSubmit`, file-wins hint
- `app/src/modules/voyages/hooks/use-voyages.ts` - upload-then-create in `save` (effective id doubles as storage folder), cover-URL resolution state, cleanup on abort, old-cover purge on replace
- `app/src/modules/voyages/types.ts` - optional `TripInput.coverFile` (never reaches the row payload)
- `app/src/modules/voyages/voyages-page.tsx` - hero guard admits `blob:` demo previews
- `app/src/modules/voyages/voyages-page.test.tsx` - 6 new tests (upload + hero, URL-only, two failure paths, resolve/path/delete units)

## Decisions Made

- Upload orchestration lives in `useVoyages.save`, not `api.createTrip`: the hook owns the optimistic row, its rollback, and the previous-cover lookup — splitting that across api would duplicate the rollback. Mirrors `use-adresses` exactly.
- `coverFile` never reaches `toTripPayload`: the payload builder picks named scalar fields, so the File can't leak into a row even by accident; only the resolved `coverPhoto` persists.
- Preview effect is best-effort: `URL.createObjectURL` exists-but-throws in the test env, so the effect try/catches and falls back to no preview — the save path never depends on it.
- Orphan proof for the post-deposit row failure uses `vi.spyOn(data, 'create')` rejection rather than `vi.mock('@/lib/data')`, which would have broken every page test in the same file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Read-path resolution needs hook state (`use-voyages.ts`, not in plan files)**
- **Found during:** Task 1 (Cover file upload)
- **Issue:** Storing a bucket path without resolving it at read leaves Supabase-mode covers as unrenderable path strings — the feature would be write-only. The plan's file list (api + dialog) holds the helpers and picker but no read wiring.
- **Fix:** Added `coverUrls` state + resolving effect + `trips` memo substitution in `useVoyages`, mirroring `use-prestataires`/`use-adresses` line for line (cancellation flag, fail-closed `''` → no hero).
- **Files modified:** app/src/modules/voyages/hooks/use-voyages.ts
- **Verification:** voyages Vitest 12/12, typecheck green
- **Committed in:** 7cd5f1c (Task 1 commit)

**2. [Rule 2 - Missing critical] `TripInput` needs the `coverFile` carrier (`types.ts`, not in plan files)**
- **Found during:** Task 1
- **Issue:** The File must travel dialog → `save` without changing the `onSubmit` signature (which would ripple to page + hook). No existing field can carry it.
- **Fix:** One optional field `coverFile?: File | null` with a file-wins doc comment; `EMPTY_TRIP_INPUT` stays valid, `toTripPayload` ignores it by construction.
- **Files modified:** app/src/modules/voyages/types.ts
- **Verification:** typecheck green, URL-only test proves the field stays out of the payload path
- **Committed in:** 7cd5f1c (Task 1 commit)

**3. [Rule 2 - Missing critical] Hero guard must admit `blob:` (`voyages-page.tsx`, not in plan files)**
- **Found during:** Task 1
- **Issue:** In demo mode the stored value for an upload IS the blob preview (helper returns `path: null`). The D-06 guard rejected it → uploaded covers never render in demo, and the "renders the signed hero" proof fails.
- **Fix:** Guard admits `blob:` alongside http(s) and `/…` — same shape as the contacts `photoUrl` schema (`/|https?|blob:`). `data:` stays rejected (no legacy data: trip covers; fail-closed).
- **Files modified:** app/src/modules/voyages/voyages-page.tsx
- **Verification:** guard unit cases extended (blob true), upload test asserts the blob hero background
- **Committed in:** 7cd5f1c (Task 1 commit)

**4. [Rule 1 - Bug] Cover preview effect crashed the test env**
- **Found during:** Task 2 (suite run: 3 failed, 9 passed + 3 unhandled errors)
- **Issue:** `URL.createObjectURL` exists as a function in the test env but THROWS on call — the `typeof` guard passed and the throw unmounted the whole tree (empty `<body/>`, dialog "closed", deposit never called).
- **Fix:** try/catch around the preview forging with fallback to no preview; save path independent of preview by design.
- **Files modified:** app/src/modules/voyages/components/trip-form-dialog.tsx
- **Verification:** suite back to green before new assertions were trusted
- **Committed in:** 753919e (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 missing-critical, 1 bug)
**Impact on plan:** All four required for correctness; no scope creep — no schema, RLS, Storage policy, or dependency changes.

## Issues Encountered

- Ambiguous `/Bergen/` button selector in the upload test (admin delete button `Supprimer le voyage vers Bergen` also matches) → exact card name `Bergen10 — 16 septembre 2027` (spans concatenate without space in the accessible name).
- `data` adapter is chosen at import time from `isSupabaseConfigured`, so the `supabase/client` mock (default `configured: false`) keeps page tests in demo mode while resolve unit tests toggle the flag mid-file with `beforeEach` reset — verified green both ways.

## Verification

- `cd app && npm run typecheck` → green
- `cd app && npm test -- voyages` → 12/12 green (6 pre-existing + 6 new)
- `cd app && npm run build` → green (precache 88 entries)
- `cd app && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts` → 28/28 green (plain preview build; no local `.env*.local` in checkout, 06-03 workaround unnecessary; e2e file unchanged)
- `python3 scripts/check-sql-statique.py` → 150 effective functions / 117 migrations / 56 tests, zero defects (no SQL touched)

## Known Stubs

None. Stub scan over the voyages module found only legitimate input `placeholder` attributes (UX hints, not stub content).

## Threat Flags

None — cover bytes travel the proven household-prefixed helper into `household-media` (0010 policies constrain only the first path segment, so `trips/<id>/` needs no policy change); T-12-03 mitigated by upload-then-create with cleanup-on-abort, proven by the orphan test; no new packages (T-12-SC not applicable).

## Self-Check: PASSED

- FOUND: app/src/modules/voyages/api.ts (`uploadTripCover`, `resolveTripCoverUrl`)
- FOUND: app/src/modules/voyages/components/trip-form-dialog.tsx (file picker)
- FOUND: .planning/phases/12-voyages-animaux/12-03-SUMMARY.md (this file, on disk; `.planning/` gitignored)
- FOUND: 7cd5f1c, 753919e in `git log`
- Commits measured from base 15dec52: 2 (`git rev-list --count 15dec52..HEAD`)
- No untracked leftovers from this plan (`git status` shows only pre-existing `.claude/`, `.gsd/`)

## Next Phase Readiness

- D-11 closed: trip covers are bucket-backed with signed reads like contacts/pets/places.
- Remaining 12-scope (animaux edits/realtime/columns) is 12-02 territory, already shipped; no blockers from this plan.
- Watch item for future phases: `gift-idea-form-dialog.tsx` carries the same unguarded `URL.createObjectURL` preview pattern that crashed here — out of scope for this plan (left untouched), logged for whoever next picks a file in tests.

---
*Phase: 12-voyages-animaux*
*Completed: 2026-10-12*
