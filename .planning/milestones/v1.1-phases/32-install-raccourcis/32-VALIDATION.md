---
phase: "32"
slug: "install-raccourcis"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, via `app/` workspace) |
| **Config file** | existing Vitest config in `app/` |
| **Quick run command** | `npm test --prefix app -- --run` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~30 seconds (quick) / ~2 minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --prefix app -- --run`
- **After every plan wave:** Run full suite (`typecheck + test + build`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | INST-01 | — | N/A | unit | `npm test --prefix app -- --run src/lib/pwa` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | INST-03 | — | N/A | build | `npm run build --prefix app` | ✅ | ⬜ pending |
| 32-02-01 | 01 | 1 | INST-02 | — | N/A | unit | `npm test --prefix app -- --run src/components` | ✅ | ⬜ pending |
| 32-03-01 | 01 | 1 | DLNK-01 | — | N/A | unit | `npm test --prefix app -- --run src/lib/pwa` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or fixtures needed — Vitest, React Testing Library and the existing `app/` test setup suffice.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install banner appears and app installs on Android/Chromium | INST-01 | `beforeinstallprompt` is browser-event-driven; untestable in jsdom | Serve built app over HTTPS, open in Chromium/Android, confirm banner then install; verify icon in launcher and standalone launch |
| iOS: instructions panel shown, no banner; Add to Home Screen works | INST-01 | iOS install is a user gesture inside Safari, not an app API | Open on iPhone/Simulator, confirm instructions panel, perform AAFS, verify home-screen icon and standalone session |
| Desktop install (Chrome/Edge/Safari) | INST-01 | OS-level install dialog not scriptable | Install from desktop browser, verify dock/taskbar icon and standalone window |
| Shortcuts appear in launcher long-press | DLNK-01 | Launcher behavior is OS UI | Long-press app icon on Android/installed desktop app, confirm shortcuts target `/taches` and `/courses` |
| SW update does not reload during active session | INST-03 | Requires live session + cross-load timing | Open app, deploy updated SW, verify no forced reload mid-session; verify update on next cold start |
| Icon renders correctly on device home screens (maskable safe zone) | INST-01 | Visual rendering varies per launcher | Check icon on Android adaptive launcher, iOS springboard, desktop taskbar; verify no cropped glyph |
| 30-day "ne plus afficher" bury is respected | INST-02 | localStorage persistence across sessions + days | Set bury flag, reload, confirm banner stays hidden; adjust stored date to verify 30-day expiry restores prompt |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
