---
phase: 06-cadeaux-invites
plan: 03
subsystem: ui
tags: [gift-lists, anonymous-reservation, guest-ui, share-dialog, send-email, vitest, playwright, edge-functions]

# Dependency graph
requires:
  - phase: 06-01-anonymous-reserve
    provides: guest_view_gift_list / guest_reserve_gift_item RPCs, guest-view/guest-reserve Edge actions, proof suite 0029
  - phase: 06-02-email
    provides: send-email Edge action, sendGiftListInviteEmail contract, Inbucket proof script
provides:
  - Sessionless guest API helpers (publishable call shape, code/name gates, cosmetic name memory)
  - Anonymous name-and-reserve guest journey (boolean-only states)
  - Host message-and-send dialog (share-first ordering)
  - Organizer release control (manager-only, modal-confirmed)
  - Vitest guest coverage + runtime masking assertion + guest e2e journey
affects: [gift-share-dialog, guest-cadeau-page, cadeaux-page, verify-work]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 15500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [publishable call shape with session-conditional bearer, client-side defensive payload projection mirroring Edge, cosmetic-only localStorage reservation memory]

key-files:
  created: []
  modified:
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/guest-cadeau-page.tsx
    - app/src/modules/cadeaux/components/gift-share-dialog.tsx
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
    - app/src/modules/cadeaux/api.test.ts
    - app/e2e/cadeaux-contacts.spec.ts

key-decisions:
  - "Client-side defensive projection in fetchGuestGiftView (exact mirror of the Edge projection) so the runtime object-keys masking assertion is meaningful rather than a pass-through"
  - "Send requires the on-device visible code (lastCode): without it the dialog refuses — the server never guesses, the e-mail always embeds the shown link"
  - "Release clears both author forms (reserved_by + reserved_by_name) and purchased in one manager UPDATE; non-managers get no affordance, the server guard refuses forged writes (0029)"
  - "Demo-mode e2e covers the code gate + offline refusal (the only deterministic paths without a relay); server-backed reserve paths stay in SQL 0029 + Vitest"

patterns-established:
  - "e2e in this checkout needs a Supabase-less build (local .env*.local hide the demo entry): build to a separate outDir, serve on an unused port, E2E_BASE_URL set, env files restored immediately"
  - "Proof scripts with disposable containers are stopped/removed in the same run (inbucket-proof leaves nothing behind)"

requirements-completed: [D-02, D-03, D-05, D-06, D-07, D-08, D-09]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Anonymous name-and-reserve journey without account (D-05/D-06/D-09)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx (4 guest tests: success, idempotent, conflict-vs-oracle, oracle+retry)"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/api.test.ts (8 guest-helper tests: gates, header shape, error distinctness, cosmetic memory)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts chromium+mobile 4/4 (guest code-gate + offline refusal in demo mode)"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh (full suite 33/33, incl. 0029)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Masked view and guest payload carry no author data in any rendering path (D-07, T-06-08)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "api.test.ts runtime Object.keys assertion (never a source-text match) over a rogue-author payload"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh 0029 (three-role masked-view reads)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Host sends sober e-mail with optional personal message, share-first (D-02/D-03/D-04)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "cd app && npm test -- cadeaux (dialog regressions none; send path shares the tested helpers)"
        status: pass
      - kind: integration
        ref: "sh scripts/test-gift-mail.sh exit 0 (attributed disposable-Inbucket proof, all 5 sober markers)"
        status: pass
    human_judgment: true
    rationale: "Live send-email Edge invocation with a real user JWT stays a supervised manual step (per 06-02 residual); the dialog-to-Edge wiring is review-proven, the transport re-proven here."
  - id: D4
    description: "Organizer releases any reservation in one confirmed action; owner never learns authors (D-08, T-06-07)"
    requirement: "D-08"
    verification:
      - kind: integration
        ref: "sh scripts/test-db.sh 0029 (manager release of both author forms, non-manager refusal)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py (134 effective functions, no defect)"
        status: pass
    human_judgment: false

# Metrics
duration: 33min
completed: 2026-10-06
status: complete
---

# Phase 06 Plan 03: Guest and Host Interfaces plus Proof Closure Summary

**Sessionless guest helpers, anonymous name-and-reserve journey, host message-and-send dialog, manager-only release control — proven by 30 Vitest cadeaux tests, e2e chromium+mobile, full SQL suite 33/33, static check, build, and a re-run Inbucket mail proof**

## Performance

- **Duration:** 33 min
- **Started:** 2026-10-06T16:47:00Z (approx, first task commit 16:49 local)
- **Completed:** 2026-10-06T17:20:00Z (approx)
- **Tasks:** 3
- **Files modified:** 7 (4 source, 3 test/e2e)

## Accomplishments

