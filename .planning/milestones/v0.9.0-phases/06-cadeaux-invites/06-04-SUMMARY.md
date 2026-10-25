---
phase: 06-cadeaux-invites
plan: 04
subsystem: database
tags: [gift-lists, guest-view, photo-url, edge-functions, storage-signed-url, vitest, playwright, rls]

# Dependency graph
requires:
  - phase: 06-01-anonymous-reserve
    provides: guest_view_gift_list / guest_reserve_gift_item RPCs, guest-view/guest-reserve Edge actions, proof suite 0029
  - phase: 06-03-guest-client
    provides: GuestGiftItem + toGuestGiftItem defensive projection, GuestAnonymousView, guest e2e journey + Supabase-less outDir pattern
provides:
  - guest_view_gift_list with per-item url + raw photo_url (migration 0092, forward-only)
  - Proof suite 0032 (url/photo exposure, genuine-state oracle, runtime no-author-leak)
  - Edge guest-view url projection + ephemeral photoUrl minting (1h signed, fail-closed null)
  - Guest row content rendering (lazy photo + external Voir link, http(s)-only guard)
affects: [guest-cadeau-page, gift-list-invite, verify-work, 06-UAT]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 9600
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [RPC renders raw stored values while Edge forges ephemeral servable URLs per request, http(s)-only client render guard for server-supplied URLs]

key-files:
  created:
    - supabase/migrations/0092_guest_view_details.sql
    - supabase/tests/0032_guest_view_details.sql
  modified:
    - supabase/functions/gift-list-invite/index.ts
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/api.test.ts
    - app/src/modules/cadeaux/guest-cadeau-page.tsx
    - app/src/modules/cadeaux/guest-cadeau-page.test.tsx

key-decisions:
  - "RPC emits the raw stored photo value under the column-mirroring key photo_url (never signs): the base stays dumb, the Edge owns all URL minting per request"
  - "Photo resolution has exactly three outcomes — http(s) legacy passes through, bare bucket path gets a 1h signed URL, everything else is null with no log line containing code or URL"
  - "Client render guard admits only http(s) URLs to img/a (defense in depth for T-06-10): the data layer stays neutral, the DOM refuses non-http schemes"
  - "Oracle-state test codes live on one list each because create_gift_list_invite deactivates the previous code of the same list — sharing a list would silently test the wrong state"

patterns-established:
  - "Oracle-state proofs assert the genuine row state (active-but-expired, active-but-exhausted) before asserting the oracle, so a refusal can never pass for the wrong reason"

