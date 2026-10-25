---
phase: 01-calendrier
review: 01-REVIEW.md
recorded: 2026-10-06
open: 11 of 11
fixed: 0
skipped: 0
deferred: 0
---

# Phase 01-calendrier: Review Disposition

Advisory ledger — one row per finding, defaulting to `open`. No triage performed in this run; all findings carried forward for `/gsd-secure-phase 01` and future phases.

| Finding | Severity | Title | Disposition | Source |
|---------|----------|-------|-------------|--------|
| WR-01 | warning | 0084 promises a moderation net that PostgreSQL renders inert | open | review |
| WR-02 | warning | D-06 child still sees event/task creation buttons | open | review |
| WR-03 | warning | Vacations ignore the `year` parameter | open | review |
| WR-04 | warning | `resolveCommunCalendarId` matches on name only | open | review |
| WR-05 | warning | One malformed vacation record poisons the entire refresh | open | review |
| IN-01 | info | Cron dispatch sends `{date}`, Edge reads `{year}` | open | review |
| IN-02 | info | Fail-open catch-all has no observable signal | open | review |
| IN-03 | info | Wildcard CORS on secret-authenticated endpoint | open | review |
| IN-04 | info | Vacation helpers in three places — drift risk | open | review |
| IN-05 | info | 0085 trigger INSERT-only — role changes leave gaps | open | review |
| IN-06 | info | Edit dialog memberId late-load recolor race | open | review |
