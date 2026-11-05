---
gsd_state_version: "1.0"
milestone: v1.1
current_phase: 34
current_phase_name: File d'écriture & rejeu
status: executing
stopped_at: Completed 34-04-PLAN.md
last_updated: "2026-11-05T14:04:20.081Z"
last_activity: 2026-11-05
last_activity_desc: Phase 34 execution started
state_head: 477c8500f0900b7cb484faad5c48cb3cdad4fe1c
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 14
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-04)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 34 — File d'écriture & rejeu

## Current Position

Phase: 34 (File d'écriture & rejeu) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 34
Last activity: 2026-11-05 — Phase 34 execution started

Progress: [█░░░░░░░░░] 25% (1/4 phases v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (jalon v1.1)
- Jalon précédent v1.0 : 44 plans, 7 phases

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 32 | 0 | - | - |
| 33 | 6 | - | - |
| 34 | 0 | - | - |
| 35 | 0 | - | - |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P02 | 25min | 3 tasks | 7 files |
| Phase 34 P03 | ~30 min | 3 tasks | 4 files |
| Phase 34 P04 | 2h45 | 3 tasks | 16 files |
| Phase 34 P04 | 2h45 | 3 tasks | 16 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Decisions structurantes v1.1 :

- Ordre de build (consensus recherche) : install/shortcuts (risque nul) → cache lecture → file écriture → validation multi-OS
- WRQ-01 (migration idempotence) précède toute écriture en file — seule dépendance de schéma du jalon
- OFFR-05 (denylist SW API, contrôle statique prouvé sur cas must-fail) livrée dans la même phase que le premier rendu caché
- Rejeu foreground-first : Background Sync = Chromium-only, iOS = cible de design ; enrichissement v1.x seulement
- Aucun store, aucun APK, aucun wrapper natif (arbitrage 2026-11-04) ; pas de retour du mode démo Dexie (D-10)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-02 : outbox = query TanStack persistée dans le persister 33 (D-01), enfilage par MutationCache.onError central (D-02, pas de resumePausedMutations) ; WRITE_ALLOWLIST = les 5 tables D-14 exactement ; la garde upfront D-07 ne refuse que HORS LIGNE (en ligne, les modules hors liste fonctionnent) ; portée outbox via setOutboxScopeProvider enregistré par session-store (cycle d'imports évité) ; buster cache v2
- [Phase 34]: Rejeu D-10 : l'entrée terminale reste en file en status failed (jamais rejouée automatiquement) ; le retrait passe par l'action Abandonner du panneau (plan 04) — Substitution mécanique documentée au plan 34-03 ; jamais de boucle ni d'effacement silencieux, prouvé par test
- [Phase 34]: Garde anti-parallélisme module-level sur replayOutbox : une seule passe à la fois — Les déclencheurs D-08 peuvent se rapprocher à la ms ; une seconde passe rejouerait des entrées en vol (T-34-02)
- [Phase 34]: Gate 32-D10 branchée sur useOutbox : isEmpty = pendingCount === 0, échecs terminaux hors comptage (34-04)
- [Phase 34]: Purge D-17 scan-avertir-purger dans le goulot signOut ; changement de foyer purge l'outbox sans confirmation (34-04)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 34 : décision ouverte store de la file (`idb` vs Dexie `version(3)`) — compatible D-10 dans les deux cas, à trancher en plan-phase (`--research-phase` recommandé)
- Phase 34 : sémantique de rejeu TanStack (`resumePausedMutations` vs outbox pur) — une seule voie de mutation par type d'opération, à trancher en plan
- Phase 35 : comportement iOS réel (éviction ITP ~7 j, install, pas de raccourcis manifest) — MEDIUM confidence, validation on-device
- Phase 34 : comportement purge file à la déconnexion avec N en attente (purge directe vs confirmation) — décision produit de phase

## Session Continuity

Last session: 2026-11-05T13:06:36.054Z
Stopped at: Completed 34-04-PLAN.md
Resume file: None