requirements-completed: [D-05, D-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Guest payload carries url + raw photo value per item with no author identifiers at any tier (D-05/D-07)"
    requirement: "D-05"
    verification:
      - kind: integration
        ref: "supabase/tests/0032_guest_view_details.sql (exact url/photo equality, genuine-state oracle, runtime no-author-leak)"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/api.test.ts#url/photoUrl non-chaînes ou vides + runtime keys assertion"
        status: pass
    human_judgment: false
  - id: D2
    description: "Guest rows render photo + external link when present and degrade cleanly when absent (G-06-1a)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#contenu invité + lien ou photo non-http"
        status: pass
      - kind: e2e
        ref: "E2E_BASE_URL=http://127.0.0.1:4174 npx playwright test e2e/cadeaux-contacts.spec.ts (8/8, Supabase-less outDir)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ephemeral photoUrl minting with fail-closed null and intact D-07 masking (T-06-09/T-06-10)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/api.test.ts#la vue invitée ne porte aucun champ auteur"
        status: pass
      - kind: other
        ref: "sh scripts/deploy-functions.sh + functions service healthy + npm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 55min
completed: 2026-10-07
status: complete
---

# Phase 06 Plan 04: Guest View Details Summary

**Invited visitors now see each gift's link and photo — RPC renders raw values, Edge forges ephemeral signed URLs, guest rows show content with D-07 masking intact**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-10-07T08:10:00Z
- **Completed:** 2026-10-07T09:05:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Migration 0092 extends `guest_view_gift_list` with per-item `url` + raw `photo_url`; oracle, boolean `reserved`, counter, and privileges byte-identical to 0089
- Proof suite 0032: exact url/photo equality, null degradation, oracle over genuine states, runtime no-author-leak on the rendered jsonb, masked owner view unchanged
- Edge `handleGuestView` projects `url` and mints 1h `photoUrl` (http(s) passthrough, signed bucket path, null fail-closed, nothing sensitive logged); redeployed, functions healthy
- Guest rows render a lazy photo thumbnail + external "Voir" anchor (new tab, `rel=noopener`) with an http(s)-only render guard; absent content renders cleanly; reserve flow untouched
- Full chain green: static SQL check, DB suite 35/35, typecheck, cadeaux Vitest 37/37, production build, guest e2e 8/8

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0092 + proof suite 0032** - `f944f76` (feat)
2. **Task 2: Edge handleGuestView url + photoUrl + redeploy** - `d9f5f15` (feat)
3. **Task 3: Guest payload types, projection, row rendering, proof closure** - `49855f1` (feat)

## Files Created/Modified

- `supabase/migrations/0092_guest_view_details.sql` - Forward-only guest-view extension (url + raw photo_url, D-07 intact)
- `supabase/tests/0032_guest_view_details.sql` - Exposure/oracle/no-leak/masked-view proofs
- `supabase/functions/gift-list-invite/index.ts` - url projection + ephemeral photoUrl minting + contract comment
- `app/src/modules/cadeaux/api.ts` - GuestGiftItem url/photoUrl + defensive projection + doc accuracy
- `app/src/modules/cadeaux/api.test.ts` - Runtime keys assertions (pass-through + null-defensive)
- `app/src/modules/cadeaux/guest-cadeau-page.tsx` - Photo + Voir rendering with http(s)-only guard
- `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` - Content-present / content-absent / non-http rendering proofs

## Decisions Made

- RPC emits the raw stored photo value under the column-mirroring key `photo_url` (never signs): the base stays dumb, the Edge owns all URL minting per request
- Photo resolution has exactly three outcomes — http(s) legacy passes through, bare bucket path gets a 1h signed URL, everything else is null with no log line containing code or URL
- Client render guard admits only http(s) URLs to img/a (defense in depth for T-06-10): the data layer stays neutral, the DOM refuses non-http schemes
- Oracle-state test codes live on one list each because `create_gift_list_invite` deactivates the previous code of the same list — sharing a list would silently test the wrong state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Oracle-state codes neutralized each other on one shared list**
- **Found during:** Task 1 (first full DB suite run — valid code h1 refused with `code invalide`)
- **Issue:** `create_gift_list_invite` deactivates the previous active code of the same list on every creation, so h1/h2 created before h3 were already inactive; the oracle tests passed for the wrong reason and the valid-code proof failed outright
- **Fix:** One dedicated list per oracle state (gl32_part/gl32_exp/gl32_exh/gl32_aux) plus a section-0 proof that each code is genuinely in its claimed state (active-but-expired, active-but-exhausted) before the oracle block runs
- **Files modified:** supabase/tests/0032_guest_view_details.sql
- **Verification:** 0032 green alone, then full suite 35/35 green; static check green
- **Committed in:** f944f76 (part of task commit)

**2. [Rule 2 - Missing Critical] Non-http URL schemes refused at render (T-06-10 hardening)**
- **Found during:** Task 3 (rendering organizer-supplied `url`/`photoUrl` into href/src)
- **Issue:** The plan specified an external anchor but no scheme policy — a corrupted `javascript:`/`data:` value would reach the DOM; the Edge passes legacy http(s) through verbatim and only signs bucket paths, so the client is the last gate
- **Fix:** `isServableHttpUrl` guard in GuestAnonymousView (only `^https?://` renders, everything else renders nothing) + dedicated page test proving `javascript:`/`data:` values render no img and no anchor
- **Files modified:** app/src/modules/cadeaux/guest-cadeau-page.tsx, app/src/modules/cadeaux/guest-cadeau-page.test.tsx
- **Verification:** New T-06-10 test green; cadeaux Vitest 37/37
- **Committed in:** 49855f1 (part of task commit)

**3. [Rule 3 - Blocking] `pkill -f` matched the executor's own shell during e2e teardown**
- **Found during:** Task 3 (stopping the disposable preview server after 8/8 e2e)
- **Issue:** `pkill -f "vite preview.*4174"` matched the caller's own command line (which contains the pattern text) and SIGTERMed it before the env-file restore ran
- **Fix:** No code change needed — verified the gitignored `.env.*.local` files were intact in the backup dir (plain `ls` hides dotfiles; `find` located them) and restored them with original content/timestamps; preview server confirmed dead
- **Files modified:** none (operational only)
- **Verification:** `app/.env.development.local` + `app/.env.production.local` present with original 117-byte content; `git status` shows only the 4 intended task files
- **Committed in:** n/a (no code change)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking/operational)
**Impact on plan:** All required for genuine proofs, render-layer security, or workspace integrity. No scope creep — no new packages (T-06-SC clean), 0089/0091 untouched, reserve flow and masking semantics unchanged.

## Issues Encountered

- `sh run.sh logs functions` hangs the shell (log-follow); used `docker ps` health status instead — functions service `healthy`
- test-db.sh tests current DB state without applying migrations: 0092 had to be applied via `scripts/migrate.sh` first (expected flow, not a defect)
- Head-commit guard note: execution ran directly on `main` (no worktree provided by the orchestrator); all prior phase commits in this repo land on `main`, so per-task commits followed that established practice rather than halting

## Known Stubs

None — no placeholders, TODOs, or unwired data introduced. The `null` photoUrl/url paths are intentional fail-closed degradation (proven by tests), not stubs.

## Threat Flags

None beyond the plan's threat model — T-06-09 (url/photoUrl exposure under the existing code gate, short-expiry signed URLs) and T-06-10 (external link/image rendering) are mitigated as specified, plus the additional http(s)-only render guard (deviation 2).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-06-1a closed: a code-link visitor sees name, price, comment, link, and photo per gift, still with boolean-only reservation state and zero author identifiers at RPC, Edge, client, and DOM tiers
- Real-device residual stays with the operator per 06-VALIDATION.md: photo rendering against a real signed URL and real-phone visual check of the guest row (unit/e2e prove structure, not pixels)
- Forward-only chain preserved: 0089/0091 untouched, 0092 applies cleanly in order on top

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-07*

## Self-Check: PASSED
