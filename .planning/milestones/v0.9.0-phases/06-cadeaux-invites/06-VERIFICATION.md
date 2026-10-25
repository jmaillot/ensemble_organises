---
phase: 06-cadeaux-invites
verified: 2026-10-06T18:00:00Z
status: passed
note: "Canonicalized 2026-10-08 after UAT complete (3/3 pass, 0 issues): supervised-manual items confirmed on prod by user (real-email eyeball + prod TLS send). Covers 06-01→06-03 as verified; gap plans 06-04→06-14 closed under their own gates (see 06-UAT.md, all G-06-* passed)."
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/06-cadeaux-invites/06-01-PLAN.md
  - .planning/phases/06-cadeaux-invites/06-02-PLAN.md
  - .planning/phases/06-cadeaux-invites/06-03-PLAN.md
  - .planning/phases/06-cadeaux-invites/06-01-SUMMARY.md
  - .planning/phases/06-cadeaux-invites/06-02-SUMMARY.md
  - .planning/phases/06-cadeaux-invites/06-03-SUMMARY.md
  - .planning/phases/06-cadeaux-invites/06-CONTEXT.md
  - .planning/phases/06-cadeaux-invites/06-REVIEW.md
  - .planning/phases/06-cadeaux-invites/06-REVIEW-DISPOSITION.md
  - .planning/phases/06-cadeaux-invites/06-REVIEW-FIX.md
  - supabase/migrations/0089_gift_guest_reserve.sql
  - supabase/migrations/0091_guest_reserve_purchased.sql
  - supabase/tests/0029_gift_guest.sql
  - supabase/tests/0031_guest_reserve_purchased.sql
  - supabase/functions/gift-list-invite/index.ts
  - supabase-project/docker-compose.traefik.yml
  - docs/BACKEND.md
  - app/src/modules/cadeaux/api.ts
  - app/src/modules/cadeaux/api.test.ts
  - app/src/modules/cadeaux/types.ts
  - app/src/modules/cadeaux/guest-cadeau-page.tsx
  - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
  - app/src/modules/cadeaux/cadeaux-page.tsx
  - app/src/modules/cadeaux/cadeaux-page.test.tsx
  - app/src/modules/cadeaux/email-template.ts
  - app/src/modules/cadeaux/email-template.test.ts
  - app/src/modules/cadeaux/components/gift-share-dialog.tsx
  - app/e2e/cadeaux-contacts.spec.ts
  - scripts/test-gift-mail.sh
covered_digest: "unavailable — verification.fingerprint tool not present in verifier context; file list above is authoritative"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Scanner un lien à code cadeau sur un téléphone réel, déclarer un nom, réserver un article"
    expected: "La page invitée s'ouvre, la réserve réussit sans compte, l'organisateur voit « Réservé »"
    why_human: "Scan physique impossible par grep ; parcours guest réel hors démo (06-VALIDATION.md)"
  - test: "Ouvrir un vrai e-mail d'invitation reçu (sobre + message personnel) et vérifier expéditeur, lien à code, message"
    expected: "Rendu sobre lisible, lien cliquable, message hôte présent, expéditeur = adresse admin"
    why_human: "Rendu client mail non automatisable (06-VALIDATION.md)"
  - test: "Envoi supervisé via SMTP production (465/TLS) une fois les secrets provisionnés + recréation du service functions"
    expected: "E-mail délivré via le relais prod ; première résolution réelle du npm:nodemailer dans Edge/Deno"
    why_human: "Secrets prod hors repo ; compatibilité runtime Edge prouvée par câblage + preuve transport uniquement"
---

# Phase 06: Cadeaux invites Verification Report

