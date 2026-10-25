---
status: complete
phase: 08-messages
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md, 08-08-SUMMARY.md, 08-09-SUMMARY.md]
started: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Child image send (08-01)
expected: Child account sends an image in a conversation (was 403).
result: pass
note: "Confirmed by user 2026-10-09."

### 2. Edit / sender-only delete (08-02, 08-03)
expected: Edit own message inline; delete own message (modal); admin sees no delete on others' bubbles; whole-thread admin delete intact.
result: pass
note: "Confirmed by user 2026-10-09."

### 3. Leave → archives → retrait (08-03)
expected: Quit lands thread in read-only archives; frozen window stated; remove-from-archives hides it.
result: pass
note: "Confirmed by user 2026-10-09."

### 4. Leave/join announcements + icons (08-04)
expected: "X a quitté / a rejoint" rows in thread; compact icon actions on text line.
result: pass
note: "Confirmed by user 2026-10-09."

### 5. Solo notice (08-06)
expected: Alone in a thread → sober notice at composer, send still works.
result: pass
note: "Confirmed by user 2026-10-09."

### 6. Re-add without archiving (08-07)
expected: Quit, get re-added (no archive step) → back in active thread with join row and full re-read.
result: pass
note: "Confirmed by user 2026-10-09."

### 7. Absence gap hidden (08-08)
expected: Quit, others post, get re-added → gap invisible, pre-leave history kept.
result: pass
note: "Confirmed by user 2026-10-09: 'parfait, cela fonctionne'."

### 8. Pagination (08-02)
expected: Long thread loads paged with "Charger plus", no duplicates on live insert.
result: pass
note: "Confirmed by user 2026-10-09."

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
