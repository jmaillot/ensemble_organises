# Phase 12 Plan 02: Voyages/Animaux honesty + summary columns Summary

**One-liner:** Voyages and animaux made honest at their scope — admin-gated deletes, dead status selector removed, household-named cards, guarded covers, wired record editing, live menagerie, and real pet summary columns replacing the magic row.

## Frontmatter

```yaml
phase: 12-voyages-animaux
plan: 02
subsystem: voyages-animaux-client
tags: [voyages, animaux, admin-gating, realtime, pet-summary-columns, backfill, honesty]
requires: [0110-publication, 0048-matrix]
provides: [0111-columns, 0049-backfill-proofs, honest-voyages-ui, column-backed-animaux]
affects: [12-future, voyages-cover, animaux-fiche]
tech-stack:
  added: []
  patterns: [admin-only-affordance-masking, fail-closed-cover-guard, magic-row-backfill, legacy-row-read-filter]
key-files:
  created:
    - supabase/migrations/0111_pet_summary_columns.sql
    - supabase/tests/0049_pet_summary_columns.sql
    - app/src/modules/animaux/api.test.ts
  modified:
    - app/src/modules/voyages/voyages-page.tsx
    - app/src/modules/voyages/components/trip-form-dialog.tsx
    - app/src/modules/voyages/hooks/use-voyages.ts
    - app/src/modules/voyages/voyages-page.test.tsx
    - app/src/modules/animaux/animaux-page.tsx
    - app/src/modules/animaux/hooks/use-animaux.ts
    - app/src/modules/animaux/api.ts
    - app/src/modules/animaux/types.ts
    - app/src/modules/animaux/components/pet-records-timeline.tsx
    - app/src/modules/animaux/components/pet-attachments-panel.tsx
    - app/src/modules/animaux/animaux-page.test.tsx
    - app/src/types/database.ts
    - app/src/lib/data/seed.ts
    - supabase/tests/0001_schema_contract.sql
decisions:
  - "Cover guard admits root-relative first-party assets plus http(s); strict http-only would blank the demo hero and DEFAULT_TRIP_COVER itself"
  - "Backfill matches type=info AND magic name; a user suivi sharing only the name is neither copied nor deleted"
  - "Fiche reminder Fact reads the column first, nearest real suivi due date as fallback (matches the form field WYSIWYG)"
  - "Legacy magic rows filtered at read (stale local DBs), never re-written; constant kept as the filter key"
  - "formatTripRange 'Dates à définir' fallback kept as defensive total function; now unreachable (NOT NULL + required)"
  - "0001 schema contract updated forward for the effective schema (pets +2 columns, pet_records -1)"
  - "Committed on main: repo convention is main-branch plan commits, no worktree active"
metrics:
  duration: "~12 min"
  completed: "2026-10-12"
status: complete
actuals:
  tokens: 62000
  tasks: 4
  commits: 4
plan_head_before: 5a227db003d3aa5e15a52c116f6449611e8ea1f9
plan_head_after: 8c426d7000c5525fcc1c7c03f10b0f80dfb81283
```

## Objective

Make voyages and animaux honest and complete at their scope (D-03…D-10): deletes the server refuses are no longer offered, the unpersisted status selector is gone, cards name their household scope, covers pass a guard, record editing is wired, the menagerie updates live, and fiche notes/reminder live in real columns — client plus one content migration, on the proven 12-01 gates.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Voyages honesty (gates, dead field, cards, cover) | 6a33fbd | voyages-page.tsx, trip-form-dialog.tsx, use-voyages.ts |
| 2 | Summary columns migration with backfill | 0d880c0 | 0111 migration, 0049 suite, 0001 contract |
| 3 | Animaux client (edit, realtime, deletes, columns, seed) | 6fdbd44 | animaux-page, use-animaux, api, types, timeline, attachments panel, database.ts, seed.ts |
| 4 | Proofs and full-chain gate | 8c426d7 | voyages + animaux suites, new api.test.ts (e2e run, no file change) |

## Task details

**Task 1 — Voyages honesty.** Delete buttons (hero + other-trip cards) render for admins only via `useIsAdmin`; non-admins get no button, not an error toast. Dead `Statut` selector removed from the dialog (schema field, `statusWindows` prefill, `onSelectStatus`, hint); dates stay required (`min(1)`, matching the DB NOT NULL). Cards renamed to household scope ("tâches du foyer à préparer", "membres du foyer"); `tasksQuery` failure surfaces as a `role="status"` line under the prep counter instead of a silent zero. Hero cover passes `isServableCoverUrl` (http(s) or root-relative, exported for tests); invalid yields no hero image, never an error. Optimistic create/rollback, derived statuses, and validation untouched.

**Task 2 — Migration 0111 + suite 0049.** Forward-only: `pets.notes` (text) + `pets.next_reminder_date` (date, nullable), comments on both; dead `pet_records.attachment_url` dropped. Backfill is latest-wins per pet (`record_date`, then `id`) from rows matching `type='info'` AND the magic name, then those rows are deleted. DDL runs before DML so no ALTER follows a DML on the same table (and neither table carries deferred triggers — only expenses tables do, 0008). Suite 0049: schema contract at the catalog (2 columns present, dead column absent), faithful backfill onto the right pet (both fields), bare pet keeps NULLs, magic rows gone (counts clean), produit-kind name collision survives intact with nothing diverted to its fiche. The UPDATE/DELETE in 0049 is a verbatim replay against fresh fixtures (0111 already ran at migrate time) and must stay in sync — stated in the file header.