**Phase Goal:** envoi email SMTP + invité anonyme (nom auto-déclaré + réserver, override OQ-1 acté 2026-10-06)
**Verified:** 2026-10-06T18:00:00Z
**Status:** human_needed (all code truths verified; only supervised-manual items remain)
**Re-verification:** No — initial verification (review fixes verified in-tree as part of this pass)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| D-01 | Manager sends a real invitation email server-side only; explicit failure when relay secrets absent | ✓ VERIFIED | `send-email` action user-gated in `gift-list-invite/index.ts` (9 refs); fail-closed `500 Configuration serveur absente` before any send (`:137`), dev-port-2500 exception; six `SMTP_*` mapped with empty defaults in `docker-compose.traefik.yml:108-113`; runbook `docs/BACKEND.md` § Relais SMTP (shared relay, dev vs prod, `recreate functions`, no versioned secrets) |
| D-02 | Email carries exactly the sober content (inviter, household, list, code link, expiry when bounded) | ✓ VERIFIED | `email-template.ts` subject/body builders + 5 Vitest tests; Edge composes same sober shape, expiry only when bounded; `test-gift-mail.sh` exit 0 with all 5 sober markers in read-back body |
| D-03 | Host can type an optional personal message (bounded plain text) at send time | ✓ VERIFIED | `GIFT_HOST_MESSAGE_MAX = 500` shared constant; dialog field with live counter, bound enforced client + Edge (`RangeError` / 400); `stripMailBreaks` on header-interpolated values |
| D-04 | Sending preserves email-share behavior (lecture share created first; account redeem unchanged) | ✓ VERIFIED | Dialog `onEnsureLectureShare` creates the `lecture` share via existing submit path BEFORE invoking send (`gift-share-dialog.tsx:208-213`); server re-verifies management in base via `gift_list_invite_summary` RPC, never downgrades `reservation` (23505 race tolerated) |
| D-05 | Visitor with a valid code link views the list and reserves by declared name, no account (OQ-1 override) | ✓ VERIFIED | Migration `0089` (`reserved_by_name` 1–80 + mutual exclusion) + `guest_view_gift_list` / `guest_reserve_gift_item` RPCs (service_role-only, locks, use_count never consumed); Edge `guest-view`/`guest-reserve` dispatched before user gate; `api.ts` publishable helpers with ≥22 code gate; guest page anonymous branch; proof suites 0029 + Vitest + e2e |
| D-06 | Invalid/expired/exhausted/revoked codes return the single oracle on every guest path; name required 1–80; rate-limited | ✓ VERIFIED | All invalid-code states raise identical `code invalide` → byte-identical 404 translator (`index.ts:352`); per-action rate limits (send 5, view 30, reserve 10); Zod code + name 1–80 gates both tiers; 0029 oracle-uniformity proofs on both RPCs |
| D-07 | Owner sees an anonymously reserved item as reserved without learning the name; guest payloads carry no author identifiers | ✓ VERIFIED | View masks both author columns to NULL for owner (`0089:64-76`); `toGiftItem` sets `reservedByName` via member lookup only (NULL for anonymous) + `heldAnonymously`; runtime `Object.keys` assertion in `api.test.ts:167-171` (never source-text); CR-01 server half: `0091` sets `purchased=true` atomically, proven by 0031 owner-masked read (`purchased` true, authors NULL) |
| D-08 | Organizer releases any reservation in one action; non-manager release refused (negative proof) | ✓ VERIFIED | Client `handleRelease` clears all three columns `{reserved_by: null, purchased: false, reserved_by_name: null}` (`cadeaux-page.tsx:405`); 0031 §6 proves 3-column release of both author forms + re-reserve; 0029 proves non-manager refusal (guard 42501); release button manager-only + modal-confirmed; visitors get no affordance |
| D-09 | No email demanded of guest, no idea proposals, no persistent account; name spoofing accepted + documented | ✓ VERIFIED | Guest page has no email/idea/account surface (only name field + reserve); name memory is cosmetic localStorage prefill only; spoofing limit proven behaviorally in 0029 (two-visitors-same-name confusion assertion) + accepted in threat register T-06-01 |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### CR-01 Complete Fix (both halves hold in current tree)

