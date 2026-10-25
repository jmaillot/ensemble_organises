---
status: complete
phase: 11-cercle
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md]
started: 2026-10-12T00:00:00Z
updated: 2026-10-12T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Edit own post and comment
expected: Inline edit on own post and own comment saves and cancels cleanly; no edit affordance on others' content.
result: pass
note: "Confirmed by user 2026-10-12, incl. 2nd-account check (each edits own content)."

### 2. Delete own, admin deletes any
expected: Delete own post/comment with modal; admin deletes another's; non-author non-admin sees no delete affordance.
result: pass
note: "Superseded by D-07/11-04 (sender-only, no admin single-delete). Confirmed by user 2026-10-12."

### 3. Raised caps
expected: Long post (~4000) and long comment (~2000) submit; real over-limit still refused.
result: pass
note: "Confirmed by user 2026-10-12."

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