**Task 3 — Animaux client.** `PetRecordDialog` edit mode wired (`editingRecord` state, `saveRecord(id, …)` → `updatePetRecord`, reset-on-close so "Ajouter" never inherits edit data). Realtime subscribe on `pets` / `pet_records` (0110 publication); post-mutation invalidation kept as backstop. Three deletes (fiche, suivi, pièces) admin-gated — timeline and attachments panel take optional `onDelete`; timeline gains an `onEdit` affordance for all writers (update stays member-level, only delete is admin-only). Fiche notes/reminder read and written through `pets` columns exclusively (`petValues` carries them, `savePetSummary` deleted, `petSummaryOf(pet)`); `nextReminderOf` operates on real rows only; legacy magic rows filtered at read in `usePetRecords`. Demo `pet_attachments` seeded (one ordonnance PDF) so the panel is non-empty; dead `attachment_url` gone from `PetRecordRow`, `toPetRecord`, and seed rows.

**Task 4 — Proofs + full chain.** Voyages suite: household labels, non-admin no-delete (edit still offered), no-status + required-dates, invalid-cover hero without image, guard unit cases. Animaux page suite: seeded attachment shown, column-backed notes/reminder Fact, three gated deletes, edit save + cancel, realtime insert appearing with no manual refetch (seam documented in-test), legacy magic row excluded from the 4-count timeline while column notes still render. New `api.test.ts` (mocked adapter): column writes on create/update with zero `pet_records` traffic, edit path payload, collision filter truth table, no `attachmentUrl` on mapping, fiche removal shape. Full chain: typecheck, 23/23 Vitest (animaux + voyages), production build, e2e `cadeaux-contacts.spec.ts` 20/20 on a plain preview build (no local `.env*.local` in this checkout, so the 06-03 separate-outDir workaround was unnecessary; preview server stopped afterwards, `dist/` untouched by git).

## Verification

- `python3 scripts/check-sql-statique.py` → 149 functions / 111 migrations / 53 tests, zero defects.
- `sh scripts/migrate.sh` → 1 applied (0111), 0 tables without RLS.
- `sh scripts/test-db.sh` → 51/51 green (incl. new 0049; 0001 contract updated forward).
- `cd app && npm run typecheck` → green.
- `cd app && npm test -- animaux voyages` → 3 files, 23/23 green.
- `cd app && npm run build` → green (precache 88 entries).
- `cd app && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts` → 20/20 green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `useVoyages` did not expose the tasks failure**
- **Found during:** Task 1
- **Issue:** Surfacing the `tasksQuery` failure (required by the plan) is impossible from the page alone — the hook swallowed it.
- **Fix:** Added `tasksError` to `VoyagesState` (one field, one line) and a `role="status"` line under the prep counter.
- **Files modified:** app/src/modules/voyages/hooks/use-voyages.ts (not in the plan's file list)
- **Commit:** 6a33fbd

**2. [Rule 2 - Missing critical] Schema contract 0001 pinned the old columns**
- **Found during:** Task 2
- **Issue:** `0001_schema_contract.sql` asserts exact column sets; 0111 intentionally changes them, so the suite went red (1/51).
- **Fix:** Updated the contract forward (pets +notes/+next_reminder_date, pet_records −attachment_url) — the file already tracks prior schema evolutions (e.g. `contact_id`).
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Commit:** 0d880c0

**3. [Rule 2/3 - Blocking knock-ons] Column migration required client type + seed updates**
- **Found during:** Task 3
- **Issue:** Dropping `attachment_url` and adding non-nullable-by-shape `PetRow` fields breaks `PetRecordRow`/`PetRow` consumers (`toPetRecord`, demo seed literals) at typecheck.
- **Fix:** `database.ts` (PetRow +2, PetRecordRow −1), `seed.ts` (dead keys removed, column-backed demo fiche, `pet_attachments` seed + registration).
- **Files modified:** app/src/types/database.ts, app/src/lib/data/seed.ts
- **Commit:** 6fdbd44

### Interpreted (no code change, judgment recorded)

**4. Cover guard admits root-relative paths, not http(s)-only.** Strict `isServableHttpUrl` would blank every first-party cover including the build-time `DEFAULT_TRIP_COVER` (`/assets/…`) and the demo hero. The guard keeps the same fail-closed shape (unknown schemes render nothing, never an error) while admitting `/…` first-party assets. Unit-proven in the voyages suite.

**5. `formatTripRange` "Dates à définir" fallback kept.** It is now unreachable (DB NOT NULL + required dates + no dateless form path — the removed status selector with its "sans dates" hint was that path), but the function stays total as defensive display code for corrupt data rather than gaining a new crash path.

**6. Fiche reminder Fact is column-first with real-row fallback** (`pet.nextReminderDate ?? nextReminderOf(records)`), matching the form field WYSIWYG. Edge semantic change vs pre-0111 (a nearer suivi no longer overrides an explicitly set fiche reminder) is intentional: the displayed value is exactly what the user set.

## Known Stubs

None. Stub scan over created/modified files found only legitimate input `placeholder` attributes (UX hints, not stub content).

## Threat Flags

None — affordances render exactly where the proven admin-only gates allow (server still refuses forged calls, proven in 0048); the cover guard is fail-closed display-only; no new packages (T-12-SC not applicable).

## Self-Check: PASSED

- FOUND: supabase/migrations/0111_pet_summary_columns.sql
- FOUND: supabase/tests/0049_pet_summary_columns.sql
- FOUND: app/src/modules/animaux/api.test.ts
- FOUND: 6a33fbd, 0d880c0, 6fdbd44, 8c426d7 in `git log`
- Commits measured from base 5a227db: 4 (`git rev-list --count 5a227db..HEAD`)
- `.planning/` is gitignored → SUMMARY on disk only (final metadata commit skipped for planning files, per 12-01 precedent)

<worktree_metadata>
{"agent_id":"12-02","worktree_path":"","branch":"","expected_base":""}
</worktree_metadata>
