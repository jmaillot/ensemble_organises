---
phase: 06-cadeaux-invites
plan: 02
subsystem: api
tags: [edge-functions, nodemailer, smtp, inbucket, gift-lists, zod, vitest, deno]

# Dependency graph
requires:
  - phase: 06-01-anonymous-reserve
    provides: gift-list-invite Edge base (user gate, rate LIMITS with send-email entry, translateRpcError oracle)
provides:
  - User-only send-email Edge action (fail-closed SMTP, share-first, sober template)
  - SMTP_* functions.environment mapping + relay runbook (dev vs prod regimes)
  - Pure email-template helper with unit tests + attributable Inbucket proof script
affects: [06-03-guest-ui, gift-share-dialog, guest-cadeau-page]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 8390
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: ['npm:nodemailer@10.0.15 (Edge Deno inline specifier, exact pin per official Supabase send-email-smtp example)']
  patterns: [fail-closed SMTP env checks before any send, share-first send ordering, mirrored Edge/Vitest template bounds]

key-files:
  created:
    - app/src/modules/cadeaux/email-template.ts
    - app/src/modules/cadeaux/email-template.test.ts
    - scripts/test-gift-mail.sh
  modified:
    - supabase/functions/gift-list-invite/index.ts
    - supabase-project/docker-compose.traefik.yml
    - docs/BACKEND.md

key-decisions:
  - "send-email reuses gift_list_invite_summary RPC for the in-base management re-check (no new migration: code lookup via service_role read + uniform 404 oracle, management via existing RPC)"
  - "Invite link passed by the dialog as a validated URL param (server never guesses the app origin)"
  - "Template logic mirrored, not shared, between Edge and Vitest helper (deploy copies only the function dir)"
  - "Proof script sends through the real dev relay and reads back the Inbucket v3 per-address API (discovered live: /api/v1/mailbox/{name})"

patterns-established:
  - "SMTP transport: secure derived from port (465), requireTLS on 587, auth omitted when no user — never Boolean(env-string)"
  - "Proof scripts exit 0 proof / 1 failure / 2 explicit absence (absence is said, not silenced)"