- `api.ts`: publishable call shape (publishable key always, bearer only in session) beside the untouched session-attached caller; guest view/reserve helpers with client-side code (≥22) and name (1–80, mirror of base CHECK + Edge Zod) gates before any network use; Edge errors propagated verbatim (oracle/conflict/name stay distinct); client-side defensive boolean-only projection mirroring the Edge handler; guarded localStorage name + reserved-ids accessors (cosmetic only, never throw, never proof); `sendGiftListInviteEmail` user-only caller (e-mail pattern, 500-char message bound, link required); stale OPTION-A-only comment block rewritten for the D-05 two-path reality
- `guest-cadeau-page.tsx`: anonymous branch for visitors with a code — declared-name field (1–80, prefilled from storage), per-item reserve through the new helper, idempotent same-name success shown as success, 409 conflict shown distinctly from the 404 oracle, boolean-only states (never author data), cosmetic "Réservé par vous" highlight from device memory only, name persisted on success, server re-read after every reserve; account-holder redeem branch untouched; login link kept as a secondary path
- `gift-share-dialog.tsx`: optional host-message field with live 500-character counter (bound imported from the tested `email-template.ts` constant) + explicit "Envoyer l'invitation" control that creates the `lecture` share first through the existing submit path (via new `onEnsureLectureShare`, dialog stays open) and only then invokes the server send; send requires the on-device visible code; promise-chain + toast idioms reused
- `cadeaux-page.tsx`: `onEnsureLectureShare` implementation (idempotent lecture share, no dialog close); organizer release control — rendered for managers only (owner or admin via `useIsAdmin`), confirmed by `ConfirmDialog` like all destructive actions, clearing both author forms + `purchased` through the manager update path; visitors get no release affordance
- Proofs: 8 new API tests (runtime keys masking, header shapes with/without session, both client gates with zero-fetch assertion, idempotent success, three-error distinctness, never-throw cosmetic memory); guest page suite rewritten to the anonymous journey (6 tests); e2e guest journey added (code gate + offline refusal, chromium + mobile green)
- Full chain green: typecheck, full Vitest 565/565 (79 files), production build, e2e 4/4 × 2 projects, static SQL check, test-db.sh 33/33, mail proof exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Sessionless guest API helpers with cosmetic name memory** - `2f87e75` (feat)
2. **Task 2: Guest page anonymous branch, host send dialog, organizer release** - `7524569` (feat)
3. **Task 3: Vitest plus e2e proofs and full-chain gate** - `fbbf2ad` (test; includes the client projection + comment refresh in api.ts)

**Plan metadata:** (this SUMMARY commit, docs scope — STATE.md/ROADMAP.md owned by orchestrator, untouched)

## Files Created/Modified

- `app/src/modules/cadeaux/api.ts` - Publishable guest helpers, gates, defensive projection, cosmetic memory, send-email caller (modified)
- `app/src/modules/cadeaux/guest-cadeau-page.tsx` - Anonymous name-and-reserve branch (modified)
- `app/src/modules/cadeaux/components/gift-share-dialog.tsx` - Host message + share-first send (modified)
- `app/src/modules/cadeaux/cadeaux-page.tsx` - Release control + ensure-share plumbing (modified)
- `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` - Anonymous journey tests (modified)
- `app/src/modules/cadeaux/api.test.ts` - Guest helper + masking tests (modified)
- `app/e2e/cadeaux-contacts.spec.ts` - Guest demo-mode journey (modified)

## Decisions Made

- Client-side defensive projection mirrors the Edge handler field-for-field, so the runtime `Object.keys` masking test asserts a real boundary ( rogue `reserved_by`/`reserved_by_name` keys in the served payload never reach rendering) instead of testing a pass-through
- The send control refuses without the on-device visible code (`lastCode`): the dialog regenerates to reveal, the e-mail always embeds the shown link, the server never guesses the origin
- Release is a single manager UPDATE clearing both author columns and `purchased`; the UI affordance is manager-only but the authority stays in the 0029-proven server guard
- Demo-mode e2e asserts the deterministic subset only (code gate + explicit offline refusal); the oracle-retry path is covered by Vitest with stubbed fetch, the successful reserve by SQL 0029 — no pertense that demo mode proves the server

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Obsolete account-wall Vitest expectation replaced by the mandated anonymous journey**
- **Found during:** Task 2 (cadeaux suite run — 1 red)
- **Issue:** The pre-existing test asserted visitors are sent to login; the plan's D-05 override mandates the opposite (reserve without account)
- **Fix:** Rewrote the suite to the anonymous journey in Task 3 (success, idempotent-same-name, conflict-vs-oracle, oracle+retry, untouched session branch)
- **Files modified:** app/src/modules/cadeaux/guest-cadeau-page.test.tsx
- **Committed in:** fbbf2ad (part of task commit)

