---
phase: 17-mode-cuisine-recette
review_source: 17-REVIEW.md
review_status: issues_found
created: 2026-10-14
findings:
  critical: 0
  warning: 6
  info: 10
  total: 16
open: 16
fixed: 0
skipped: 0
deferred: 0
---

# Phase 17: Review Disposition

Code review: 16 findings — 0 critical, 6 warning, 10 info.
Consider running: /gsd-code-review 17 --fix

All rows default to `open` (advisory gate — verification proceeds regardless).
Triage guidance: WR-01/WR-02 (storage purity) and WR-03 (cross-fiche flash) are
the highest-value fixes while the code is fresh; WR-04 is a one-line copy fix;
WR-05 (flex-wrap residual on long titles — not live: both Étapes titles are
fixed short strings) and WR-06 (duplicated topbar literals — maintenance risk,
offsets verified exact today) are robustness notes, not live bugs; IN-* are
maintainability notes.

| ID | Title | Severity | Disposition | Source |
|----|-------|----------|-------------|--------|
| WR-01 | readCuisineProgress has a read-with-write side effect and clobbers stored progress when called with empty steps | warning | open | review 17-REVIEW.md |
| WR-02 | Side effects inside state updaters (toggle and prune effect write to localStorage) | warning | open | review 17-REVIEW.md |
| WR-03 | Navigating A→B with cuisine ON flashes the new fiche's cuisine view for one render (and holds the wake lock across fiches) | warning | open | review 17-REVIEW.md |
| WR-04 | OFF-mode description promises drag-reorder to readers who can never reorder (guest + enfant readOnly) | warning | open | review 17-REVIEW.md |
| IN-01 | Stale comment on the wake-lock hookup (member page) | info | open | review 17-REVIEW.md |
| IN-02 | Dead ternary — total === 0 guard after an early return on total === 0 | info | open | review 17-REVIEW.md |
| IN-03 | aria-label on a plain p is ignored by assistive tech | info | open | review 17-REVIEW.md |
| IN-04 | Focusable aria-hidden switch visual (tabIndex -1 inside aria-hidden) | info | open | review 17-REVIEW.md |
| IN-05 | Ref assignment during render in useScreenWakeLock | info | open | review 17-REVIEW.md |
| IN-06 | E2E assumes the demo seed provides zero steps without asserting it | info | open | review 17-REVIEW.md |
| WR-05 | Inline Panel header keeps flex-wrap, long title/action could re-wrap toggle below description at 360px (not live: both Étapes titles fixed short) | warning | open | review 17-REVIEW.md (gap slice) |
| WR-06 | top-[76px]/top-14 duplicate AppShell dimensions as literals, no shared constant (offsets exact today) | warning | open | review 17-REVIEW.md (gap slice) |
| IN-07 | stickyTopClass interpolated raw, typo would silently un-sticky | info | open | review 17-REVIEW.md (gap slice) |
| IN-08 | Mobile overflow proof single-sample pre-image/font load, member route only, no guest e2e case | info | open | review 17-REVIEW.md (gap slice) |
| IN-09 | Test helpers pin Tailwind class substrings, refactors break proofs | info | open | review 17-REVIEW.md (gap slice) |
| IN-10 | Mock/seed scaffolding copy-pasted across 3 suites (~60 lines each), drifting | info | open | review 17-REVIEW.md (gap slice) |