| Half | Status | Evidence |
|------|--------|----------|
| Client mapping (e73598c + aed271b) | ✓ VERIFIED | `toGiftItem` derives `heldAnonymously` (`types.ts:204`), never exposes declared name; owner badge/release gate on `purchased \|\| heldAnonymously` (`cadeaux-page.tsx:638,647`); member badge shows bare `Réservé` for anonymous holds (`:664`); `handleTogglePurchased` refuses anonymously-held items with `Cet article est déjà réservé.` BEFORE the UPDATE (`:278`) — no more CHECK-violation toast; `reserved_by_name` typed on `GiftItemRow`, no `as unknown` cast remains |
| Server signal (110a68f + fd75118) | ✓ VERIFIED | `0091` replaces `guest_reserve_gift_item` — final UPDATE sets `reserved_by_name + purchased=true` atomically; `0031` proves: signal set with NULL member FK, idempotent replay unchanged, guest payload still boolean-only (no `reserved_by_name` key), owner masked-view row `purchased=true` with NULL authors, 3-column manager release of both forms, freed item re-reservable, member-hold non-regression |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0089_gift_guest_reserve.sql` | Anonymous-author column, guest RPCs, extended mask + guard | ✓ VERIFIED | Substantive (~300 lines); wired via Edge service_role calls; 0029 proofs |
| `supabase/migrations/0091_guest_reserve_purchased.sql` | guest_reserve sets purchased=true (CR-01 server) | ✓ VERIFIED | Substantive; REPLACE of effective definition only, 0089 untouched; committed 110a68f |
| `supabase/tests/0029_gift_guest.sql` | Oracle/masking/release/D-09 proofs | ✓ VERIFIED | Exists; full suite green cited (34/34 incl. 0031) |
| `supabase/tests/0031_guest_reserve_purchased.sql` | CR-01 server proofs | ✓ VERIFIED | Read in full: 17 testkit assertion lines covering signal, idempotence, guest boolean, owner masked view, member non-regression, 3-column releases, re-reserve |
| `supabase/functions/gift-list-invite/index.ts` | guest-view/guest-reserve + send-email + isInviteExpired | ✓ VERIFIED | send-email 9 refs, guest-reserve refs present, `isInviteExpired` Date.parse fail-closed (`:489`), deployed |
| `app/src/modules/cadeaux/api.ts` | Publishable guest helpers + send caller | ✓ VERIFIED | Session-conditional bearer, gates, defensive boolean-only projection, cosmetic storage, no stub patterns |
| `app/src/modules/cadeaux/guest-cadeau-page.tsx` | Anonymous branch | ✓ VERIFIED | Name field 1–80, per-item reserve, idempotent/conflict/oracle distinct, boolean-only render, WR-01 fixed both branches (`:181,188`) |
| `app/src/modules/cadeaux/components/gift-share-dialog.tsx` | Message + share-first send | ✓ VERIFIED | 500-char counter, `onEnsureLectureShare` before send, send requires visible code |
| `app/src/modules/cadeaux/cadeaux-page.tsx` | Release control + CR-01 gates | ✓ VERIFIED | 3-column release, manager-only modal-confirmed, owner/member anonymous-aware badges |
| `app/src/modules/cadeaux/types.ts` | heldAnonymously mapping | ✓ VERIFIED | `heldAnonymously` derived, `reservedByName` NULL for anonymous (D-07) |
| `app/src/modules/cadeaux/email-template.ts` (+ tests) | Sober template helper | ✓ VERIFIED | Bound + break-stripping; 5 Vitest tests |
| `scripts/test-gift-mail.sh` | Attributable Inbucket proof, exit 0/1/2 | ✓ VERIFIED | Present; exit-2 absence path present (4 absence refs) |
| `supabase-project/docker-compose.traefik.yml` | SMTP_* mapping | ✓ VERIFIED | Six vars with empty defaults (`:108-113`) |
| `docs/BACKEND.md` | Relay runbook | ✓ VERIFIED | § Relais SMTP present; no secrets committed |
| Vitest + e2e suites | Guest coverage | ✓ VERIFIED | `cadeaux-page.test.tsx` CR-01 describe (4 runtime assertions); `api.test.ts` masking keys assertion; e2e guest code-gate + offline refusal (spec `:84-96`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Edge guest handlers | service_role-only RPCs | Admin client call, exact name mapping | WIRED | `guest-view`/`guest-reserve` actions → `guest_view_gift_list` / `guest_reserve_gift_item`; privilege lockdown re-emitted in 0091 |
| Edge send-email | lecture-share creation | Share insert before SMTP send | WIRED | Server creates share via dialog-ensured path + in-base management re-check; no send without stored share |
| functions.environment SMTP | Edge runtime reads | `${SMTP_*:-}` mapping | WIRED | Absence → explicit 500 (fail-closed); compose parses |
| Guest page | publishable Edge actions | Sessionless call shape, code-gated | WIRED | Publishable key always, bearer only in session; ≥22 gate before network |
| Share dialog | send-email action | Share-first ordering | WIRED | `onEnsureLectureShare` → `sendGiftListInviteEmail` promise chain |
| Release control | manager-only update path | Guard-enforced, modal-confirmed | WIRED | 3-column UPDATE; 0029 negative proof for forged non-manager writes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| guest-cadeau-page item list | `view.items[].reserved` | `guest_view_gift_list` RPC boolean | Yes — RPC computes from real author columns | ✓ FLOWING |
| cadeaux-page badges | `item.purchased / heldAnonymously` | `gift_items_for_list` masked view + row column | Yes — 0091 signal + real column; owner sees purchased, never names | ✓ FLOWING |
| emailed invitation link | `inviteLink` (caller-supplied URL) | On-device visible code + app origin | Yes — same code the dialog displays | ✓ FLOWING |
| guest declared name | `reserved_by_name` | Visitor input via RPC | Yes — trimmed 1–80, server-validated | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Guest RPC sets purchased + name atomically | 0031 §1 assertion (read, not re-run) | `purchased=true AND reserved_by_name='Mamie' AND reserved_by IS NULL` | ✓ PASS (cited green gate: test-db.sh 34/34 incl. 0031) |
| Owner masked view hides authors, shows signal | 0031 §4 assertion (read, not re-run) | `purchased=true AND reserved_by IS NULL AND reserved_by_name IS NULL` | ✓ PASS (cited green gate) |
| Manager release clears 3 columns | 0031 §6 + `handleRelease` values (read) | Both forms released, item re-reservable | ✓ PASS (cited green gate) |
| Full green gates | Cited without re-run per scope notes | test-db 34/34, static SQL, typecheck, Vitest 575/575, build, e2e 4/4×2, mail proof exit 0 + exit 2 | ✓ PASS (SUMMARY-attested) |

Step 7b heavy re-runs skipped deliberately (Docker-dependent + supervised-manual residual); verification rests on direct code reads above plus SUMMARY-attested gates.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| D-01 | 06-02 | Server-only SMTP send, fail-closed | ✓ SATISFIED | Edge user gate + 500 branches + Compose + runbook |
| D-02 | 06-02/06-03 | Sober template content | ✓ SATISFIED | Helper + tests + Edge template + mail proof |
| D-03 | 06-02/06-03 | Optional host message, bounded | ✓ SATISFIED | 500-char bound both tiers, dialog counter |
| D-04 | 06-02/06-03 | Share-first, redeem unchanged | ✓ SATISFIED | `onEnsureLectureShare` ordering; redeem path untouched |
| D-05 | 06-01/06-03 | Anonymous reserve, no account (OQ-1 override) | ✓ SATISFIED | 0089/0091 + Edge + UI journey |
| D-06 | 06-01/06-03 | Code required, name 1–80, rate-limit, unique oracle | ✓ SATISFIED | 0029 oracle proofs + limits + gates |
| D-07 | 06-01/06-03 | Surprise masking incl. anonymous | ✓ SATISFIED | View NULLs both columns for owner; runtime keys test |
| D-08 | 06-01/06-03 | Organizer releases any hold; non-manager refused | ✓ SATISFIED | 3-column release + 0029 negative proof |
| D-09 | 06-03 | No email/ideas/account; spoofing accepted | ✓ SATISFIED | No such surfaces; D-09 confusion assertion in 0029 |

No orphaned requirements: no REQUIREMENTS.md exists for this phase; D-ids traced from PLAN frontmatter against CONTEXT.md — all 9 covered (D-01…D-04 in 06-02, D-05…D-08 in 06-01, D-02/D-03/D-05…D-09 in 06-03).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX, no console.log implementations, no empty handlers in phase files | — | None — matches are benign (`return null` guards, `placeholder=` input attributes) |
| IN-01/02/03 (REVIEW) | — | Info-only items intentionally left open per disposition | ℹ️ Info | None — documented, out of fix scope |

### Human Verification Required

See frontmatter `human_verification` (3 items): real-phone code-link scan, one-real-email eyeball, supervised production TLS send + first real Edge nodemailer resolution. These are the known residual manual items — NOT gaps.

### Gaps Summary

No gaps. Every must-have (D-01…D-09) holds in the current tree, including both halves of the CR-01 complete fix and all three WR fixes (WR-01 `.catch` on both refetch branches, WR-02 `isInviteExpired` with fail-closed `Date.parse`, WR-03 typed `reserved_by_name` with zero `as unknown` casts remaining). Sibling calendrier commits verified untouched by this phase (task commits list cadeaux files only; 0090/0030 out of scope). Status is `human_needed` solely because three supervised-manual items (physical scan, mail-client rendering, production relay secrets) cannot be proven programmatically.

---

_Verified: 2026-10-06T18:00:00Z_
_Verifier: the agent (gsd-verifier)_