**2. [Rule 2 - Missing Critical] Client-side boolean-only projection added beside the Edge one**
- **Found during:** Task 3 (designing the runtime keys assertion)
- **Issue:** Without a client projection the masking test would assert a pass-through — incapable of failing, therefore not a test (AGENTS.md §2.7F)
- **Fix:** `toGuestGiftItem` in `fetchGuestGiftView`, mirroring the Edge handler exactly; the Vitest keys assertion now guards a real boundary
- **Files modified:** app/src/modules/cadeaux/api.ts
- **Committed in:** fbbf2ad (part of task commit)

**3. [Rule 3 - Blocking] e2e oracle path is not demo-deterministic; demo entry hidden by local env**
- **Found during:** Task 3 (e2e runs — all tests failed at demo entry, including 3 pre-existing)
- **Issue:** (a) gitignored local `.env*.local` bake Supabase config into the preview build, hiding the demo entry; (b) without a backend the guest view can never load, so an oracle-retry e2e cannot pass in demo mode
- **Fix:** Built Supabase-less to a separate outDir (`/tmp/opencode/dist-demo`), served on :4174 with `E2E_BASE_URL` (shared `dist/` and :4173 untouched for the concurrent agent); guest e2e asserts the deterministic subset (short-code button disabled, full-code explicit offline refusal). Env files restored immediately; disposable preview stopped afterwards
- **Files modified:** app/e2e/cadeaux-contacts.spec.ts
- **Verification:** e2e 4/4 chromium + 4/4 mobile
- **Committed in:** fbbf2ad (part of task commit)

**4. [Rule 1 - Bug] Test-only fixes (no product impact)**
- **Found during:** Task 3 (suite runs)
- **Issue:** `user.fill` does not exist in this user-event version; `vi.unstubEnvs` does not exist in Vitest 5; `mockGetSession` inferred type rejected the with-token case
- **Fix:** `user.type`, `vi.unstubAllEnvs`, explicitly typed hoisted mock (`{ access_token: string } | null`)
- **Files modified:** app/src/modules/cadeaux/guest-cadeau-page.test.tsx, app/src/modules/cadeaux/api.test.ts
- **Committed in:** fbbf2ad (part of task commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical, 1 blocking)
**Impact on plan:** All required for correctness or for proofs capable of failing. No scope creep — no new packages (T-06-SC clean), no migration/Edge changes (0089/0029 and mail logic untouched), no idea-proposal/email-collection/account surfaces (D-09 clean).

## Issues Encountered

- A sibling agent works concurrently in the same tree (calendrier files modified, its own e2e running, stale :4173 preview server held). Its files were never staged or touched; all task commits list cadeaux/e2e-cadeaux files only. The stale :4173 server was left running untouched.
- One self-inflicted `pkill -f` matched its own shell (pattern present in the command line) and SIGTERMed it; the :4174 preview died with it, which was the intended end state anyway. No repo harm: env files verified restored, `git status` shows only intended modifications plus the sibling's.
- `npm run test:e2e` (full) was not run to completion: the full-suite command times out in this shared-CPU context and would rebuild shared `dist/` under the sibling. The plan's gate is the guest journey — the cadeaux spec file ran green on both projects (8/8). Full-suite e2e stays a `/gsd-verify-work` concern on a quiet machine.

## User Setup Required

None - no external service configuration required. Production SMTP values and the supervised production TLS send remain with the operator per 06-02 (unchanged residual).

## Next Phase Readiness

- Every 06-01/06-02 control is now reachable from the UI and every negative proof is executable: oracle uniformity (Vitest + 0029), masking (runtime keys + 0029), release refusal (0029), share-first send (dialog), sober transport (mail proof re-run exit 0)
- Manual-only items per 06-VALIDATION.md: phone scan of a real code link, eyeball of one real received e-mail (sober + host message), supervised production SMTP 465/TLS send
- First real Edge `npm:nodemailer` resolution + production send stay supervised manual steps (06-02 residual, unchanged — not attempted)

---

*Phase: 06-cadeaux-invites*
*Completed: 2026-10-06*

## Self-Check: PASSED

- All 7 modified files present on disk; no other files staged or committed by this plan (sibling calendrier work untouched)
- Commits 2f87e75, 7524569, fbbf2ad exist in history with the exact messages above
- Env files `.env.development.local` / `.env.production.local` restored (gitignored, never committed); disposable Inbucket removed; demo preview stopped
- Verify gates re-run and green: typecheck clean, Vitest 565/565, build ok, e2e cadeaux 4/4 × chromium + mobile, static SQL check green, test-db.sh 33/33, test-gift-mail.sh exit 0 with all 5 sober markers
- STATE.md/ROADMAP.md untouched (orchestrator-owned)
