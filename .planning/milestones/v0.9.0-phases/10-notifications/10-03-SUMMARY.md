---
phase: 10-notifications
plan: 03
subsystem: ui
tags: [react, notifications, tanstack-query, vitest, localstorage]

# Dependency graph
requires:
  - phase: 10-notifications/01
    provides: [Centre de notifications avec magasin de masquage "jusqu'à demain" (croix, Tout-effacer) et lus récents]
provides:
  - Auto-masquage des lignes lues dérivé des transitions lu/non-lu (toutes voies de marquage)
  - Démasquage sur activité fraîche (aucun non-lu avalé par un masque périmé)
  - Suite de régression du centre (10 tests, tous les chemins de marquage)
affects: [10-notifications push-prod, centre-de-notifications-ux]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 3700
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [transition-derived masking (key on unread id-set transitions, never on mark calls)]

key-files:
  created: []
  modified: [app/src/hooks/use-notifications.ts, app/src/hooks/use-notifications.test.tsx]

key-decisions:
  - "Masking keyed on unread→read transitions via an unread id-set effect, not on mark calls — covers click, open-thread auto-mark, and mark-all uniformly"
  - "Unread items list deliberately NOT filtered by mask — hidden means read, never unread (T-10-03)"
  - "Stale pre-existing test expectations (read rows visible in Toutes) updated to the new specified behavior, not kept green as-is"

patterns-established:
  - "Transition-derived masking: effect over computed unread id set, mask newly-read + unmask newly-unread in the same pass, same store and horizon as manual dismiss"

requirements-completed: [D-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Read message/cercle rows auto-hide in unread list and Toutes on every marking path (click, open-thread, mark-all)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#ouvrir le fil cache sa ligne partout (auto-masquage à la lecture)"
        status: pass
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#le marquage au niveau du fil ouvert cache aussi la ligne (sans markItem)"
        status: pass
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#le marquage d'un post au niveau du Cercle cache aussi sa ligne"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fresh activity on a hidden thread unhides it with badge (no silent swallowing); expired mask resurfaces the row"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#une activité fraîche sur un fil masqué le réaffiche avec pastille"
        status: pass
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#un masque expiré réaffiche le rappel (horizon jusqu'à demain)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manual dismiss / Tout-effacer behavior byte-identical (same store, same until-tomorrow horizon)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#expose lus récents, masquage et effacement sans suppression"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-10-12
status: complete
---

# Phase 10 Plan 03: Auto-hide read notification rows Summary

**Transition-derived auto-mask in the notification center: read message/Cercle rows vanish from both tabs on every marking path, fresh activity unmasks, same until-tomorrow store as manual dismiss**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-12T11:45Z
- **Completed:** 2026-10-12T12:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Auto-mask on read: an effect over the computed unread id set (`message:<conv>`, `cercle:<post>`) masks ids that transition unread→read and unmasks ids that transition read→unread or appear newly unread — reusing the existing mask store + `cleanMasked` until-tomorrow horizon, no second mechanism, no marking-semantics change.
- All three marking paths covered uniformly by construction (notification click via `markItem`, open-thread auto-mark via direct feed `markRead`/`markPostRead`, `markAllRead`) since masking keys on state transitions, never on mark calls.
- Regression suite extended to 10 tests: click-path hide, both open-thread paths, mark-all hide, unhide-on-activity with badge + mask removal, expiry resurface, manual flows unchanged.
- Full tier gate green: typecheck + 53 Vitest (notifications + messages) + production build.

## Task Commits

Each task was committed atomically on branch `agent-10-03-notifications-autohide`:

1. **Task 1: Auto-mask on read, unmask on activity** - `898e84d` (feat)
2. **Task 2: Regression tests and gate** - `cd7af25` (test)

**Note:** `.planning/` is gitignored in this repo, so this SUMMARY lives on disk only (verified present); the final docs commit is skipped by design. STATE.md / ROADMAP.md intentionally untouched (orchestrator-owned).

## Files Created/Modified

- `app/src/hooks/use-notifications.ts` - `unmaskIds` callback, `unreadKey` memo (markable unread ids only), transition effect (mask newly-read, unmask newly-unread); unread `items` deliberately not mask-filtered.
- `app/src/hooks/use-notifications.test.tsx` - 2 stale expectations updated to the new specified behavior, 4 new regression tests (message open-thread, cercle open-thread, unhide-on-activity, expiry resurface).

## Decisions Made

- Keyed masking on unread id-set transitions rather than on mark calls: the open-thread paths (`messages-page.tsx`, `cercle-page.tsx`) bypass `markItem` entirely, so call-keying could never cover them uniformly.
- Unread `items` list left unfiltered by mask: with unmask driven by transitions there is a one-frame window where a resurfaced row could still carry a mask entry; never filtering unread rows makes swallowing structurally impossible (threat T-10-03).
- Effect ref initialized without acting on mount: avoids wiping a persisted mask on reload before any transition is observed; expiry backstop (`cleanMasked` on load) still resurfaces stale masks.
- Open-thread tests authenticate as `demoUser`: cross-hook mark propagation travels the server-sync path (`notification_reads` + shared query cache), which requires a session user — same path as production.

## Deviations from Plan

None - plan executed exactly as written. Two test-authoring findings below were issues encountered (diagnosed, not scope changes).

## Issues Encountered

- **Two pre-existing tests encoded the old behavior** (`markAllRead` → rows land in `recentRead`; open-thread row stays in « Toutes »). The plan's must-haves explicitly invert this (auto-hide everywhere), so the assertions were updated to the new specified behavior rather than kept green as-is.
- **Cercle seed comments predate mount, so `post-1` starts read** (`readAt = postReads[id] ?? mountAt`): the mark-all test initially asserted `cercle:post-1` hidden without first making it unread. Fixed by posting a fresh comment before `markAllRead` (deterministic at any hour); same reason the new cercle test posts a fresh comment.
- **Guest-mode marks don't propagate across hook instances** (`useSyncedReads` keeps per-instance local state; server sync needs a user). The two open-thread tests (separate feed hook marking, bell hook observing) therefore run authenticated — mirroring production propagation.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None - no new security surface. The only store touched is the pre-existing local mask store; unmasking is driven exclusively by fresh unread transitions (T-10-03 mitigated by test), and no package was added (T-10-SC).

## Next Phase Readiness

- Lingering-rows report closed: read threads leave both tabs on every marking path; fresh activity always resurfaces with badge.
- Remaining documented limit (per plan): no e2e beyond existing journeys — demo mode cannot deterministically stage multi-actor reads.
- Branch `agent-10-03-notifications-autohide` holds the two task commits, ready for wave merge.

---
*Phase: 10-notifications*
*Completed: 2026-10-12*
