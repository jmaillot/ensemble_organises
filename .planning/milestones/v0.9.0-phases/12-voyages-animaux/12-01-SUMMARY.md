# Phase 12 Plan 01: Realtime publication + isolation proofs Summary

**One-liner:** Trips/pets/pet_records/recipes appended to the Realtime publication with a 50-assertion 0002-style isolation matrix, server only.

## Frontmatter

```yaml
phase: 12-voyages-animaux
plan: 01
subsystem: realtime-isolation
tags: [supabase, realtime, rls, trips, pets, pet-records, recipes, proofs]
requires: [0010-publication, 0007-flat-policies, 0002-style]
provides: [0110-publication, 0048-matrix]
affects: [12-02-client, voyages-realtime, animaux-realtime]
tech-stack:
  added: []
  patterns: [append-only-publication, 0002-actor-matrix, catalog-publication-proof]
key-files:
  created:
    - supabase/migrations/0110_realtime_voyages_animaux.sql
    - supabase/tests/0048_flat_tables_isolation.sql
  modified: []
decisions:
  - "Recipes published with no client: intentional future-proofing, documented in 0110 header"
  - "Publication membership pinned at catalog level (0048 section 0), not as prose"
  - "Committed on main: repo convention is main-branch plan commits, no worktree active"
metrics:
  duration: "~40 min"
  completed: "2026-10-12"
status: complete
actuals:
  tokens: 5400
  tasks: 2
  commits: 2
plan_head_before: b786ef5d256e0406c1a7532d7bc7ef4f2268a5c9
plan_head_after: 5a227db003d3aa5e15a52c116f6449611e8ea1f9
```

## Objective

Un-mute Realtime for voyages/animaux (D-01) and lock flat-table isolation with proofs (D-02) — server only, zero client change.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Prove silent realtime, then publish the missing tables | 9ac27ce | supabase/migrations/0110_realtime_voyages_animaux.sql |
| 2 | Flat-table isolation proof matrix | 5a227db | supabase/tests/0048_flat_tables_isolation.sql |

## Silence mechanism (Task 1 finding)

`use-voyages` subscribes to `trips` via `data.subscribe('trips', …)` → `supabase-adapter` opens a `postgres_changes` channel. But `trips` was absent from `supabase_realtime` (0010 list), so the server never fed the channel: cross-tab/member trip writes arrived only on manual refetch. Proven pre-migration at the catalog: publication held 28 tables, `tasks` present, `trips`/`pets`/`pet_records`/`recipes` absent. Post-`migrate.sh`, all four present.

## Subscriber reconciliation (Task 1)

Every `data.subscribe(table, …)` call site checked against the publication:

- Subscribed **and** published: tasks, messages, conversations, events, task_assignees, posts, post_media, post_comments, post_reactions.
- Subscribed but **unpublished, out of scope** (observation only, untouched): `birthdays` (anniversaires), `contacts` + `contact_lists`, `event_categories` + `event_calendars`, `notification_reads`. Candidates for a later publication pass; not widened here per plan scope.
- `trips` subscribed + now published (this plan). `pets`/`pet_records` have no client subscriber yet — publication precedes the D-07 client subscription (later plan).

## Proof matrix (Task 2)

`0048` in 0002 style (Alice admin A, Bob membre A, Noe enfant A, Carol admin B), per-object bounded assertions, rollback-only:

- **Section 0:** publication membership at the catalog (`count = 4`, positive form) — red without 0110, green with it.
- **Cross-household:** Alice/Carol blind to each other's trips/pets/records/recipes; cross inserts denied; cross update/delete affect 0 rows.
- **Child:** full select on own foyer, all four inserts denied, update/delete 0.
- **Member/admin happy paths:** Bob inserts + updates all four tables (incl. pet_record on own pet); all deletes refused (0 rows); Alice deletes dedicated rows (pet delete cascades its records).
- **Escalation:** self-promotion to admin 0 rows; household_id move refused (WITH CHECK error); foreign pet graft refused both directions (align trigger 23514 / RLS).

**Negative control:** a mutated copy (Alice sees trip_b expected 1) failed as `ASSERTION ÉCHOUÉE (attendu 1, obtenu 0)` — the harness bites; scratch file removed.

## Verification

- `python3 scripts/check-sql-statique.py` → 149 functions, 110 migrations, 52 tests, zero defects.
- `sh scripts/test-db.sh` → 50/50 files green (incl. 0048).
- `sh scripts/migrate.sh` applied 0110 locally (0 tables without RLS); no client files touched (no typecheck/Vitest/build needed).

## Deviations from Plan

None - plan executed exactly as written.

**Process note (not a deviation):** commits landed on `main` — this repo has no worktree active and its entire history is main-branch plan commits; the per-commit HEAD guard's worktree concern does not apply. `.planning/` is gitignored, so this SUMMARY lives on disk only (final metadata commit skipped for planning files).

## Known Stubs

None.

## Threat Flags

None — publication is transport-only; row gating stays in RLS, proven by the 0048 matrix in the same plan (T-12-01 mitigated). No new packages (T-12-SC not applicable).

## Self-Check: PASSED

- FOUND: supabase/migrations/0110_realtime_voyages_animaux.sql
- FOUND: supabase/tests/0048_flat_tables_isolation.sql
- FOUND: 9ac27ce, 5a227db in `git log`
- Commits measured from ledger: 2 (not narrated)
