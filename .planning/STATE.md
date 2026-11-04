---
gsd_state_version: "1.0"
milestone: v1.1
current_phase: 33
current_phase_name: Cache de lecture offline
status: complete_phase_32
stopped_at: Phase 32 exécutée et validée en UAT (7/8, test 7 à rejouer au prochain déploiement)
last_updated: "2026-11-04T17:30:00.000Z"
last_activity: 2026-11-04
last_activity_desc: Phase 32 clôturée — UAT 7 passées, 1 bloquée (release-build), défauts corrigés en session
state_head: f54c4a68d955512381992b1976e26e2f625bd0b5
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-04)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 32 — Install & raccourcis

## Current Position

Phase: 32 (Install & raccourcis) — COMPLETE (UAT 7/8, test 7 à rejouer au prochain déploiement)
Plan: 3 of 3
Status: Phase 32 clôturée — prochaine : 33 (Cache de lecture offline)
Last activity: 2026-11-04 — UAT complète, défauts corrigés (6d78688, b02fde7)

Progress: [█░░░░░░░░░] 25% (1/4 phases v1.1)

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
