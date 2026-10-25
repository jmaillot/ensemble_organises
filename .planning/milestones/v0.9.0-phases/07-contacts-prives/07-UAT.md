---
status: complete
phase: 07-contacts-prives
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md]
started: 2026-10-08T00:00:00Z
updated: 2026-10-08T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Personal contacts invisible to other members
expected: With a plain member account, another member's dated personal contacts appear neither in Contacts nor in Anniversaires (mirror gated + purged).
result: pass
note: "Confirmed by user 2026-10-08 on rebuilt ubuntu1: 'parfait cela fonctionne bien'."

### 2. Move personal contact to Famille
expected: Owner moves an own personal contact to Famille behind the confirmation modal; it becomes household-visible with its birthday mirrored.
result: pass
note: "Covered by user confirmation 2026-10-08 (full re-test OK)."

### 3. Admin blind to others' personal lists
expected: With the admin account, other members' personal lists are gone from Contacts (OQ-2 amended, owner-only); Famille and own lists unchanged.
result: pass
note: "Covered by user confirmation 2026-10-08 (full re-test OK)."

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — no issues found]