requirements-completed: [D-01, D-02, D-03, D-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "send-email Edge action wired, user-gated, deployed (D-01/D-04)"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "sh scripts/deploy-functions.sh && send-email count gate (9 refs)"
        status: pass
    human_judgment: true
    rationale: "Deploy gate proves wiring, not live behavior: a real send needs a user JWT plus provisioned relay (supervised manual step per plan verification). Fail-closed branches are review-proven only."
  - id: D2
    description: "Sober template + bounded host message + header-injection safety (D-02/D-03)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/email-template.test.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Attributable dev-relay proof: real send + read-back with sober content (D-01)"
    requirement: "D-01"
    verification:
      - kind: integration
        ref: "sh scripts/test-gift-mail.sh (exit 0 vs disposable Inbucket 3.0.3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SMTP_* Compose mapping + relay runbook, no secrets committed (D-01)"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "docker compose config parses; python3 scripts/check-sql-statique.py"
        status: pass
    human_judgment: true
    rationale: "Mapping parses and docs forbid versioning values, but live secret provisioning + functions recreate is an operator manual step."

# Metrics
duration: 6min
completed: 2026-10-06
status: complete
---

# Phase 06 Plan 02: Real Invitation Email Summary

**User-only send-email Edge action via nodemailer with fail-closed SMTP, share-first ordering, sober template + bounded host message, relay runbook, and an attributable Inbucket proof**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-06T14:41:34Z
- **Completed:** 2026-10-06T14:47:07Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- Edge `gift-list-invite` gains `send-email` (user-only): Zod email/message-≤500/link-URL validation, fail-closed SMTP checks before any send, uniform `code invalide` oracle, management re-verified in base via `gift_list_invite_summary`, `lecture` share created before sending (never downgrades `reservation`, 23505 race tolerated), sober template with expiry-only-when-bounded, `from` fixed to admin address with host reply-to, `secure` derived from port; deployed to local runtime, count gate 9 refs
- `functions.environment` maps all six `SMTP_*` with empty defaults + `docs/BACKEND.md` relay section (shared relay + quotas, dev 2500-no-auth vs prod 465/587-with-auth, `recreate functions`, residual spam risk accepted, no secrets committed)
- Pure `email-template.ts` helper (subject/body builders, 500-char bound rejection, break-stripping) with 5 Vitest tests green; `test-gift-mail.sh` proves a real dev-relay send with attributed read-back (exit 0 vs disposable Inbucket, exit 2 with explicit absence when unreachable)

## Task Commits

Each task was committed atomically:

1. **Task 1: Edge send-email action, user-only with fail-closed SMTP** - `f0768d7` (feat)
2. **Task 2: SMTP environment mapping plus operator runbook** - `8a779bb` (feat)
3. **Task 3: Testable template helper plus attributable Inbucket proof** - `22027ab` (feat)

**Plan metadata:** (this SUMMARY commit, docs scope — STATE.md/ROADMAP.md owned by orchestrator, untouched)

## Files Created/Modified

- `supabase/functions/gift-list-invite/index.ts` - `send-email` schema + handler + dispatch + nodemailer pin (modified)
- `supabase-project/docker-compose.traefik.yml` - Six `SMTP_*` in `functions.environment` (modified)
- `docs/BACKEND.md` - Shared-relay runbook section (modified)
- `app/src/modules/cadeaux/email-template.ts` - Pure sober-template builders (created)
- `app/src/modules/cadeaux/email-template.test.ts` - Content/bound/injection tests (created)
- `scripts/test-gift-mail.sh` - Attributable dev-relay proof, exit 0/1/2 (created)

## Decisions Made

- No new migration: the in-base management re-check reuses the existing `gift_list_invite_summary` RPC (throws 42501→403 for non-managers); the code itself is looked up via a service_role read with the same uniform-404 oracle as redeem. Keeps 0089/0029 untouched per wave boundary.
- The invite link arrives as a caller-supplied, Zod-URL-validated param (the dialog knows the app origin; the server never guesses hosts).
- Template logic is mirrored between Edge and the Vitest helper (same bound, same stripping) rather than shared code — `deploy-functions.sh` copies only the function directory, so a cross-import would break the deploy.
- Inbucket v3 has no global `/api/v1/mailbox` (404, found by probing): the proof script uses the per-address endpoints `GET /api/v1/mailbox/{name}` + `/{name}/{id}` with `body.text` for the content verdict.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inbucket v3 API shape differs from research assumption**
- **Found during:** Task 3 (proof script run — `/api/v1/mailbox` 404s on v3)
- **Issue:** RESEARCH assumed the v2-style global mailbox endpoint; Inbucket 3.0.3 has no such route (confirmed via container logs "No route matches URI path")
- **Fix:** Probed the live UI bundle + endpoints, switched the script to per-address `GET /api/v1/mailbox/{name}` (list) and `/{name}/{id}` (detail with `body.text`); reachability = HTTP 200 on a probe mailbox
- **Files modified:** scripts/test-gift-mail.sh
- **Verification:** `sh scripts/test-gift-mail.sh` exit 0 with all five sober-content markers present in the read-back body
- **Committed in:** 22027ab (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for the proof script to function at all. No scope creep — no new packages, no UI, no dialog changes.

## Issues Encountered

- Doc-comment splice during the handler insert orphaned the `handleGuestView` header comment (dangling `*` lines); repaired immediately with a scripted exact-match fix and re-verified the file reads cleanly before deploy.
- Disposable Inbucket container (`inbucket-proof`) pulled and run for the live proof, then stopped/removed — nothing lingers in the stack compose (which has no mail service; dev compose only).
- Nodemailer Edge-runtime compatibility is proven by wiring + transport-level proof only: first real Edge invocation (Deno `npm:` resolve) and production TLS send stay supervised manual steps per the plan's verification section.

## User Setup Required

External relay values for production sends. See `docs/BACKEND.md` (relais SMTP : deux familles, un seul relais) for:
- Six `SMTP_*` values to report into `supabase-project/.env` (never versioned), then `sh run.sh recreate functions`
- Dev (2500, no auth) vs prod (465/587, with auth) regimes
- Supervised production TLS send once secrets exist

## Next Phase Readiness

- `send-email` contract `{ listId, email, sent: true }` with errors 400 (validation) / 401 (no session) / 403 (non-manager) / 404 (oracle) / 429 (5-min) / 500 (relay/config) — ready for the dialog Envoyer wiring in 06-03
- Template helper importable by the dialog for client-side preview if wanted (`app/src/modules/cadeaux/email-template.ts`)
- Manual-only items (per 06-VALIDATION.md): sober rendering eyeball of one real message, production SMTP 465/TLS supervised send

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-06*

## Self-Check: PASSED

- Edge file, compose override, BACKEND.md, helper + tests, proof script all present on disk
- Commits f0768d7, 8a779bb, 22027ab exist in history
- Verify gates re-run: deploy + send-email count (9 refs, in sync with runtime), static SQL check green, Vitest cadeaux 19/19 (template 5/5), typecheck clean, proof script exit 0 live + exit 2 absence path
- No secrets in diff (`git diff` shows only `${VAR:-}` mappings and placeholder addresses); STATE.md/ROADMAP.md untouched
