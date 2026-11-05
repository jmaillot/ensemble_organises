---
gsd_state_version: "1.0"
milestone: v1.1
current_phase: 33
current_phase_name: Cache de lecture offline
status: executing
stopped_at: Completed 33-05-PLAN.md
last_updated: "2026-11-04T22:45:00Z"
last_activity: 2026-11-04
last_activity_desc: Plan 33-05 completed (bandeau offline-stale OFFR-02, MIN prudent D-12)
state_head: 2b3c841cc84f81321c27e43c43c78c894f587e3b
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-04)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 33 — Cache de lecture offline

## Current Position

Phase: 33 (Cache de lecture offline) — EXECUTING
Plan: 5 of 5
Status: Executing Phase 33
Last activity: 2026-11-04 — Plan 33-05 completed (bandeau offline-stale OFFR-02, MIN prudent D-12)

Progress: [█░░░░░░░░░] 25% (1/4 phases v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (jalon v1.1)
- Jalon précédent v1.0 : 44 plans, 7 phases

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 32 | 0 | - | - |
| 33 | 4 | - | - |
| 34 | 0 | - | - |
| 35 | 0 | - | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Decisions structurantes v1.1 :

- Ordre de build (consensus recherche) : install/shortcuts (risque nul) → cache lecture → file écriture → validation multi-OS
- WRQ-01 (migration idempotence) précède toute écriture en file — seule dépendance de schéma du jalon
- OFFR-05 (denylist SW API, contrôle statique prouvé sur cas must-fail) livrée dans la même phase que le premier rendu caché
- Rejeu foreground-first : Background Sync = Chromium-only, iOS = cible de design ; enrichissement v1.x seulement
- Aucun store, aucun APK, aucun wrapper natif (arbitrage 2026-11-04) ; pas de retour du mode démo Dexie (D-10)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 34 : décision ouverte store de la file (`idb` vs Dexie `version(3)`) — compatible D-10 dans les deux cas, à trancher en plan-phase (`--research-phase` recommandé)
- Phase 34 : sémantique de rejeu TanStack (`resumePausedMutations` vs outbox pur) — une seule voie de mutation par type d'opération, à trancher en plan
- Phase 35 : comportement iOS réel (éviction ITP ~7 j, install, pas de raccourcis manifest) — MEDIUM confidence, validation on-device
- Phase 34 : comportement purge file à la déconnexion avec N en attente (purge directe vs confirmation) — décision produit de phase

## Session Continuity

Last session: 2026-11-04T22:45:00Z
Stopped at: Plan 33-05 completed (OFFR-02)
Resume file: .planning/phases/33-cache-de-lecture-offline/33-05-SUMMARY.md
