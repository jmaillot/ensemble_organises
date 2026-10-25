---
phase: "05"
source: 05-REVIEW.md
date: "2026-10-05"
---

# Phase 05 — Review Disposition

Verdict: `issues_found` — 0 Critical, 7 Warnings, 5 Info.

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| WR-01 Edge curly-apostrophe matchers | Warning | **fixed** (3afa24a) | Straight quotes, byte-verified |
| WR-02 redeem oracle non-uniform | Warning | **open → backlog** | 128-bit codes + rate limit; low exploitability; "oracle unique" claim softened in code comment? No — documented here only |
| WR-03 masked view dead code | Warning | **fixed** (7b2eadb) | Snapshot + delete enumerate via gift_items_for_list; api.test.ts 4/4 |
| WR-04 D-10 silent skip race | Warning | **open → backlog** | Same family as two fixed races; trigger only when lists unload mid-create |
| WR-05 mirror ignores list/household moves | Warning | **open → backlog** | Orphan mirror visible in former foyer; needs move guard |
| WR-06 offert propagation one-way | Warning | **open → backlog** | Revert leaves purchased=true; needs revert propagation |
| WR-07 duplicated contact types | Warning | **fixed** (cbee52e) | Single declarations, typecheck green |
| Infos (5) | Info | **open → backlog** | Label copy-paste ×3, parsePrice, blob: URLs, admin-only delete, seed refire |

Cross-phase note (out of scope): `ardoise-invite/index.ts:276,278,281` shares the WR-01 curly-quote bug; `PetAttachmentRow` duplicated in database.ts:527,538. Recommend backlog for the ardoise maintenance pass.
