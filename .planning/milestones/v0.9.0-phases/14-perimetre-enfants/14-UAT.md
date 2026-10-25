---
status: complete
phase: 14-perimetre-enfants
source: [14-01-SUMMARY.md, 14-02-SUMMARY.md]
started: 2026-10-12T00:00:00Z
updated: 2026-10-12T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Child sees none of the 5 modules
expected: With a child account: no tiles, drawer entries, or dashboard widgets for ardoise/cadeaux/fidelite/prestataires/animaux.
result: pass
note: "Confirmed by user 2026-10-12 (home tiles + side menu checked)."

### 2. Direct URL meets not-allowed page
expected: Child opening a hidden module URL directly sees the sober not-allowed page (never a 404, never silent).
result: pass
note: "Confirmed by user 2026-10-12 (page 'Un espace réservé aux grands' shown)."

### 3. Everything else intact
expected: Messages, contacts, calendrier, courses, tâches and the rest work as before for the child; admin/member views unchanged.
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
