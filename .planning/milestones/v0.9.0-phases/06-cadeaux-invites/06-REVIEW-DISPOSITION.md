---
phase: 06-cadeaux-invites
source: [06-REVIEW.md, 06-REVIEW-FIX.md]
recorded: 2026-10-06T17:45:00Z
open: 3 of 7
---

# Phase 06: Review Disposition

Ledger of what happened to each finding in `06-REVIEW.md` (1 critical, 3 warning, 3 info).
`fixed` rows verified by execution (typecheck + Vitest + build + test-db + deploy gates);
`open` rows are info-only items intentionally left untouched.

| ID | Title | Severity | Disposition | Source |
|----|-------|----------|-------------|--------|
| CR-01 | Anonymous holds invisible to organizer UI; release unreachable | critical | fixed | Client half: e73598c (+ WR-03 prerequisite aed271b). Server half: 110a68d (migration 0091, guest reserve sets purchased) + fd75118 (proofs 0031, 19 assertions, full suite 34/34 green). |
| WR-01 | Unhandled promise rejection on conflict-path refetch | warning | fixed | 7f93665 — `.catch(() => {})` added; typecheck + cadeaux suite + build green. |
| WR-02 | Expiry check compares ISO strings lexicographically | warning | fixed | a9530ef — `isInviteExpired()` with Date.parse, fail-closed; redeployed, source↔runtime diff clean. |
| WR-03 | TS type drift — GiftItemRow missing reserved_by_name | warning | fixed | aed271b — column added to row type, Pick extended, `as unknown` cast dropped. |
| IN-01 | `supabase!` non-null assertion in callGiftInvite | info | open | Info only — safe by construction today; left untouched per fix scope. |
| IN-02 | Client-side invite-link check weaker than server | info | open | Info only — server authoritative, error surfaces; left untouched per fix scope. |
| IN-03 | Rate-limit fallback key collapses headerless clients | info | open | Info only — pre-existing pattern, low likelihood behind Traefik; left untouched per fix scope. |
