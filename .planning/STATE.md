---
gsd_state_version: "1.0"
milestone: v1.1
current_phase: 32
current_phase_name: jalon v1.1, 4 phases
status: planning
stopped_at: Phase 32 context gathered
last_updated: "2026-11-04T11:15:18.849Z"
last_activity: 2026-11-04
last_activity_desc: Roadmap v1.1 créé (17 exigences mappées, 100% couverture)
state_head: a47223ed5437388f21f506c05f02b7fd8d24aaf9
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-04)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** v1.1 « PWA durcie mobile-first » — Phase 32 : Install & raccourcis

## Current Position

Phase: 32 of 35 (Install & raccourcis) — jalon v1.1, 4 phases (32-35)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-11-04 — Roadmap v1.1 créé (17 exigences mappées, 100% couverture)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (jalon v1.1)
- Jalon précédent v1.0 : 44 plans, 7 phases

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 32 | 0 | - | - |
| 33 | 0 | - | - |
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

Last session: 2026-11-04T11:15:18.829Z
Stopped at: Phase 32 context gathered
Resume file: .planning/phases/32-install-raccourcis/32-CONTEXT.md
