---
phase: 14-perimetre-enfants
plan: "01"
subsystem: server-perimeter
tags: [rls, enfant, ardoise, cadeaux, fidelite, prestataires, animaux, edge, ora
requires: []
provides: [child-closed-5-modules]
affects: [14-02-client-masking]
tech-stack:
  added: []
  patterns: [rls-deny-enfant, rpc-role-refusal, uniform-oracle, hidden-not-deleted]
key-files:
  created:
    - supabase/migrations/0113_enfant_perimeter.sql
    - supabase/migrations/0114_enfant_perimeter_complement.sql
    - supabase/migrations/0115_enfant_perimeter_settlements.sql
    - supabase/migrations/0116_enfant_perimeter_redeem_restore.sql
    - supabase/tests/0051_enfant_perimeter.sql
    - supabase/functions/gift-list-invite/child-guard.ts
    - supabase/functions/gift-list-invite/child-guard.test.ts
    - supabase/functions/ardoise-invite/child-guard.ts
    - supabase/functions/ardoise-invite/child-guard.test.ts
  modified:
    - supabase/functions/gift-list-invite/index.ts
    - supabase/functions/ardoise-invite/index.ts
    - supabase/tests/0013_media_attachments.sql
    - supabase/tests/0014_provider_attachments.sql
    - supabase/tests/0024_gift_ideas.sql
    - supabase/tests/0048_flat_tables_isolation.sql
    - supabase/tests/0050_flat_tables_guards.sql
decisions:
  - "Gift SELECTs use NOT-enfant (not require-writer): 0033 cross-household share reads preserved, proven green"
  - "member_leave_gift_list unchanged: own-household refused already, cross-household leave is self-share deletion under uniform oracle"
  - "Redundant ardoise_settlement(uuid,text) dropped in 0115: unblocks 0018, all callers rebind to live 4-arg path"
  - "Storage household-media reads unchanged: paths not module-namespaced, restriction would break child Cercle/Messages"
metrics:
  duration: "20m"
  completed: "2026-10-12"
  tasks: 3
  commits: 2
  plan_head_before: 99d8c8d3dd86179e07683288e52029748ba992ed
  plan_head_after: 1c343baefeb0634a91297bc4bacf01f097f252dd
status: complete
actuals:
  tokens: 34368
  tasks: 3
  commits: 2
---

# Phase 14 Plan 01: Fermeture serveur périmètre enfants — Summary

Child role closed out of ardoise/cadeaux/fidélité/prestataires/animaux server-side: RLS reads deny enfant on every listed table, owner/creator-child write branches tightened, Edge user-actions refuse the server-resolved child role — proven per role with happy paths byte-identical, anonymous code paths open, pre-existing rows hidden never deleted.

## Tasks

### Task 1: Prove child access red, then deny reads plus verify writes — DONE (0df0827)

- **RED baseline proven first:** suite 0051 run pre-migration failed on child reads; a throwaway 18-probe inventory (deleted after) showed the child reading **every** listed table (pets through gift views, incl. own private list and ardoise inscription). No table pre-secured on reads; direct writes already denied via `can_write_household` (established by 0002/0009/0024/0048/0050).
- **0113** — SELECT gates: flats/ardoise/expenses/ideas `is_household_member → can_write_household` (D-01 literally); gift_lists/items/shares `can_read_gift_list AND household_role IS DISTINCT FROM 'enfant'` (require-writer would break 0033 cross-household share reads — proven necessity, 0033 stays green). Write tightening: owner/creator-child branches on gift_lists/items/shares + trigger guard + `can_admin_expense`. User-action RPCs refuse enfant (management → writer check 42501; redeem/join → `code invalide` oracle; reserve → `non autorisée`; summaries/settlement → same oracles/messages as outsiders).
- **0114** (Rule 1): `can_read_expense` redefined writer-gated — 0051 caught `expense_participants` still readable (forgotten piece; policy untouched because `parent_household_id` is EXECUTE-revoked for authenticated).
- **0115** (audit finding): `expense_settlement` household path leaked balances to any member — writer check added; enfant refusal moved to the **live** `ardoise_settlement` 4-arg user branch; redundant 2-arg overload **dropped** (it made every 2-arg call ambiguous — 0018 red with and without 0113, green again after the drop, unmodified).
- **0116** (Rule 1 regression, caught by 0027): 0113 had redefined `redeem_gift_list_invite` from stale 0079, losing 0082's `lecture→reservation` upgrade — restored from effective 0082 + enfant check.
- **0051 suite** (~650 lines): Alice/Bob happy paths, kid denied everywhere (reads/writes/RPCs), Carol cross-household, escalation, hidden-not-deleted survival, anonymous guest paths byte-identical, cross-module pins (contacts/birthdays/widgets intact, surprise intact).
- **5 old suites amended minimally** (child-read 1→0 + 0113 refs): 0013, 0014, 0024, 0048, 0050. Places/Adresses untouched (out of perimeter, still child-readable — asserted).

### Task 2: Edge user-actions refuse the child role, anonymous paths intact — DONE (1c343ba)

- Both invite Edges resolve the household role via `service_role` member lookup (never a client claim) and refuse `enfant` **pre-RPC** with byte-identical uniform errors (`child-guard.ts` pure modules, mirrored messages).
- `member-leave` (gift) and `add-guest` (ardoise, already role-checked) intentionally unchanged — documented oracle rationale in code headers.
- Guest/ticket/link-view paths untouched. Vitest contract tests 9/9.
- Redeployed (`deploy-functions.sh`, functions healthy) + **live smoke**: real admin/enfant accounts, genuine JWTs — child `summary/create/create-ardoise` → 403 uniform, admin → 200 pass-through; zero residue (verified 0 rows).

### Task 3: Cross-module leak audit (no new SQL) — DONE (no commit, nothing to commit)

- Audited every consumer of the 5 modules' tables: notification/push/dispatch sources (messages + task/event/routine reminders + birthdays — zero 5-module feeders), `gift_items_for_list` (SECURITY INVOKER, follows RLS — 0 rows pinned), realtime publications (RLS-bound), seeds (hidden automatically), household delete (admin-only RPC), 0081 loyalty refinement (writer-gated).
- Storage `household-media` reads deliberately unchanged (paths not module-namespaced; restriction would break child Cercle/Messages — URLs hidden by table gates instead).
- Client handoff for 14-02: `use-dashboard.ts` activity widget reads expenses (returns 0 rows for children post-0113 — presentation hiding is 14-02's scope); no other module reads the 5 tables.

## Verification

- `python3 scripts/check-sql-statique.py` — 150 functions, 0 défaut.
- `sh scripts/test-db.sh` — **53/53 green** (incl. new 0051, amended 5, repaired 0018/0027).
- `sh scripts/deploy-functions.sh` + `recreate functions` healthy + live Edge smoke (3× 403 child, 2× 200 admin).
- Vitest child-guard: 9/9. No app code touched (14-02 owns client) — full app suite not re-run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Omission] `expense_participants` still readable post-0113**
- **Found during:** Task 1 (0051 run)
- **Issue:** Helper `can_read_expense` left member-scoped; policy untouched on purpose (`parent_household_id` revoked for authenticated).
- **Fix:** 0114 redefines the helper writer-gated (single point, admin/membre identical).
- **Commit:** 0df0827

**2. [Rule 1 - Wrong overload] Settlement refusal landed on dead 2-arg overload**
- **Found during:** Task 1 (0018 red both with and without 0113 — ambiguity since 0069)
- **Issue:** Live user path is the 4-arg `ardoise_settlement`; 2-arg duplicates it and breaks resolution.
- **Fix:** 0115 moves refusal to 4-arg + drops 2-arg; 0018 green unmodified.
- **Commit:** 0df0827

**3. [Rule 1 - Stale base] 0113 regressed 0082 redeem upgrade**
- **Found during:** Task 1 (0027 red)
- **Issue:** `redeem_gift_list_invite` redefined from 0079 instead of effective 0082.
- **Fix:** 0116 restores 0082 + enfant check. Lesson recorded in migration header (redefine from effective definition only).
- **Commit:** 0df0827

**4. [Rule 2 - Missing critical] `expense_settlement` household path leaked to children**
- **Found during:** Task 3 audit (Edge `expense-settlement` resolves any membership incl. enfant)
- **Issue:** Membership-only RPC check returned full balances to children.
- **Fix:** 0115 adds writer assertion (Edge maps 42501 → existing 403, no new oracle).
- **Commit:** 0df0827

### Intentional non-changes (documented, not deferred)

- `member_leave_gift_list`, guest/ticket/link-view RPCs, Storage reads, `gift_items_update` 0083 policy — each with oracle/scope rationale in code headers and §Task 3 above.

## Known Stubs

None.

## Self-Check: PASSED

- All 10 created/modified code files FOUND on disk; both task commits FOUND in history.
- `.planning/` is gitignored in this repo: SUMMARY verified present on disk, commit skipped by design.
- Live DB: 53/53 suites green post-execution; functions service healthy; smoke residue 0 rows.
- STATE.md / ROADMAP.md intentionally untouched (plan success criteria).
